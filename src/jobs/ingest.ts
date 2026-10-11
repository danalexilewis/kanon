import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, posix } from 'node:path';

import { err, ok, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import { splitFrontmatter } from '../config/frontmatter.js';
import {
  ingestTarget,
  sourceBranch,
  type MachineConfig,
  type MachineConnector,
  type MachineIngest,
  type MachineSource,
} from '../config/schemas.js';
import { loadSourceManifest } from '../config/source-manifest.js';
import {
  ASSETS_DIR,
  MAX_DOCUMENT_BYTES,
  processImages,
  referencedAssets,
  renderIngestedDocument,
  safeRelativeDir,
  slugify,
} from '../connectors/markdown.js';
import { createConnector } from '../connectors/registry.js';
import type { Connector, ConnectorItem } from '../connectors/types.js';
import { scanSourceDocuments } from '../core/documents.js';
import { worktreeDir } from '../env.js';
import { probeSourceWrite } from '../sources/access.js';
import {
  gitFetchBranch,
  gitHead,
  gitIsRepo,
  gitPush,
  gitWorktreeAdd,
  gitWorktreeRemove,
  runGit,
} from '../sources/git.js';
import { remoteUrl } from '../sources/sync.js';
import { scannedItems, type IngestScan } from './ingest-scan.js';
import { refreshManagedSource, type SourceRefreshReport } from './refresh.js';
import { readTargetFiles, resolveIngestTarget, toFs, type OwnedFile } from './target.js';

export type IngestStatus =
  | 'pushed'
  | 'unchanged'
  | 'dry_run'
  | 'assigned_elsewhere'
  | 'write_denied'
  | 'push_rejected'
  | 'failed';

export interface IngestSkip {
  readonly uri: string;
  readonly title: string;
  readonly reason: 'unsupported_format' | 'read_failed' | 'too_large';
  readonly detail?: string;
}

export interface IngestReport {
  readonly jobId: string;
  readonly sourceId: string;
  readonly status: IngestStatus;
  readonly attempts: number;
  readonly added: readonly string[];
  readonly updated: readonly string[];
  readonly removed: readonly string[];
  readonly skipped: readonly IngestSkip[];
  /** Changed items left for a later run because of `limit`. */
  readonly deferred: number;
  readonly commit?: string;
  readonly detail?: string;
  /** The operator checkout's fast-forward after a successful push. */
  readonly checkout?: SourceRefreshReport;
  /** Indexes the caller should rebuild. */
  readonly indexes: readonly string[];
}

export interface IngestDeps {
  readonly connectorFor?: (
    connector: MachineConnector,
  ) => Promise<Result<Connector, RailError<'connector_auth_required' | 'invalid_config'>>>;
  readonly probeWrite?: (source: MachineSource) => Promise<Result<void, RailError<'write_denied'>>>;
  /** Runs after the commit is built and before each push attempt. */
  readonly beforePush?: (attempt: number) => Promise<void>;
}

export interface IngestOptions {
  readonly dryRun?: boolean;
  /** Run even though the job is assigned to another device. */
  readonly here?: boolean;
  readonly deviceName?: string;
  /** Use this saved listing instead of listing the connector again. */
  readonly scan?: IngestScan;
  /** Download at most this many changed items; the rest wait for the next run. */
  readonly limit?: number;
  /** Progress lines, one per stage and per download. */
  readonly log?: (line: string) => void;
}

interface MirrorChanges {
  readonly added: readonly string[];
  readonly updated: readonly string[];
  readonly removed: readonly string[];
  readonly skipped: readonly IngestSkip[];
  readonly deferred: number;
}

type ReadResult = Awaited<ReturnType<Connector['read']>>;

const MAX_PUSH_ATTEMPTS = 2;

function choosePath(
  item: ConnectorItem,
  prior: OwnedFile | undefined,
  reserved: Set<string>,
): string {
  const dir = safeRelativeDir(item.relativeDir);
  const slug = slugify(item.title);
  const idSlug = slugify(item.externalId, 'item');
  const candidates = [
    posix.join(dir, `${slug}.md`),
    posix.join(dir, `${slug}-${idSlug.slice(0, 8)}.md`),
    posix.join(dir, `${slug}-${idSlug}.md`),
  ];
  if (prior !== undefined && candidates.includes(prior.path)) {
    return prior.path;
  }
  return candidates.find((candidate) => !reserved.has(candidate)) ?? candidates[2]!;
}

async function writeTargetFile(
  targetAbs: string,
  relative: string,
  content: string | Buffer,
): Promise<void> {
  const path = toFs(targetAbs, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

/**
 * Mirror connector items into the job target of a worktree. Only files this
 * job owns (a `<scheme>://` provenance URI) are updated or deleted; other
 * files under the target are never overwritten.
 */
async function mirrorIntoWorktree(args: {
  readonly worktree: string;
  readonly job: MachineIngest;
  readonly sourceId: string;
  readonly connector: Connector;
  readonly items: readonly ConnectorItem[];
  readonly read: (item: ConnectorItem) => Promise<ReadResult>;
  readonly limit?: number;
  readonly log: (line: string) => void;
}): Promise<Result<MirrorChanges, RailError<'invalid_config'>>> {
  const manifest = await loadSourceManifest(args.worktree);
  if (manifest.isErr()) {
    return err(manifest.error);
  }
  const target = ingestTarget(args.job);
  const targetAbs = await resolveIngestTarget(args.worktree, manifest.value, target);
  if (targetAbs.isErr()) {
    return err(targetAbs.error);
  }
  const files = await readTargetFiles(targetAbs.value, args.connector.scheme);
  if (files.isErr()) {
    return err(files.error);
  }
  const { owned, paths } = files.value;
  const ownedPaths = new Set([...owned.values()].map((file) => file.path));
  const reserved = new Set([...paths].filter((path) => !ownedPaths.has(path)));

  const added: string[] = [];
  const updated: string[] = [];
  const skipped: IngestSkip[] = [];
  const seen = new Set<string>();
  const keepAssets = new Set<string>();
  const keepPaths = new Set<string>();
  const display = (relative: string) => `${target}/${relative}`;

  const ordered = [...args.items].sort((left, right) => {
    const leftOwned = owned.has(left.uri) ? 0 : 1;
    const rightOwned = owned.has(right.uri) ? 0 : 1;
    return leftOwned - rightOwned || left.externalId.localeCompare(right.externalId);
  });
  const changed = ordered.filter(
    (item) => item.formats.includes('markdown') && owned.get(item.uri)?.revision !== item.revision,
  ).length;
  const planned = args.limit === undefined ? changed : Math.min(args.limit, changed);
  let reads = 0;
  let deferred = 0;
  args.log(`Downloading ${planned} of ${ordered.length} items${planned < changed ? ` (${changed - planned} deferred)` : ''}`);

  function keepPrior(prior: OwnedFile | undefined): void {
    if (prior === undefined) {
      return;
    }
    reserved.add(prior.path);
    keepPaths.add(prior.path);
    referencedAssets(prior.content).forEach((name) => keepAssets.add(name));
  }

  for (const item of ordered) {
    seen.add(item.uri);
    const prior = owned.get(item.uri);
    if (!item.formats.includes('markdown')) {
      skipped.push({ uri: item.uri, title: item.title, reason: 'unsupported_format' });
      keepPrior(prior);
      continue;
    }
    const path = choosePath(item, prior, reserved);
    if (prior !== undefined && prior.revision === item.revision && prior.path === path) {
      keepPrior(prior);
      continue;
    }
    if (args.limit !== undefined && reads >= args.limit) {
      deferred += 1;
      keepPrior(prior);
      continue;
    }
    reads += 1;
    args.log(`[${reads}/${Math.max(planned, reads)}] ${item.relativeDir === '' ? '' : `${item.relativeDir}/`}${item.title}`);

    const read = await args.read(item);
    if (read.isErr()) {
      skipped.push({
        uri: item.uri,
        title: item.title,
        reason: read.error.code === 'unsupported_format' ? 'unsupported_format' : 'read_failed',
        detail: read.error.message,
      });
      keepPrior(prior);
      continue;
    }
    const split = splitFrontmatter(read.value);
    const upstream = split.data as { vars?: unknown } | undefined;
    const vars =
      typeof upstream?.vars === 'object' && upstream.vars !== null && !Array.isArray(upstream.vars)
        ? (upstream.vars as Record<string, unknown>)
        : undefined;
    const images = processImages(split.body, args.job.images ?? 'extract', posix.dirname(path) === '.' ? '' : posix.dirname(path));
    const rendered = renderIngestedDocument({
      item,
      sourceId: args.sourceId,
      body: images.markdown,
      ...(vars !== undefined ? { vars } : {}),
    });
    if (Buffer.byteLength(rendered, 'utf8') > MAX_DOCUMENT_BYTES) {
      skipped.push({ uri: item.uri, title: item.title, reason: 'too_large' });
      keepPrior(prior);
      continue;
    }

    reserved.add(path);
    keepPaths.add(path);
    await writeTargetFile(targetAbs.value, path, rendered);
    for (const asset of images.assets) {
      keepAssets.add(posix.basename(asset.path));
      await writeTargetFile(targetAbs.value, asset.path, asset.bytes);
    }
    if (prior === undefined) {
      added.push(display(path));
    } else {
      if (prior.path !== path) {
        await rm(toFs(targetAbs.value, prior.path), { force: true });
      }
      if (prior.path !== path || prior.content !== rendered) {
        updated.push(display(path));
      }
    }
  }

  const removed: string[] = [];
  for (const file of owned.values()) {
    if (!seen.has(file.uri) && !keepPaths.has(file.path)) {
      await rm(toFs(targetAbs.value, file.path), { force: true });
      removed.push(display(file.path));
    }
  }
  for (const path of paths) {
    const inAssets = path.startsWith(`${ASSETS_DIR}/`) && !path.slice(ASSETS_DIR.length + 1).includes('/');
    const name = posix.basename(path);
    if (inAssets && /^[a-f0-9]{16,64}\.[a-z0-9]+$/.test(name) && !keepAssets.has(name)) {
      await rm(toFs(targetAbs.value, path), { force: true });
    }
  }

  const validated = await scanSourceDocuments(args.worktree, manifest.value);
  if (validated.isErr()) {
    return err(validated.error);
  }
  return ok({ added, updated, removed, skipped, deferred });
}

async function gitIdentity(
  repo: string,
  job: MachineIngest,
): Promise<{ readonly name: string; readonly email: string } | undefined> {
  if (job.author !== undefined) {
    return job.author;
  }
  const name = await runGit(repo, ['config', 'user.name'], { credentials: true });
  const email = await runGit(repo, ['config', 'user.email'], { credentials: true });
  if (name.code !== 0 || email.code !== 0 || name.stdout === '' || email.stdout === '') {
    return undefined;
  }
  return { name: name.stdout, email: email.stdout };
}

/** One worktree per job and checkout, so two configs on one machine never collide. */
function jobWorktree(job: MachineIngest, source: MachineSource): string {
  const suffix = createHash('sha256').update(source.path).digest('hex').slice(0, 8);
  return worktreeDir(`${job.id}-${suffix}`);
}

async function resetWorktree(repo: string, dir: string): Promise<void> {
  await gitWorktreeRemove(repo, dir);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dirname(dir), { recursive: true });
}

function commitMessage(job: MachineIngest, changes: MirrorChanges, deviceName: string | undefined): string {
  const summary = `+${changes.added.length} ~${changes.updated.length} -${changes.removed.length}`;
  const trailers = [`Kanon-Ingest: ${job.id}`, ...(deviceName !== undefined ? [`Kanon-Device: ${deviceName}`] : [])];
  return `kanon(ingest): ${job.id} (${summary})\n\n${trailers.join('\n')}\n`;
}

/**
 * Pull a connector's documents into a write-access source and push them
 * fast-forward. Work happens in a temporary worktree at the remote tip; the
 * operator's checkout only ever moves by fast-forward afterwards. A remote
 * that moved during the run triggers one rebuild from the new tip.
 */
export async function runIngest(
  config: MachineConfig,
  jobId: string,
  options: IngestOptions = {},
  deps: IngestDeps = {},
): Promise<IngestReport> {
  const job = (config.ingest ?? []).find((entry) => entry.id === jobId);
  const empty = { attempts: 0, added: [], updated: [], removed: [], skipped: [], deferred: 0, indexes: [] };
  const log = options.log ?? (() => undefined);
  if (job === undefined) {
    return { jobId, sourceId: '', status: 'failed', detail: 'Unknown ingest job', ...empty };
  }
  const base = { jobId, sourceId: job.source };
  const fail = (status: IngestStatus, detail: string): IngestReport => ({
    ...base,
    status,
    detail,
    ...empty,
  });

  if (job.device !== undefined && job.device !== options.deviceName && options.here !== true) {
    return fail('assigned_elsewhere', `Assigned to device ${job.device}`);
  }
  const source = config.sources.find((entry) => entry.id === job.source);
  const connectorConfig = (config.connectors ?? []).find((entry) => entry.id === job.connector);
  if (source === undefined || connectorConfig === undefined) {
    return fail('failed', 'Ingest job references an unknown source or connector');
  }
  if (!(await gitIsRepo(source.path))) {
    return fail('failed', 'Source path is not a git repository');
  }
  const author = await gitIdentity(source.path, job);
  if (author === undefined) {
    return fail('failed', 'No git identity: set ingest author or git user.name and user.email');
  }

  const connector = await (deps.connectorFor ?? createConnector)(connectorConfig);
  if (connector.isErr()) {
    return fail('failed', connector.error.message);
  }
  const probe = await (deps.probeWrite ?? probeSourceWrite)(source);
  if (probe.isErr()) {
    return fail('write_denied', probe.error.message);
  }
  if (options.scan !== undefined && (options.scan.folder !== job.folder || options.scan.connector !== job.connector)) {
    return fail('failed', `Scan for ${jobId} does not match the job's connector and folder; scan again`);
  }
  if (options.scan === undefined) {
    log(`Listing ${job.connector} folder ${job.folder}`);
  } else {
    log(`Using the scan from ${options.scan.scannedAt}`);
  }
  const listed =
    options.scan === undefined
      ? await connector.value.list({ folder: job.folder })
      : ok(scannedItems(options.scan));
  if (listed.isErr()) {
    return fail('failed', listed.error.message);
  }

  const cache = new Map<string, ReadResult>();
  const read = async (item: ConnectorItem): Promise<ReadResult> => {
    const key = `${item.externalId}@${item.revision}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const result = await connector.value.read(item, 'markdown');
    cache.set(key, result);
    return result;
  };

  const branch = sourceBranch(source);
  const url = remoteUrl(source);
  const dir = jobWorktree(job, source);
  let lastDetail = '';

  for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt += 1) {
    const tip = await gitFetchBranch(source.path, url, branch);
    if (tip.isErr()) {
      return { ...fail('failed', tip.error.message), attempts: attempt };
    }
    await resetWorktree(source.path, dir);
    const added = await gitWorktreeAdd(source.path, dir, tip.value);
    if (added.code !== 0) {
      return { ...fail('failed', added.stderr || 'worktree add failed'), attempts: attempt };
    }

    try {
      const changes = await mirrorIntoWorktree({
        worktree: dir,
        job,
        sourceId: source.id,
        connector: connector.value,
        items: listed.value,
        read,
        ...(options.limit !== undefined ? { limit: options.limit } : {}),
        log,
      });
      if (changes.isErr()) {
        return { ...fail('failed', changes.error.message), attempts: attempt };
      }
      const report = { ...base, ...changes.value, attempts: attempt, indexes: [] as string[] };

      await runGit(dir, ['add', '-A', '--', ingestTarget(job)]);
      const diff = await runGit(dir, ['diff', '--cached', '--quiet']);
      if (diff.code === 0) {
        return { ...report, status: options.dryRun === true ? 'dry_run' : 'unchanged' };
      }
      if (options.dryRun === true) {
        return { ...report, status: 'dry_run' };
      }

      const commit = await runGit(
        dir,
        [
          '-c',
          `user.name=${author.name}`,
          '-c',
          `user.email=${author.email}`,
          'commit',
          '--no-gpg-sign',
          '-m',
          commitMessage(job, changes.value, options.deviceName),
        ],
        { credentials: true },
      );
      if (commit.code !== 0) {
        return { ...report, status: 'failed', detail: commit.stderr || commit.stdout };
      }
      const commitSha = await gitHead(dir);

      await deps.beforePush?.(attempt);
      log(`Pushing to ${branch}`);
      const pushed = await gitPush(dir, url, branch);
      if (pushed.status === 'pushed') {
        const checkout = await refreshManagedSource(config, source);
        return {
          ...report,
          status: 'pushed',
          ...(commitSha !== undefined ? { commit: commitSha } : {}),
          checkout,
          indexes: checkout.indexes,
        };
      }
      lastDetail = pushed.detail;
      if (pushed.status === 'rejected') {
        return { ...report, status: 'push_rejected', detail: pushed.detail };
      }
    } finally {
      await resetWorktree(source.path, dir);
    }
  }
  return {
    ...fail('push_rejected', lastDetail || 'Remote kept moving'),
    attempts: MAX_PUSH_ATTEMPTS,
  };
}
