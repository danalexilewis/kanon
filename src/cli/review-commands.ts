import { loadDevice } from '../config/device.js';
import { circleAdmit, circleById } from '../config/schemas.js';
import { createConnector } from '../connectors/registry.js';
import { loadIngestScan } from '../jobs/ingest-scan.js';
import { connectorAccount } from '../jobs/readers.js';
import { approveDocument } from '../review/actions.js';
import { appendLedger, documentState, loadLedger } from '../review/io.js';
import type { ReviewEntry } from '../review/ledger.js';
import { selectQueuedUris } from '../review/select.js';
import { contentHash } from '../scoring/signals.js';
import { scoreWithModel } from '../scoring/model.js';
import { flagBool, flagString, type ParsedCli } from './parse.js';
import { printJson, requireConfig } from './shared.js';

function shift(cli: ParsedCli): ParsedCli {
  return { ...cli, rest: cli.rest.slice(1) };
}

async function assertJobDevice(jobDevice: string | undefined, here: boolean): Promise<void> {
  if (jobDevice === undefined || here) {
    return;
  }
  const device = await loadDevice();
  if (device.isOk() && device.value.name !== jobDevice) {
    throw new Error(`Assigned to device ${jobDevice}`);
  }
}

function resolveUris(
  items: readonly {
    readonly uri: string;
    readonly externalId: string;
    readonly docId: string;
    readonly title: string;
    readonly relativeDir: string;
  }[],
  tokens: readonly string[],
): string[] {
  return selectQueuedUris({ items, tokens });
}

async function loadJobScan(jobId: string) {
  const scan = await loadIngestScan(jobId);
  if (scan.isErr()) {
    throw new Error(scan.error.message);
  }
  return scan.value;
}

async function operatorBy(config: Parameters<typeof requireConfig> extends never ? never : Awaited<ReturnType<typeof requireConfig>>, connectorId: string): Promise<string> {
  const connectorConfig = (config.connectors ?? []).find((entry) => entry.id === connectorId);
  if (connectorConfig === undefined) {
    throw new Error('Unknown connector');
  }
  const connector = await createConnector(connectorConfig);
  if (connector.isErr()) {
    return 'operator@example.test';
  }
  const account = await connectorAccount(connector.value);
  return account.isOk() ? account.value : 'operator@example.test';
}

function now(): string {
  return new Date().toISOString();
}

async function cmdReviewList(cli: ParsedCli): Promise<void> {
  const jobId = cli.rest[0];
  if (jobId === undefined) {
    throw new Error('review list <job> [--circle <id>] [--pending]');
  }
  const config = await requireConfig();
  const job = (config.ingest ?? []).find((entry) => entry.id === jobId);
  if (job === undefined) {
    throw new Error('Unknown ingest job id');
  }
  await assertJobDevice(job.device, flagBool(cli.flags, 'here'));
  const scan = await loadJobScan(jobId);
  const ledger = await loadLedger(jobId);
  const circle = flagString(cli.flags, 'circle');
  const pending = flagBool(cli.flags, 'pending');
  const rows = scan.items
    .filter((item) => circle === undefined || item.eligible.includes(circle) || item.circle === circle)
    .map((item) => {
      const review = documentState(ledger.state, item.uri);
      return {
        uri: item.uri,
        title: item.title,
        readers: item.readers,
        eligible: item.eligible,
        level: review.finalLevel ?? review.proposedLevel ?? 0,
        excluded: review.excluded,
        approvals: Object.keys(review.approvals),
      };
    })
    .filter((row) => !pending || row.approvals.length === 0);
  printJson(rows);
}

async function cmdReviewQueue(cli: ParsedCli): Promise<void> {
  const jobId = cli.rest[0];
  const circle = flagString(cli.flags, 'circle');
  const folder = flagString(cli.flags, 'folder');
  const title = flagString(cli.flags, 'title');
  if (jobId === undefined || circle === undefined) {
    throw new Error('review queue <job> --circle <id> (<item>... | --folder <path> | --title <glob>)');
  }
  const config = await requireConfig();
  const job = (config.ingest ?? []).find((entry) => entry.id === jobId);
  if (job === undefined) {
    throw new Error('Unknown ingest job id');
  }
  await assertJobDevice(job.device, flagBool(cli.flags, 'here'));
  const scan = await loadJobScan(jobId);
  const tokens = cli.rest.slice(1);
  if (tokens.length === 0 && folder === undefined && title === undefined) {
    throw new Error('review queue <job> --circle <id> (<item>... | --folder <path> | --title <glob>)');
  }
  const uris = selectQueuedUris({
    items: scan.items,
    tokens,
    ...(folder !== undefined ? { folder } : {}),
    ...(title !== undefined ? { title } : {}),
  });
  if (uris.length === 0) {
    throw new Error('No documents matched');
  }
  const by = await operatorBy(config, job.connector);
  for (const uri of uris) {
    await appendLedger(jobId, {
      schema: 'kanon/review/v1',
      kind: 'queue',
      uri,
      circle,
      by,
      at: now(),
    });
  }
  printJson({ queued: uris, circle });
}

async function cmdReviewLevel(cli: ParsedCli): Promise<void> {
  const [jobId, item, levelText] = cli.rest;
  const note = flagString(cli.flags, 'note');
  const level = Number(levelText);
  if (jobId === undefined || item === undefined || note === undefined || ![0, 1, 2, 3].includes(level)) {
    throw new Error('review level <job> <item> <0-3> --note <text>');
  }
  const config = await requireConfig();
  const job = (config.ingest ?? []).find((entry) => entry.id === jobId);
  if (job === undefined) {
    throw new Error('Unknown ingest job id');
  }
  await assertJobDevice(job.device, flagBool(cli.flags, 'here'));
  const scan = await loadJobScan(jobId);
  const [uri] = resolveUris(scan.items, [item]);
  await appendLedger(jobId, {
    schema: 'kanon/review/v1',
    kind: 'level',
    uri: uri ?? item,
    level: level as 0 | 1 | 2 | 3,
    note,
    by: await operatorBy(config, job.connector),
    at: now(),
  });
  printJson({ uri, level });
}

async function cmdReviewApprove(cli: ParsedCli): Promise<void> {
  const jobId = cli.rest[0];
  const circleId = flagString(cli.flags, 'circle');
  const note = flagString(cli.flags, 'note');
  if (jobId === undefined || circleId === undefined || note === undefined) {
    throw new Error('review approve <job> <item>... --circle <id> --note <text>');
  }
  const config = await requireConfig();
  const job = (config.ingest ?? []).find((entry) => entry.id === jobId);
  const circle = circleById(config, circleId);
  if (job === undefined || circle === undefined) {
    throw new Error('Unknown ingest job or circle');
  }
  await assertJobDevice(job.device, flagBool(cli.flags, 'here'));
  if (circleAdmit(circle) === 'review' && circle.ceiling < 0) {
    throw new Error('Circle ceiling refuses this approval');
  }
  const scan = await loadJobScan(jobId);
  const connectorConfig = (config.connectors ?? []).find((entry) => entry.id === job.connector);
  const connector = connectorConfig !== undefined ? await createConnector(connectorConfig) : undefined;
  const account = connector?.isOk() === true ? await connectorAccount(connector.value) : undefined;
  const by = account?.isOk() === true ? account.value : 'operator@example.test';
  const recorded: string[] = [];
  for (const uri of resolveUris(scan.items, cli.rest.slice(1))) {
    const item = scan.items.find((entry) => entry.uri === uri);
    const hash = contentHash(item !== undefined ? `# ${item.title}\n` : uri);
    const result = await approveDocument({
      config,
      jobId,
      uri,
      circleId,
      note,
      by,
      hash,
      readers: item?.readers ?? [],
      level: 0,
      ...(connector?.isOk() === true ? { connector: connector.value } : {}),
      ...(item !== undefined
        ? {
            item: {
              externalId: item.externalId,
              uri: item.uri,
              title: item.title,
              relativeDir: item.relativeDir,
              revision: item.revision,
              formats: item.formats,
            },
          }
        : {}),
    });
    if (result.isErr()) {
      throw new Error(result.error.message);
    }
    recorded.push(uri);
  }
  printJson({ approved: recorded, circle: circleId });
}

async function cmdReviewKind(kind: 'revoke' | 'exclude' | 'include', cli: ParsedCli): Promise<void> {
  const [jobId, item] = cli.rest;
  const note = flagString(cli.flags, 'note');
  if (jobId === undefined || item === undefined || note === undefined) {
    throw new Error(`review ${kind} <job> <item> --note <text>`);
  }
  const config = await requireConfig();
  const job = (config.ingest ?? []).find((entry) => entry.id === jobId);
  if (job === undefined) {
    throw new Error('Unknown ingest job id');
  }
  await assertJobDevice(job.device, flagBool(cli.flags, 'here'));
  const scan = await loadJobScan(jobId);
  const [uri] = resolveUris(scan.items, [item]);
  const entry: ReviewEntry = {
    schema: 'kanon/review/v1',
    kind,
    uri: uri ?? item,
    note,
    by: await operatorBy(config, job.connector),
    at: now(),
    ...(flagString(cli.flags, 'circle') !== undefined ? { circle: flagString(cli.flags, 'circle') } : {}),
  };
  await appendLedger(jobId, entry);
  printJson({ kind, uri });
}

async function cmdReviewScore(cli: ParsedCli): Promise<void> {
  const jobId = cli.rest[0];
  if (jobId === undefined) {
    throw new Error('review score <job> [--queued] [--limit <n>] [--dry-run]');
  }
  const config = await requireConfig();
  const job = (config.ingest ?? []).find((entry) => entry.id === jobId);
  if (job === undefined || job.score === undefined) {
    throw new Error('Job has no scorer');
  }
  await assertJobDevice(job.device, flagBool(cli.flags, 'here'));
  const scan = await loadJobScan(jobId);
  const ledger = await loadLedger(jobId);
  const wanted = job.score.for;
  const queuedOnly = flagBool(cli.flags, 'queued');
  const candidates = scan.items.filter((item) => {
    const review = documentState(ledger.state, item.uri);
    const queued = wanted.some((circle) => review.queued.has(circle));
    const eligible = item.eligible.some((circle) => wanted.includes(circle));
    return queuedOnly ? queued : queued || eligible;
  });
  const limit = Number(flagString(cli.flags, 'limit') ?? candidates.length);
  const chosen = candidates.slice(0, Number.isInteger(limit) ? limit : candidates.length);
  if (flagBool(cli.flags, 'dry-run')) {
    printJson({
      wouldScore: chosen.length,
      characters: chosen.reduce((sum, item) => sum + item.title.length, 0),
    });
    return;
  }
  const scorer = (config.scorers ?? []).find((entry) => entry.id === job.score?.scorer);
  if (scorer === undefined) {
    throw new Error('Unknown scorer');
  }
  const scored = await scoreWithModel({
    scorer,
    items: chosen.map((item) => ({ uri: item.uri, title: item.title, body: '', readers: item.readers.length })),
  });
  if (scored.isErr()) {
    throw new Error(scored.error.message);
  }
  for (const proposal of scored.value) {
    await appendLedger(jobId, {
      schema: 'kanon/review/v1',
      kind: 'proposal',
      uri: proposal.uri,
      proposedLevel: proposal.level,
      reasons: [...proposal.reasons],
      ...(proposal.dimensions !== undefined ? { dimensions: { ...proposal.dimensions } } : {}),
      by: `scorer:${scorer.id}`,
      at: now(),
    });
  }
  printJson({ scored: scored.value.length });
}

export async function dispatchReviewCli(cli: ParsedCli): Promise<boolean> {
  if (cli.command !== 'review') {
    return false;
  }
  const sub = cli.rest[0];
  if (sub === 'list') {
    await cmdReviewList(shift(cli));
    return true;
  }
  if (sub === 'queue') {
    await cmdReviewQueue(shift(cli));
    return true;
  }
  if (sub === 'level') {
    await cmdReviewLevel(shift(cli));
    return true;
  }
  if (sub === 'approve') {
    await cmdReviewApprove(shift(cli));
    return true;
  }
  if (sub === 'revoke' || sub === 'exclude' || sub === 'include') {
    await cmdReviewKind(sub, shift(cli));
    return true;
  }
  if (sub === 'score') {
    await cmdReviewScore(shift(cli));
    return true;
  }
  throw new Error('review list|queue|level|approve|revoke|exclude|include|score');
}
