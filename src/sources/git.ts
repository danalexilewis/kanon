import { spawn } from 'node:child_process';

export interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const SAFE_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
};

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH };
  return { ...env, ...SAFE_ENV };
}

/** Run git with a fixed argv and a sanitized environment. Hooks disabled. */
export function runGit(
  repo: string,
  args: readonly string[],
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'git',
      ['-c', 'core.hooksPath=/dev/null', '-C', repo, ...args],
      { env: gitEnv() },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => {
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8').trim(),
        stderr: Buffer.concat(stderr).toString('utf8').trim(),
      });
    });
  });
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
