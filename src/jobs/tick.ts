import { err, ok, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import { loadDevice } from '../config/device.js';
import {
  ingestSchedule,
  sourceRefresh,
  type MachineConfig,
} from '../config/schemas.js';
import { credentialsExist } from '../connectors/credentials.js';
import { isDue } from './cadence.js';
import { runIngest, type IngestDeps, type IngestReport, type IngestStatus } from './ingest.js';
import {
  rebuildIndexes,
  refreshSource,
  type IndexRebuild,
  type RefreshStatus,
  type SourceRefreshReport,
} from './refresh.js';
import {
  acquireTickLock,
  loadJobState,
  recordOutcome,
  saveJobState,
  writeRunReport,
} from './state.js';

export interface TickSkip {
  readonly kind: 'refresh' | 'ingest';
  readonly id: string;
  readonly reason: 'not_due' | 'off' | 'assigned_elsewhere' | 'no_credentials';
  readonly detail?: string;
}

export interface TickReport {
  readonly schema: 'kanon/tick-report/v1';
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly device?: string;
  readonly refresh: readonly SourceRefreshReport[];
  readonly ingest: readonly IngestReport[];
  readonly indexes: readonly IndexRebuild[];
  readonly skipped: readonly TickSkip[];
  /** False when any job or rebuild failed; dirty or diverged checkouts count. */
  readonly ok: boolean;
  readonly reportPath?: string;
}

export interface TickOptions {
  /** Run every enabled job now, ignoring cadence. */
  readonly force?: boolean;
}

export interface TickDeps {
  readonly now?: () => Date;
  readonly ingest?: IngestDeps;
}

const REFRESH_OK: ReadonlySet<RefreshStatus> = new Set(['unchanged', 'updated']);
const INGEST_OK: ReadonlySet<IngestStatus> = new Set(['pushed', 'unchanged', 'dry_run']);

export function refreshSucceeded(report: SourceRefreshReport): boolean {
  return REFRESH_OK.has(report.status);
}

export function ingestSucceeded(report: IngestReport): boolean {
  return INGEST_OK.has(report.status);
}

/**
 * One scheduler pass, fired hourly by launchd or systemd. Runs due refreshes,
 * then due ingest jobs for this device (assigned here, or unassigned and this
 * device holds the connector's credentials), then rebuilds each affected
 * index once. Overlapping ticks are refused by the lock.
 */
export async function runTick(
  config: MachineConfig,
  options: TickOptions = {},
  deps: TickDeps = {},
): Promise<Result<TickReport, RailError<'job_locked'>>> {
  const now = deps.now?.() ?? new Date();
  const at = now.toISOString();
  const release = await acquireTickLock(now);
  if (release.isErr()) {
    return err(release.error);
  }
  try {
    let state = await loadJobState();
    const device = await loadDevice();
    const deviceName = device.isOk() ? device.value.name : undefined;
    const skipped: TickSkip[] = [];

    const refresh: SourceRefreshReport[] = [];
    for (const source of config.sources) {
      const cadence = sourceRefresh(source);
      if (cadence === 'off') {
        skipped.push({ kind: 'refresh', id: source.id, reason: 'off' });
        continue;
      }
      if (options.force !== true && !isDue(cadence, state.refresh[source.id]?.lastAttemptAt, now)) {
        skipped.push({ kind: 'refresh', id: source.id, reason: 'not_due' });
        continue;
      }
      const report = await refreshSource(config, source);
      refresh.push(report);
      state = recordOutcome(state, 'refresh', source.id, {
        at,
        status: report.status,
        ok: refreshSucceeded(report),
        ...(report.detail !== undefined ? { detail: report.detail } : {}),
      });
    }

    const ingest: IngestReport[] = [];
    for (const job of config.ingest ?? []) {
      const cadence = ingestSchedule(job);
      if (cadence === 'off') {
        skipped.push({ kind: 'ingest', id: job.id, reason: 'off' });
        continue;
      }
      if (job.device !== undefined && job.device !== deviceName) {
        skipped.push({
          kind: 'ingest',
          id: job.id,
          reason: 'assigned_elsewhere',
          detail: `Assigned to device ${job.device}`,
        });
        continue;
      }
      if (job.device === undefined && !(await credentialsExist(job.connector))) {
        skipped.push({
          kind: 'ingest',
          id: job.id,
          reason: 'no_credentials',
          detail: `No credentials for connector ${job.connector} on this device`,
        });
        continue;
      }
      if (options.force !== true && !isDue(cadence, state.ingest[job.id]?.lastAttemptAt, now)) {
        skipped.push({ kind: 'ingest', id: job.id, reason: 'not_due' });
        continue;
      }
      const report = await runIngest(
        config,
        job.id,
        deviceName !== undefined ? { deviceName } : {},
        deps.ingest,
      );
      ingest.push(report);
      state = recordOutcome(state, 'ingest', job.id, {
        at,
        status: report.status,
        ok: ingestSucceeded(report),
        ...(report.detail !== undefined ? { detail: report.detail } : {}),
      });
    }

    const indexes = await rebuildIndexes(config, [
      ...refresh.flatMap((report) => report.indexes),
      ...ingest.flatMap((report) => report.indexes),
    ]);
    await saveJobState(state);

    const report: TickReport = {
      schema: 'kanon/tick-report/v1',
      startedAt: at,
      finishedAt: new Date().toISOString(),
      ...(deviceName !== undefined ? { device: deviceName } : {}),
      refresh,
      ingest,
      indexes,
      skipped,
      ok:
        refresh.every(refreshSucceeded) &&
        ingest.every(ingestSucceeded) &&
        indexes.every((rebuild) => rebuild.ok),
    };
    const reportPath = await writeRunReport(report, now);
    return ok({ ...report, reportPath });
  } finally {
    await release.value();
  }
}
