import { spawn } from 'node:child_process';

import { err, ok, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import { remoteUnavailable, writeDenied } from '../errors.js';

export interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GitOptions {
  /** Pass the operator's credential env (HOME, SSH agent, git config) through. */
  readonly credentials?: boolean;
  readonly timeoutMs?: number;
}

const SAFE_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
};

/** Only these reach git for network and commit operations. */
const CREDENTIAL_ENV = [
  'HOME',
  'SSH_AUTH_SOCK',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_NOSYSTEM',
] as const;

export const NETWORK_TIMEOUT_MS = 300_000;

function gitEnv(options: GitOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, ...SAFE_ENV };
  if (options.credentials !== true) {
    return env;
  }
  for (const name of CREDENTIAL_ENV) {
    const value = process.env[name];
    if (value !== undefined && value.length > 0) {
      env[name] = value;
    }
  }
  return env;
}

/** Run git with a fixed argv and a sanitized environment. Hooks disabled. */
export function runGit(
  repo: string,
  args: readonly string[],
  options: GitOptions = {},
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'git',
      ['-c', 'core.hooksPath=/dev/null', '-C', repo, ...args],
      { env: gitEnv(options), stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            child.kill('SIGTERM');
          }, options.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on('error', (error) => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      reject(error);
    });
    child.on('close', (code, signal) => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      const timedOut = signal === 'SIGTERM' && options.timeoutMs !== undefined;
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8').trim(),
        stderr: timedOut
          ? `git timed out after ${options.timeoutMs}ms`
          : Buffer.concat(stderr).toString('utf8').trim(),
      });
    });
  });
}

/** Network operations: credentials passed through, bounded by a timeout. */
export function runGitNetwork(repo: string, args: readonly string[]): Promise<GitResult> {
  return runGit(repo, args, { credentials: true, timeoutMs: NETWORK_TIMEOUT_MS });
}

export async function gitHead(repo: string): Promise<string | undefined> {
  const result = await runGit(repo, ['rev-parse', 'HEAD']);
  if (result.code !== 0) {
    return undefined;
  }
  return result.stdout;
}

export async function gitIsRepo(repo: string): Promise<boolean> {
  const result = await runGit(repo, ['rev-parse', '--is-inside-work-tree']);
  return result.code === 0 && result.stdout === 'true';
}

export async function gitPorcelain(repo: string): Promise<string> {
  const result = await runGit(repo, ['status', '--porcelain']);
  return result.code === 0 ? result.stdout : 'status-failed';
}

export async function gitCurrentBranch(repo: string): Promise<string | undefined> {
  const result = await runGit(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  return result.code === 0 && result.stdout.length > 0 ? result.stdout : undefined;
}

function normalizeRemoteUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\.git$/, '');
}

/**
 * Name of a git remote in the checkout whose URL matches `url`, so fetches
 * also update its remote-tracking ref. Undefined when none matches.
 */
export async function gitRemoteNameForUrl(
  repo: string,
  url: string,
): Promise<string | undefined> {
  const result = await runGit(repo, ['config', '--get-regexp', '^remote\\..*\\.url$']);
  if (result.code !== 0) {
    return undefined;
  }
  const wanted = normalizeRemoteUrl(url);
  for (const line of result.stdout.split('\n')) {
    const [key, value] = line.split(/\s+/, 2);
    if (key === undefined || value === undefined) {
      continue;
    }
    if (normalizeRemoteUrl(value) === wanted) {
      return key.replace(/^remote\./, '').replace(/\.url$/, '');
    }
  }
  return undefined;
}

/** Tip of `refs/heads/<branch>` on the remote, or undefined if the branch is absent. */
export async function gitLsRemote(
  repo: string,
  remote: string,
  branch: string,
): Promise<Result<string | undefined, RailError<'remote_unavailable'>>> {
  const result = await runGitNetwork(repo, ['ls-remote', remote, `refs/heads/${branch}`]);
  if (result.code !== 0) {
    return err(remoteUnavailable(result.stderr || 'ls-remote failed'));
  }
  const line = result.stdout.split('\n').find((entry) => entry.length > 0);
  return ok(line?.split(/\s+/)[0]);
}

/**
 * Probe push access with `git push --dry-run`. Opening receive-pack needs
 * write permission on hosted forges, and a dry run sends no objects. The
 * probe cannot see branch protection; a real push can still be rejected.
 */
export async function gitProbeWrite(
  repo: string,
  remote: string,
  branch: string,
): Promise<Result<void, RailError<'write_denied'>>> {
  const result = await runGitNetwork(repo, [
    'push',
    '--dry-run',
    '--porcelain',
    remote,
    `HEAD:refs/heads/${branch}`,
  ]);
  const connected = result.stdout.split('\n').some((line) => line.startsWith('To '));
  if (result.code === 0 || connected) {
    return ok(undefined);
  }
  return err(writeDenied(result.stderr || 'push --dry-run failed'));
}

/** Fetch one branch from `remote` and return the fetched commit. */
export async function gitFetchBranch(
  repo: string,
  remote: string,
  branch: string,
): Promise<Result<string, RailError<'remote_unavailable'>>> {
  const fetched = await runGitNetwork(repo, ['fetch', '--no-tags', remote, branch]);
  if (fetched.code !== 0) {
    return err(remoteUnavailable(fetched.stderr || fetched.stdout || 'fetch failed'));
  }
  const head = await runGit(repo, ['rev-parse', 'FETCH_HEAD']);
  if (head.code !== 0) {
    return err(remoteUnavailable('fetch did not record FETCH_HEAD'));
  }
  return ok(head.stdout);
}

export interface PushOutcome {
  readonly status: 'pushed' | 'non_fast_forward' | 'rejected';
  readonly detail: string;
}

/** Push HEAD to `refs/heads/<branch>`. Never forces. */
export async function gitPush(
  repo: string,
  remote: string,
  branch: string,
): Promise<PushOutcome> {
  const result = await runGitNetwork(repo, [
    'push',
    '--porcelain',
    remote,
    `HEAD:refs/heads/${branch}`,
  ]);
  const detail = [result.stdout, result.stderr].filter((part) => part.length > 0).join('\n');
  if (result.code === 0) {
    return { status: 'pushed', detail };
  }
  if (/\[rejected\]|non-fast-forward|fetch first/.test(detail)) {
    return { status: 'non_fast_forward', detail };
  }
  return { status: 'rejected', detail };
}

export async function gitWorktreeAdd(
  repo: string,
  dir: string,
  commit: string,
): Promise<GitResult> {
  return runGit(repo, ['worktree', 'add', '--detach', dir, commit]);
}

export async function gitWorktreeRemove(repo: string, dir: string): Promise<void> {
  await runGit(repo, ['worktree', 'remove', '--force', dir]);
  await runGit(repo, ['worktree', 'prune']);
}
