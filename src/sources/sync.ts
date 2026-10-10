import { err, ok, type Result } from 'neverthrow';

import type { MachineSource } from '../config/schemas.js';
import { syncBlocked } from '../errors.js';
import type { RailError } from '@eddy-works/never-rest';
import { gitHead, gitIsRepo, gitPorcelain, runGit } from './git.js';

export interface SyncReport {
  readonly sourceId: string;
  readonly status: 'ok' | 'skipped_local' | 'dirty' | 'diverged' | 'failed';
  readonly commit?: string;
  readonly detail?: string;
}

async function fastForward(source: MachineSource): Promise<SyncReport> {
  const fetch = await runGit(source.path, ['fetch', 'origin']);
  if (fetch.code !== 0) {
    return {
      sourceId: source.id,
      status: 'failed',
      detail: fetch.stderr || fetch.stdout || 'fetch failed',
    };
  }

  const branch = source.branch ?? 'main';
  const merge = await runGit(source.path, ['merge', '--ff-only', `origin/${branch}`]);
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
