import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';

import type { RailError } from '@eddy-works/never-rest';
import { ingestSources, ingestTarget, type MachineConfig, type MachineConnector } from '../config/schemas.js';
import { loadSourceManifest } from '../config/source-manifest.js';
import { ingestDocId } from '../connectors/markdown.js';
import { createConnector } from '../connectors/registry.js';
import type { Connector, ConnectorError, ConnectorItem } from '../connectors/types.js';
import { ingestScanPath } from '../env.js';
import { invalidConfig } from '../errors.js';
import {
  connectorAccount,
  eligibleOnRoute,
  itemSharing,
  readersFor,
  requireOperatorPerson,
} from './readers.js';
import { readTargetFiles, resolveIngestTarget, type OwnedFile } from './target.js';

const scannedItemSchema = z
  .object({
    externalId: z.string().min(1),
    uri: z.string().min(1),
    /** The Kanon `doc.id` the ingested file carries. */
    docId: z.string().uuid(),
    title: z.string(),
    relativeDir: z.string(),
    revision: z.string(),
    formats: z.array(z.literal('markdown')),
    mimeType: z.string().optional(),
    webUrl: z.string().optional(),
    action: z.enum(['download', 'unchanged', 'unsupported']),
    /** Where the job already wrote this item, relative to the target. */
    path: z.string().optional(),
    circle: z.string().optional(),
    readers: z.array(z.string()),
    others: z.number().int(),
    external: z.number().int(),
    sharing: z.enum(['full', 'partial']),
    eligible: z.array(z.string()),
  })
  .strict();

const scanFolderSchema = z
  .object({
    path: z.string(),
    items: z.number().int(),
    download: z.number().int(),
    unchanged: z.number().int(),
    unsupported: z.number().int(),
  })
  .strict();

const ingestScanSchema = z
  .object({
    schema: z.literal('kanon/ingest-scan/v2'),
    jobId: z.string().min(1),
    connector: z.string().min(1),
    folder: z.string().min(1),
    sourceId: z.string().uuid(),
    target: z.string().min(1),
    scannedAt: z.string().min(1),
    totals: z
      .object({
        items: z.number().int(),
        folders: z.number().int(),
        download: z.number().int(),
        unchanged: z.number().int(),
        unsupported: z.number().int(),
        remove: z.number().int(),
        held: z.number().int(),
        circles: z.record(z.string(), z.number().int()),
      })
      .strict(),
    byMimeType: z.record(z.string(), z.number().int()),
    folders: z.array(scanFolderSchema),
    /** Files the job wrote earlier whose item is gone upstream. The next run deletes them. */
    remove: z.array(z.string()),
    items: z.array(scannedItemSchema),
  })
  .strict();

export type ScannedItem = z.infer<typeof scannedItemSchema>;
export type ScanFolder = z.infer<typeof scanFolderSchema>;
export type IngestScan = z.infer<typeof ingestScanSchema>;
export type IngestScanSummary = Omit<IngestScan, 'items'> & { readonly file: string };

export type IngestScanError = ConnectorError | RailError<'invalid_config'>;

export interface IngestScanOptions {
  readonly log?: (line: string) => void;
}

export interface IngestScanDeps {
  readonly connectorFor?: (
    connector: MachineConnector,
  ) => Promise<Result<Connector, RailError<'connector_auth_required' | 'invalid_config'>>>;
  readonly now?: () => Date;
}

function scanAction(item: ConnectorItem, prior: OwnedFile | undefined): ScannedItem['action'] {
  if (!item.formats.includes('markdown')) {
    return 'unsupported';
  }
  return prior !== undefined && prior.revision === item.revision ? 'unchanged' : 'download';
}

function toScannedItem(
  sourceId: string,
  item: ConnectorItem,
  prior: OwnedFile | undefined,
  extra: Pick<ScannedItem, 'readers' | 'others' | 'external' | 'sharing' | 'eligible'> & {
    readonly circle?: string;
  },
): ScannedItem {
  return {
    externalId: item.externalId,
    uri: item.uri,
    docId: ingestDocId(sourceId, item.uri),
    title: item.title,
    relativeDir: item.relativeDir,
    revision: item.revision,
    formats: [...item.formats],
    ...(item.mimeType !== undefined ? { mimeType: item.mimeType } : {}),
    ...(item.webUrl !== undefined ? { webUrl: item.webUrl } : {}),
    action: scanAction(item, prior),
    ...(prior !== undefined ? { path: prior.path } : {}),
    ...(extra.circle !== undefined ? { circle: extra.circle } : {}),
    readers: extra.readers,
    others: extra.others,
    external: extra.external,
    sharing: extra.sharing,
    eligible: extra.eligible,
  };
}

export async function ownedAcrossRoute(
  config: MachineConfig,
  job: NonNullable<MachineConfig['ingest']>[number],
  scheme: string,
): Promise<Result<{ readonly owned: Map<string, OwnedFile & { readonly circleId: string; readonly sourceId: string }> }, RailError<'invalid_config'>>> {
  const owned = new Map<string, OwnedFile & { readonly circleId: string; readonly sourceId: string }>();
  const target = ingestTarget(job);
  for (const circleId of job.route) {
    const circle = (config.circles ?? []).find((entry) => entry.id === circleId);
    if (circle === undefined) {
      continue;
    }
    const source = config.sources.find((entry) => entry.id === circle.source);
    if (source === undefined) {
      continue;
    }
    const manifest = await loadSourceManifest(source.path);
    if (manifest.isErr()) {
      return err(manifest.error);
    }
    const targetAbs = await resolveIngestTarget(source.path, manifest.value, target);
    if (targetAbs.isErr()) {
      return err(targetAbs.error);
    }
    const files = await readTargetFiles(targetAbs.value, scheme);
    if (files.isErr()) {
      return err(files.error);
    }
    for (const file of files.value.owned.values()) {
      if (!owned.has(file.uri)) {
        owned.set(file.uri, { ...file, circleId: circle.id, sourceId: source.id });
      }
    }
  }
  return ok({ owned });
}

function compareItems(left: ScannedItem, right: ScannedItem): number {
  return (
    left.relativeDir.localeCompare(right.relativeDir) ||
    left.title.localeCompare(right.title) ||
    left.externalId.localeCompare(right.externalId)
  );
}

function folderTotals(items: readonly ScannedItem[]): readonly ScanFolder[] {
  const folders = new Map<string, ScanFolder>();
  for (const item of items) {
    const path = item.relativeDir === '' ? '.' : item.relativeDir;
    const current = folders.get(path) ?? { path, items: 0, download: 0, unchanged: 0, unsupported: 0 };
    folders.set(path, {
      path,
      items: current.items + 1,
      download: current.download + (item.action === 'download' ? 1 : 0),
      unchanged: current.unchanged + (item.action === 'unchanged' ? 1 : 0),
      unsupported: current.unsupported + (item.action === 'unsupported' ? 1 : 0),
    });
  }
  return [...folders.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function mimeTotals(items: readonly ScannedItem[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of [...items].sort((left, right) => (left.mimeType ?? '').localeCompare(right.mimeType ?? ''))) {
    const key = item.mimeType ?? 'unknown';
    totals[key] = (totals[key] ?? 0) + 1;
  }
  return totals;
}

async function saveIngestScan(scan: IngestScan): Promise<void> {
  const path = ingestScanPath(scan.jobId);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(scan, null, 2)}\n`, 'utf8');
  await rename(temp, path);
}

/**
 * Step one of ingest: list the connector folder without downloading anything,
 * compare each item with what the job already wrote in the operator checkout,
 * and save the listing under `$KANON_CACHE/jobs/scans/`. Read-only on both
 * sides; it needs no write access and no lock.
 */
export async function scanIngest(
  config: MachineConfig,
  jobId: string,
  options: IngestScanOptions = {},
  deps: IngestScanDeps = {},
): Promise<Result<IngestScan, IngestScanError>> {
  const job = (config.ingest ?? []).find((entry) => entry.id === jobId);
  if (job === undefined) {
    return err(invalidConfig('Unknown ingest job id'));
  }
  const sources = ingestSources(config, job);
  const source = sources[0];
  const connectorConfig = (config.connectors ?? []).find((entry) => entry.id === job.connector);
  if (source === undefined || connectorConfig === undefined) {
    return err(invalidConfig('Ingest job references an unknown source or connector'));
  }
  const connector = await (deps.connectorFor ?? createConnector)(connectorConfig);
  if (connector.isErr()) {
    return err(connector.error);
  }
  const account = await connectorAccount(connector.value);
  if (account.isErr()) {
    return err(account.error);
  }
  const operator = requireOperatorPerson(config, account.value);
  if (operator.isErr()) {
    return err(operator.error);
  }
  const collected = await ownedAcrossRoute(config, job, connector.value.scheme);
  if (collected.isErr()) {
    return err(collected.error);
  }

  options.log?.(`Listing ${job.connector} folder ${job.folder}`);
  const listed = await connector.value.list({ folder: job.folder });
  if (listed.isErr()) {
    return err(listed.error);
  }
  const { owned } = collected.value;
  const items: ScannedItem[] = [];
  for (const item of listed.value) {
    const snapshot = await itemSharing(connector.value, item);
    const readers = readersFor(config, account.value, snapshot);
    const eligible = eligibleOnRoute(config, job.route, readers);
    const prior = owned.get(item.uri);
    items.push(
      toScannedItem(prior?.sourceId ?? source.id, item, prior, {
        readers: [...readers.people],
        others: readers.others,
        external: readers.external,
        sharing: readers.sharing,
        eligible: [...eligible],
        ...(prior !== undefined ? { circle: prior.circleId } : {}),
      }),
    );
  }
  items.sort(compareItems);
  const listedUris = new Set(items.map((item) => item.uri));
  const target = ingestTarget(job);
  const remove = [...owned.values()]
    .filter((file) => !listedUris.has(file.uri))
    .map((file) => `${target}/${file.path}`)
    .sort();
  const folders = folderTotals(items);
  const count = (action: ScannedItem['action']) => items.filter((item) => item.action === action).length;
  const circles: Record<string, number> = {};
  for (const circleId of job.route) {
    circles[circleId] = items.filter((item) => item.eligible.includes(circleId)).length;
  }
  const held = items.filter((item) => item.eligible.length === 0 && item.action !== 'unsupported').length;

  const scan: IngestScan = {
    schema: 'kanon/ingest-scan/v2',
    jobId,
    connector: job.connector,
    folder: job.folder,
    sourceId: source.id,
    target,
    scannedAt: (deps.now ?? (() => new Date()))().toISOString(),
    totals: {
      items: items.length,
      folders: folders.length,
      download: count('download'),
      unchanged: count('unchanged'),
      unsupported: count('unsupported'),
      remove: remove.length,
      held,
      circles,
    },
    byMimeType: mimeTotals(items),
    folders: [...folders],
    remove,
    items,
  };
  await saveIngestScan(scan);
  options.log?.(`Scanned ${items.length} items in ${folders.length} folders`);
  for (const circleId of job.route) {
    options.log?.(`  ${circleId}: ${circles[circleId] ?? 0} eligible`);
  }
  options.log?.(`  held: ${held}`);
  return ok(scan);
}

/** Read the saved scan for a job. */
export async function loadIngestScan(jobId: string): Promise<Result<IngestScan, RailError<'invalid_config'>>> {
  let raw: string;
  try {
    raw = await readFile(ingestScanPath(jobId), 'utf8');
  } catch {
    return err(invalidConfig(`No scan for ${jobId}; run kanon ingest scan ${jobId}`));
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return err(invalidConfig(`Scan for ${jobId} is not valid JSON; scan again`));
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'schema' in value &&
    (value as { schema?: unknown }).schema === 'kanon/ingest-scan/v1'
  ) {
    return err(invalidConfig(`Scan for ${jobId} is v1; scan again`));
  }
  const parsed = ingestScanSchema.safeParse(value);
  if (!parsed.success || parsed.data.jobId !== jobId) {
    return err(invalidConfig(`Scan for ${jobId} is unreadable; scan again`));
  }
  return ok(parsed.data);
}

/** The listing a run uses when it starts from a saved scan. */
export function scannedItems(scan: IngestScan): readonly ConnectorItem[] {
  return scan.items.map((item) => ({
    externalId: item.externalId,
    uri: item.uri,
    title: item.title,
    relativeDir: item.relativeDir,
    revision: item.revision,
    formats: item.formats,
    ...(item.mimeType !== undefined ? { mimeType: item.mimeType } : {}),
    ...(item.webUrl !== undefined ? { webUrl: item.webUrl } : {}),
  }));
}

/** Everything but the per-item list, plus where the full scan is saved. */
export function summarizeIngestScan(scan: IngestScan): IngestScanSummary {
  const { items: _items, ...summary } = scan;
  return { ...summary, file: ingestScanPath(scan.jobId) };
}
