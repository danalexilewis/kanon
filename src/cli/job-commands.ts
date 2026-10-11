import { homedir } from 'node:os';

import { initDevice, loadDevice, renameDevice } from '../config/device.js';
import { saveMachineConfig } from '../config/machine.js';
import { ingestSchedule, ingestTarget, sourceRefresh, type MachineSource } from '../config/schemas.js';
import { runIngest } from '../jobs/ingest.js';
import {
  currentTickCommand,
  defaultLogPath,
  installSchedule,
  runCommand,
  scheduleStatus,
  uninstallSchedule,
  type ScheduleDeps,
} from '../jobs/os-schedule.js';
import { rebuildIndexes, refreshSources } from '../jobs/refresh.js';
import { acquireTickLock, loadJobState, recordOutcome, saveJobState } from '../jobs/state.js';
import { jobsStatus } from '../jobs/status.js';
import { ingestSucceeded, refreshSucceeded, runTick } from '../jobs/tick.js';
import { probeSourceAccess } from '../sources/access.js';
import { dispatchConnectorCli } from './connector-commands.js';
import { flagBool, flagString, type ParsedCli } from './parse.js';
import {
  assertWriteAccess,
  parseAccessFlag,
  parseCadenceFlag,
  printJson,
  requireConfig,
  validatedConfig,
} from './shared.js';

function shift(cli: ParsedCli): ParsedCli {
  return { ...cli, rest: cli.rest.slice(1) };
}

/** Manual runs share the tick lock so they never race a scheduled tick. */
async function withTickLock<T>(work: () => Promise<T>): Promise<T> {
  const release = await acquireTickLock();
  if (release.isErr()) {
    throw new Error(release.error.message);
  }
  try {
    return await work();
  } finally {
    await release.value();
  }
}

async function cmdDeviceShow(): Promise<void> {
  const device = await initDevice();
  if (device.isErr()) {
    throw new Error(device.error.message);
  }
  printJson(device.value);
}

async function cmdDeviceRename(cli: ParsedCli): Promise<void> {
  const name = cli.rest[0];
  if (name === undefined) {
    throw new Error('device rename <name>');
  }
  const device = await renameDevice(name);
  if (device.isErr()) {
    throw new Error(device.error.message);
  }
  printJson(device.value);
}

async function cmdSourceSet(cli: ParsedCli): Promise<void> {
  const id = cli.rest[0];
  if (id === undefined) {
    throw new Error(
      'source set <id> [--access read|write] [--refresh off|hourly|daily|weekly] [--remote <url>] [--branch <name>]',
    );
  }
  const config = await requireConfig();
  const existing = config.sources.find((source) => source.id === id);
  if (existing === undefined) {
    throw new Error('Unknown source id');
  }
  const access = parseAccessFlag(cli);
  const refresh = parseCadenceFlag(cli, 'refresh');
  const remote = flagString(cli.flags, 'remote');
  const branch = flagString(cli.flags, 'branch');
  const updated: MachineSource = {
    ...existing,
    ...(access !== undefined ? { access } : {}),
    ...(refresh !== undefined ? { refresh } : {}),
    ...(remote !== undefined ? { remote } : {}),
    ...(branch !== undefined ? { branch } : {}),
  };
  const next = validatedConfig({
    ...config,
    sources: config.sources.map((source) => (source.id === id ? updated : source)),
  });
  await assertWriteAccess(updated);
  await saveMachineConfig(next);
  printJson(updated);
}

async function cmdSourceProbe(cli: ParsedCli): Promise<void> {
  const id = cli.rest[0];
  const config = await requireConfig();
  const sources =
    id === undefined
      ? config.sources.filter((source) => source.kind === 'managed')
      : config.sources.filter((source) => source.id === id);
  if (id !== undefined && sources.length === 0) {
    throw new Error('Unknown source id');
  }
  const probes = [];
  for (const source of sources) {
    probes.push(await probeSourceAccess(source));
  }
  printJson(probes);
}

async function cmdRefresh(cli: ParsedCli): Promise<void> {
  const config = await requireConfig();
  const id = cli.rest[0];
  const sources =
    id === undefined
      ? config.sources.filter((source) => sourceRefresh(source) !== 'off')
      : config.sources.filter((source) => source.id === id);
  if (id !== undefined && sources.length === 0) {
    throw new Error('Unknown source id');
  }
  const result = await withTickLock(async () => {
    const refreshed = await refreshSources(config, sources, { force: flagBool(cli.flags, 'force') });
    const at = new Date().toISOString();
    let state = await loadJobState();
    for (const report of refreshed.sources) {
      state = recordOutcome(state, 'refresh', report.sourceId, {
        at,
        status: report.status,
        ok: refreshSucceeded(report),
        ...(report.detail !== undefined ? { detail: report.detail } : {}),
      });
    }
    await saveJobState(state);
    return refreshed;
  });
  printJson(result);
}

async function cmdTick(cli: ParsedCli): Promise<void> {
  const config = await requireConfig();
  const result = await runTick(config, { force: flagBool(cli.flags, 'force') });
  if (result.isErr()) {
    printJson({ status: 'locked', detail: result.error.message });
    return;
  }
  printJson(result.value);
  if (!result.value.ok) {
    process.exitCode = 1;
  }
}

async function cmdJobsStatus(): Promise<void> {
  printJson(await jobsStatus(await requireConfig()));
}

function scheduleDeps(): ScheduleDeps {
  return {
    platform: process.platform,
    homeDir: homedir(),
    uid: process.getuid?.() ?? 0,
    run: runCommand,
    command: currentTickCommand(),
    logPath: defaultLogPath(),
  };
}

async function cmdSchedule(cli: ParsedCli): Promise<void> {
  const sub = cli.rest[0];
  const deps = scheduleDeps();
  const result =
    sub === 'install'
      ? await installSchedule(deps, { dryRun: flagBool(cli.flags, 'dry-run') })
      : sub === 'uninstall'
        ? await uninstallSchedule(deps)
        : sub === 'status' || sub === undefined
          ? await scheduleStatus(deps)
          : undefined;
  if (result === undefined) {
    throw new Error('schedule install [--dry-run] | uninstall | status');
  }
  if (result.isErr()) {
    throw new Error(result.error.message);
  }
  printJson(result.value);
}

async function cmdIngestList(): Promise<void> {
  const config = await requireConfig();
  printJson(
    (config.ingest ?? []).map((job) => ({
      id: job.id,
      connector: job.connector,
      source: job.source,
      folder: job.folder,
      target: ingestTarget(job),
      schedule: ingestSchedule(job),
      images: job.images ?? 'extract',
      ...(job.device !== undefined ? { device: job.device } : {}),
    })),
  );
}

async function cmdIngestRun(cli: ParsedCli): Promise<void> {
  const id = cli.rest[0];
  if (id === undefined) {
    throw new Error('ingest run <job-id> [--dry-run] [--here]');
  }
  const config = await requireConfig();
  if (!(config.ingest ?? []).some((job) => job.id === id)) {
    throw new Error('Unknown ingest job id');
  }
  const device = await loadDevice();
  const dryRun = flagBool(cli.flags, 'dry-run');
  const outcome = await withTickLock(async () => {
    const report = await runIngest(config, id, {
      dryRun,
      here: flagBool(cli.flags, 'here'),
      ...(device.isOk() ? { deviceName: device.value.name } : {}),
    });
    if (report.status === 'assigned_elsewhere' || dryRun) {
      return { report, indexes: [] };
    }
    const state = recordOutcome(await loadJobState(), 'ingest', id, {
      at: new Date().toISOString(),
      status: report.status,
      ok: ingestSucceeded(report),
      ...(report.detail !== undefined ? { detail: report.detail } : {}),
    });
    await saveJobState(state);
    return { report, indexes: await rebuildIndexes(config, report.indexes) };
  });
  printJson(outcome);
  if (!ingestSucceeded(outcome.report)) {
    process.exitCode = 1;
  }
}

/** Handle job, device, connector and access commands. Returns false when not ours. */
export async function dispatchJobCli(cli: ParsedCli): Promise<boolean> {
  const sub = cli.rest[0];
  if (cli.command === 'refresh') {
    await cmdRefresh(cli);
    return true;
  }
  if (cli.command === 'tick') {
    await cmdTick(cli);
    return true;
  }
  if (cli.command === 'jobs' && (sub === 'status' || sub === undefined)) {
    await cmdJobsStatus();
    return true;
  }
  if (cli.command === 'schedule') {
    await cmdSchedule(cli);
    return true;
  }
  if (cli.command === 'ingest' && (sub === 'list' || sub === undefined)) {
    await cmdIngestList();
    return true;
  }
  if (cli.command === 'ingest' && sub === 'run') {
    await cmdIngestRun(shift(cli));
    return true;
  }
  if (cli.command === 'device' && (sub === 'show' || sub === undefined)) {
    await cmdDeviceShow();
    return true;
  }
  if (cli.command === 'device' && sub === 'rename') {
    await cmdDeviceRename(shift(cli));
    return true;
  }
  if (cli.command === 'source' && sub === 'set') {
    await cmdSourceSet(shift(cli));
    return true;
  }
  if (cli.command === 'source' && sub === 'probe') {
    await cmdSourceProbe(shift(cli));
    return true;
  }
  return dispatchConnectorCli(cli);
}
