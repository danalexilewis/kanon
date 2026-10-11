import {
  indexesContainingSource,
  type MachineConfig,
  type MachineSource,
} from '../config/schemas.js';
import { loadSourceManifest } from '../config/source-manifest.js';
import { scanSourceDocuments } from '../core/documents.js';
import { loadCatalogue } from '../retrieval/catalogue.js';
import { updateIndex, type IndexUpdateReport } from '../retrieval/index-job.js';
import { gitHead, gitIsRepo } from '../sources/git.js';
import { checkRemoteHead, syncSource } from '../sources/sync.js';

export type RefreshStatus =
  | 'unchanged'
  | 'updated'
  | 'dirty'
  | 'diverged'
  | 'wrong_branch'
  | 'failed';

export interface SourceRefreshReport {
  readonly sourceId: string;
  readonly kind: 'managed' | 'local';
  readonly status: RefreshStatus;
  readonly before?: string;
  readonly after?: string;
  readonly detail?: string;
  /** Indexes that no longer match this source and need a rebuild. */
  readonly indexes: readonly string[];
}

export interface IndexRebuild {
  readonly indexId: string;
  readonly ok: boolean;
  readonly report?: IndexUpdateReport;
  readonly detail?: string;
}

export interface RefreshResult {
  readonly sources: readonly SourceRefreshReport[];
  readonly indexes: readonly IndexRebuild[];
}

/** Indexes whose catalogue recorded a different commit for this source. */
async function indexesStaleAtCommit(
  config: MachineConfig,
  sourceId: string,
  commit: string | undefined,
): Promise<readonly string[]> {
  const stale: string[] = [];
  for (const indexId of indexesContainingSource(config, sourceId)) {
    const catalogue = await loadCatalogue(indexId);
    if (catalogue === undefined) {
      stale.push(indexId);
      continue;
    }
    const recorded = catalogue.sources?.[sourceId];
    const entry = catalogue.entries.find((candidate) => candidate.sourceId === sourceId);
    if (recorded === undefined && entry === undefined) {
      stale.push(indexId);
      continue;
    }
    if ((recorded?.gitCommit ?? entry?.gitCommit) !== commit) {
      stale.push(indexId);
    }
  }
  return stale;
}

/**
 * Managed source: compare the remote tip with HEAD via `ls-remote`, and
 * fast-forward only when it moved. Indexes are stale when built from another
 * commit, which also catches a manual `git pull`.
 */
export async function refreshManagedSource(
  config: MachineConfig,
  source: MachineSource,
): Promise<SourceRefreshReport> {
  const base = { sourceId: source.id, kind: 'managed' as const };
  if (!(await gitIsRepo(source.path))) {
    return { ...base, status: 'failed', detail: 'Not a git repository', indexes: [] };
  }
  const before = await gitHead(source.path);
  const check = await checkRemoteHead(source);

  let status: RefreshStatus = 'unchanged';
  let detail: string | undefined;
  if (check.isErr()) {
    status = 'failed';
    detail = check.error.message;
  } else if (check.value.moved) {
    const synced = await syncSource(source);
    if (synced.isErr()) {
      status = 'failed';
      detail = synced.error.message;
    } else if (synced.value.status !== 'ok') {
      status = synced.value.status === 'skipped_local' ? 'unchanged' : synced.value.status;
      detail = synced.value.detail;
    }
  }

  const after = await gitHead(source.path);
  if (status === 'unchanged' && after !== before) {
    status = 'updated';
  }
  return {
    ...base,
    status,
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
    ...(detail !== undefined ? { detail } : {}),
    indexes: await indexesStaleAtCommit(config, source.id, after),
  };
}

/**
 * Local source: never fetched. Rescan and compare `(relativePath,
 * contentHash)` with each index catalogue, so uncommitted edits and plain
 * directories are both seen.
 */
export async function refreshLocalSource(
  config: MachineConfig,
  source: MachineSource,
): Promise<SourceRefreshReport> {
  const base = { sourceId: source.id, kind: 'local' as const };
  const manifest = await loadSourceManifest(source.path);
  if (manifest.isErr()) {
    return { ...base, status: 'failed', detail: manifest.error.message, indexes: [] };
  }
  const scanned = await scanSourceDocuments(source.path, manifest.value);
  if (scanned.isErr()) {
    return { ...base, status: 'failed', detail: scanned.error.message, indexes: [] };
  }
  const current = new Map(
    scanned.value.map((document) => [document.relativePath, document.contentHash]),
  );

  const stale: string[] = [];
  for (const indexId of indexesContainingSource(config, source.id)) {
    const catalogue = await loadCatalogue(indexId);
    if (catalogue === undefined) {
      stale.push(indexId);
      continue;
    }
    const indexed = catalogue.entries.filter((entry) => entry.sourceId === source.id);
    const differs =
      indexed.length !== current.size ||
      indexed.some((entry) => current.get(entry.relativePath) !== entry.contentHash);
    if (differs) {
      stale.push(indexId);
    }
  }
  return { ...base, status: stale.length > 0 ? 'updated' : 'unchanged', indexes: stale };
}

export function refreshSource(
  config: MachineConfig,
  source: MachineSource,
): Promise<SourceRefreshReport> {
  return source.kind === 'managed'
    ? refreshManagedSource(config, source)
    : refreshLocalSource(config, source);
}

/** Rebuild each index once, however many of its sources changed. */
export async function rebuildIndexes(
  config: MachineConfig,
  indexIds: Iterable<string>,
): Promise<readonly IndexRebuild[]> {
  const results: IndexRebuild[] = [];
  for (const indexId of new Set(indexIds)) {
    const index = config.indexes.find((entry) => entry.id === indexId);
    if (index === undefined) {
      continue;
    }
    try {
      const report = await updateIndex(config, indexId, { embed: index.embed === true });
      results.push({ indexId, ok: true, report });
    } catch (error) {
      results.push({
        indexId,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

/**
 * Refresh sources, then rebuild the union of stale indexes. With `force`,
 * every index containing a refreshed source is rebuilt.
 */
export async function refreshSources(
  config: MachineConfig,
  sources: readonly MachineSource[],
  options: { readonly force?: boolean } = {},
): Promise<RefreshResult> {
  const reports: SourceRefreshReport[] = [];
  for (const source of sources) {
    reports.push(await refreshSource(config, source));
  }
  const stale = options.force === true
    ? sources.flatMap((source) => indexesContainingSource(config, source.id))
    : reports.flatMap((report) => report.indexes);
  return { sources: reports, indexes: await rebuildIndexes(config, stale) };
}
