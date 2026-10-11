import { err, ok, type Result } from 'neverthrow';

import { sourceBranch, type MachineSource } from '../config/schemas.js';
import { syncBlocked } from '../errors.js';
import type { RailError } from '@eddy-works/never-rest';
import {
  gitCurrentBranch,
  gitFetchBranch,
  gitHead,
  gitIsRepo,
  gitLsRemote,
  gitPorcelain,
  gitRemoteNameForUrl,
  runGit,
} from './git.js';

export interface SyncReport {
  readonly sourceId: string;
  readonly status:
    | 'ok'
    | 'skipped_local'
    | 'dirty'
    | 'diverged'
    | 'wrong_branch'
    | 'failed';
  readonly commit?: string;
  readonly detail?: string;
}

/**
 * What to fetch from: a checkout remote whose URL matches the configured
 * `remote` (so tracking refs update), else the configured URL itself, else
 * `origin` for sources registered without a remote.
 */
export async function fetchTarget(source: MachineSource): Promise<string> {
  if (source.remote === undefined) {
    return 'origin';
  }
  return (await gitRemoteNameForUrl(source.path, source.remote)) ?? source.remote;
}

/** URL used for ls-remote, probes and pushes. Machine config is the authority. */
export function remoteUrl(source: MachineSource): string {
  return source.remote ?? 'origin';
}

async function fastForward(source: MachineSource): Promise<SyncReport> {
  const branch = sourceBranch(source);
  const fetched = await gitFetchBranch(source.path, await fetchTarget(source), branch);
  if (fetched.isErr()) {
    return {
      sourceId: source.id,
      status: 'failed',
      detail: fetched.error.message,
    };
  }

  const merge = await runGit(source.path, ['merge', '--ff-only', 'FETCH_HEAD']);
  if (merge.code !== 0) {
    return {
      sourceId: source.id,
      status: 'diverged',
      detail: merge.stderr || merge.stdout || 'not a fast-forward',
    };
  }

  const commit = await gitHead(source.path);
  return { sourceId: source.id, status: 'ok', commit };
}

export async function syncSource(
  source: MachineSource,
): Promise<Result<SyncReport, RailError<'sync_blocked'>>> {
  if (source.kind === 'local') {
    const commit = (await gitIsRepo(source.path))
      ? await gitHead(source.path)
      : undefined;
    return ok({
      sourceId: source.id,
      status: 'skipped_local',
      commit,
      detail: 'Local sources are not fetched',
    });
  }

  if (!(await gitIsRepo(source.path))) {
    return err(syncBlocked('Managed source is not a git repository'));
  }

  const dirty = await gitPorcelain(source.path);
  if (dirty.length > 0) {
    return ok({
      sourceId: source.id,
      status: 'dirty',
      detail: 'Working tree is dirty; left untouched',
    });
  }

  const current = await gitCurrentBranch(source.path);
  if (current !== undefined && current !== sourceBranch(source)) {
    return ok({
      sourceId: source.id,
      status: 'wrong_branch',
      detail: `Checkout is on ${current}, not ${sourceBranch(source)}; left untouched`,
    });
  }

  return ok(await fastForward(source));
}

export async function syncSources(
  sources: readonly MachineSource[],
): Promise<readonly SyncReport[]> {
  const reports: SyncReport[] = [];
  for (const source of sources) {
    const result = await syncSource(source);
    if (result.isErr()) {
      reports.push({
        sourceId: source.id,
        status: 'failed',
        detail: result.error.message,
      });
      continue;
    }
    reports.push(result.value);
  }
  return reports;
}

export interface RemoteHeadCheck {
  readonly local: string | undefined;
  readonly remote: string | undefined;
  readonly moved: boolean;
}

/** Cheap check: does the remote branch tip differ from the local HEAD? */
export async function checkRemoteHead(
  source: MachineSource,
): Promise<Result<RemoteHeadCheck, RailError<'remote_unavailable'>>> {
  const remote = await gitLsRemote(source.path, remoteUrl(source), sourceBranch(source));
  if (remote.isErr()) {
    return err(remote.error);
  }
  const local = await gitHead(source.path);
  return ok({
    local,
    remote: remote.value,
    moved: remote.value !== undefined && remote.value !== local,
  });
}
