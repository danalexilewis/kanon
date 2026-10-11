import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, posix } from 'node:path';

import { err, ok, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import { splitFrontmatter } from '../config/frontmatter.js';
import {
  ingestCircles,
  ingestSourceForCircle,
  ingestSources,
  ingestTarget,
  sourceBranch,
  type DocumentAccess,
  type MachineConfig,
  type MachineConnector,
  type MachineIngest,
  type MachineSource,
} from '../config/schemas.js';
import { checkAudience, type HostAudience } from '../hosts/audience.js';
import { placeDocument } from '../circles/placement.js';
import { documentState, loadLedger } from '../review/io.js';
import { contentHash, proposedLevel, scoreSignals } from '../scoring/signals.js';
import {
  connectorAccount,
  itemCanShare,
  itemSharing,
  readersFor,
  requireOperatorPerson,
  toDomainCircles,
} from './readers.js';
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
import { ownedAcrossRoute, scannedItems, type IngestScan } from './ingest-scan.js';
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

export interface CircleIngestReport {
  readonly circleId: string;
  readonly sourceId: string;
  readonly status: IngestStatus | 'audience_too_wide' | 'audience_unverified';
  readonly attempts: number;
  readonly added: readonly string[];
  readonly updated: readonly string[];
  readonly removed: readonly string[];
  readonly skipped: readonly IngestSkip[];
  readonly deferred: number;
  readonly commit?: string;
  readonly detail?: string;
  readonly checkout?: SourceRefreshReport;
  readonly indexes: readonly string[];
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
  readonly held: readonly string[];
  readonly needsReview: number;
  readonly narrowed: readonly string[];
  readonly circles: readonly CircleIngestReport[];
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
  readonly checkAudience?: HostAudience;
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
  readonly circleId?: string;
  readonly placementByUri?: ReadonlyMap<string, string | undefined>;
  readonly deferredUris?: ReadonlySet<string>;
  readonly accessByUri?: ReadonlyMap<string, DocumentAccess>;
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
    const dest = args.placementByUri?.get(item.uri);
    if (args.placementByUri !== undefined && dest !== args.circleId) {
      continue;
    }
    if (args.deferredUris?.has(item.uri) === true) {
      if (prior === undefined || prior.revision !== item.revision) {
        deferred += 1;
      }
      keepPrior(prior);
      continue;
    }
    const path = choosePath(item, prior, reserved);
    if (prior !== undefined && prior.revision === item.revision && prior.path === path) {
      const access = args.accessByUri?.get(item.uri);
      if (access !== undefined) {
        const splitPrior = splitFrontmatter(prior.content);
        const rendered = renderIngestedDocument({
          item,
          sourceId: args.sourceId,
          body: splitPrior.body.replace(/^\s+/, '').replace(/\s*$/, '\n'),
          access,
        });
        if (rendered !== prior.content) {
          reserved.add(path);
          keepPaths.add(path);
          await writeTargetFile(targetAbs.value, path, rendered);
          updated.push(display(path));
          continue;
        }
      }
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
      ...(args.accessByUri?.get(item.uri) !== undefined ? { access: args.accessByUri.get(item.uri) } : {}),
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
    const dest = args.placementByUri?.get(file.uri);
    const movedAway = args.placementByUri !== undefined && dest !== args.circleId;
    if (!keepPaths.has(file.path) && (!seen.has(file.uri) || movedAway)) {
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
  const empty = {
    attempts: 0,
    added: [],
    updated: [],
    removed: [],
    skipped: [],
    deferred: 0,
    held: [],
    needsReview: 0,
    narrowed: [],
    circles: [],
    indexes: [],
  };
  const log = options.log ?? (() => undefined);
  if (job === undefined) {
    return { jobId, sourceId: '', status: 'failed', detail: 'Unknown ingest job', ...empty };
  }
  const routeSources = ingestSources(config, job);
  const source = routeSources[0];
  const base = { jobId, sourceId: source?.id ?? '' };
  const fail = (status: IngestStatus, detail: string): IngestReport => ({
    ...base,
    status,
    detail,
    ...empty,
  });

  if (job.device !== undefined && job.device !== options.deviceName && options.here !== true) {
    return fail('assigned_elsewhere', `Assigned to device ${job.device}`);
  }
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
  let writeDeniedDetail: string | undefined;
  let writable = 0;
  for (const routeSource of routeSources) {
    const probe = await (deps.probeWrite ?? probeSourceWrite)(routeSource);
    if (probe.isOk()) {
      writable += 1;
    } else {
      writeDeniedDetail = probe.error.message;
    }
  }
  if (writable === 0) {
    return fail('write_denied', writeDeniedDetail ?? 'Write access denied');
  }
  if (options.scan !== undefined && options.scan.schema !== 'kanon/ingest-scan/v2') {
    return fail('failed', `Scan for ${jobId} is v1; scan again`);
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

  const account = await connectorAccount(connector.value);
  if (account.isErr()) {
    return fail('failed', account.error.message);
  }
  const operator = requireOperatorPerson(config, account.value);
  if (operator.isErr()) {
    return fail('failed', operator.error.message);
  }
  const ledger = await loadLedger(jobId);
  const domainCircles = toDomainCircles(config);
  const placementByUri = new Map<string, string | undefined>();
  const accessByUri = new Map<string, DocumentAccess>();
  const deferredUris = new Set<string>();
  const held: string[] = [];
  const narrowed: string[] = [];
  let needsReview = 0;
  const owned = await ownedAcrossRoute(config, job, connector.value.scheme);
  if (owned.isErr()) {
    return fail('failed', owned.error.message);
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
  let downloads = 0;

  for (const item of listed.value) {
    const snapshot = await itemSharing(connector.value, item);
    const readers = readersFor(config, account.value, snapshot);
    const canShare = await itemCanShare(connector.value, item);
    const review = documentState(ledger.state, item.uri);
    const prior = owned.value.owned.get(item.uri);
    let body = prior !== undefined ? splitFrontmatter(prior.content).body : '';
    if (item.formats.includes('markdown') && prior?.revision !== item.revision) {
      if (options.limit !== undefined && downloads >= options.limit) {
        deferredUris.add(item.uri);
      } else {
        const fetched = await read(item);
        downloads += 1;
        if (fetched.isOk()) {
          body = splitFrontmatter(fetched.value).body;
        }
      }
    }
    const signals = scoreSignals({
      title: item.title,
      body,
      readers,
      operatorId: operator.value.id,
    });
    const level = proposedLevel({
      signalLevel: signals.level,
      ...(review.proposedLevel !== undefined ? { modelLevel: review.proposedLevel } : {}),
      ...(review.finalLevel !== undefined ? { finalLevel: review.finalLevel } : {}),
    });
    const placement = placeDocument({
      route: job.route,
      circles: domainCircles,
      readers,
      level,
      review,
      contentHash: contentHash(body),
      canShare,
    });
    placementByUri.set(item.uri, placement.circle);
    if (placement.held) {
      held.push(item.uri);
      if (review.excluded !== true) {
        needsReview += 1;
      }
    } else if (placement.circle !== undefined) {
      accessByUri.set(item.uri, {
        circle: placement.circle,
        level: placement.level,
        basis: placement.basis ?? 'sharing',
        readers: [...readers.people],
        others: readers.others,
        ...(placement.basis === 'promotion' ? { approver: review.approvals[placement.circle]?.by } : {}),
      });
    }
  }

  const circleReports: CircleIngestReport[] = [];
  for (const circle of ingestCircles(config, job)) {
    const circleSource = ingestSourceForCircle(config, job, circle.id);
    if (circleSource === undefined) {
      continue;
    }
    const report = await pushCircle({
      config,
      job,
      circleId: circle.id,
      source: circleSource,
      connector: connector.value,
      items: listed.value,
      read,
      author,
      options,
      deps,
      log,
      placementByUri,
      deferredUris,
      accessByUri,
    });
    circleReports.push(report);
  }

  const added = circleReports.flatMap((report) => report.added);
  const updated = circleReports.flatMap((report) => report.updated);
  const removed = circleReports.flatMap((report) => report.removed);
  const skipped = circleReports.flatMap((report) => report.skipped);
  const deferred = circleReports.reduce((sum, report) => sum + report.deferred, 0);
  const indexes = [...new Set(circleReports.flatMap((report) => report.indexes))];
  const pushed = circleReports.find((report) => report.status === 'pushed');
  const failed = circleReports.find(
    (report): report is CircleIngestReport & { status: 'failed' | 'push_rejected' | 'write_denied' } =>
      report.status === 'failed' || report.status === 'push_rejected' || report.status === 'write_denied',
  );
  const status: IngestStatus =
    failed !== undefined
      ? failed.status
      : pushed !== undefined
        ? 'pushed'
        : options.dryRun === true
          ? 'dry_run'
          : 'unchanged';

  return {
    ...base,
    status,
    attempts: Math.max(1, ...circleReports.map((report) => report.attempts)),
    added,
    updated,
    removed,
    skipped,
    deferred,
    held,
    needsReview,
    narrowed,
    circles: circleReports,
    ...(pushed?.commit !== undefined ? { commit: pushed.commit } : {}),
    ...(pushed?.checkout !== undefined ? { checkout: pushed.checkout } : {}),
    ...(failed?.detail !== undefined ? { detail: failed.detail } : {}),
    indexes,
  };
}

async function pushCircle(args: {
  readonly config: MachineConfig;
  readonly job: MachineIngest;
  readonly circleId: string;
  readonly source: MachineSource;
  readonly connector: Connector;
  readonly items: readonly ConnectorItem[];
  readonly read: (item: ConnectorItem) => Promise<ReadResult>;
  readonly author: { readonly name: string; readonly email: string };
  readonly options: IngestOptions;
  readonly deps: IngestDeps;
  readonly log: (line: string) => void;
  readonly placementByUri: ReadonlyMap<string, string | undefined>;
  readonly deferredUris: ReadonlySet<string>;
  readonly accessByUri: ReadonlyMap<string, DocumentAccess>;
}): Promise<CircleIngestReport> {
  const empty = { attempts: 0, added: [], updated: [], removed: [], skipped: [], deferred: 0, indexes: [] };
  const base = { circleId: args.circleId, sourceId: args.source.id };
  const fail = (
    status: CircleIngestReport['status'],
    detail: string,
    attempts = 0,
  ): CircleIngestReport => ({ ...base, ...empty, status, detail, attempts });

  if (!(await gitIsRepo(args.source.path))) {
    return fail('failed', 'Source path is not a git repository');
  }
  const probe = await (args.deps.probeWrite ?? probeSourceWrite)(args.source);
  if (probe.isErr()) {
    return fail('write_denied', probe.error.message);
  }

  const branch = sourceBranch(args.source);
  const url = remoteUrl(args.source);
  const dir = jobWorktree(args.job, args.source);
  let lastDetail = '';

  for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt += 1) {
    const tip = await gitFetchBranch(args.source.path, url, branch);
    if (tip.isErr()) {
      return fail('failed', tip.error.message, attempt);
    }
    await resetWorktree(args.source.path, dir);
    const added = await gitWorktreeAdd(args.source.path, dir, tip.value);
    if (added.code !== 0) {
      return fail('failed', added.stderr || 'worktree add failed', attempt);
    }

    try {
      const changes = await mirrorIntoWorktree({
        worktree: dir,
        job: args.job,
        sourceId: args.source.id,
        connector: args.connector,
        items: args.items,
        read: args.read,
        ...(args.options.limit !== undefined ? { limit: args.options.limit } : {}),
        log: args.log,
        circleId: args.circleId,
        placementByUri: args.placementByUri,
        deferredUris: args.deferredUris,
        accessByUri: args.accessByUri,
      });
      if (changes.isErr()) {
        return fail('failed', changes.error.message, attempt);
      }
      const report = { ...base, ...changes.value, attempts: attempt, indexes: [] as string[] };

      await runGit(dir, ['add', '-A', '--', ingestTarget(args.job)]);
      const diff = await runGit(dir, ['diff', '--cached', '--quiet']);
      const removalOnly = changes.value.added.length === 0 && changes.value.updated.length === 0 && changes.value.removed.length > 0;
      const audience = await (args.deps.checkAudience ?? checkAudience)(
        args.config.circles?.find((circle) => circle.id === args.circleId) ?? {
          id: args.circleId,
          source: args.source.id,
          members: [],
          ceiling: 3,
        },
        args.source,
      );
      if (audience.isErr()) {
        if (audience.error.code === 'audience_too_wide' && removalOnly && args.options.dryRun !== true) {
          args.log(`Audience too wide for ${args.circleId}; pushing removals only`);
        } else if (audience.error.code === 'audience_too_wide' && !removalOnly) {
          return { ...report, status: 'audience_too_wide', detail: audience.error.message };
        } else {
          return { ...report, status: 'audience_unverified', detail: audience.error.message };
        }
      }
      if (diff.code === 0) {
        return { ...report, status: args.options.dryRun === true ? 'dry_run' : 'unchanged' };
      }
      if (args.options.dryRun === true) {
        return { ...report, status: 'dry_run' };
      }

      const commit = await runGit(
        dir,
        [
          '-c',
          `user.name=${args.author.name}`,
          '-c',
          `user.email=${args.author.email}`,
          'commit',
          '--no-gpg-sign',
          '-m',
          commitMessage(args.job, changes.value, args.options.deviceName),
        ],
        { credentials: true },
      );
      if (commit.code !== 0) {
        return { ...report, status: 'failed', detail: commit.stderr || commit.stdout };
      }
      const commitSha = await gitHead(dir);

      await args.deps.beforePush?.(attempt);
      args.log(`Pushing to ${branch}`);
      const pushed = await gitPush(dir, url, branch);
      if (pushed.status === 'pushed') {
        const checkout = await refreshManagedSource(args.config, args.source);
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
      await resetWorktree(args.source.path, dir);
    }
  }
  return fail('push_rejected', lastDetail || 'Remote kept moving', MAX_PUSH_ATTEMPTS);
}

