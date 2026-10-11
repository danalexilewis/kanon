import { loadDevice } from '../config/device.js';
import {
  ingestSchedule,
  sourceRefresh,
  type Cadence,
  type MachineConfig,
} from '../config/schemas.js';
import { credentialsExist } from '../connectors/credentials.js';
import { nextDueAt } from './cadence.js';
import { loadJobState, type JobKind, type JobRecord } from './state.js';

export interface JobStatusEntry {
  readonly kind: JobKind;
  readonly id: string;
  readonly cadence: Cadence;
  /** The source a refresh checks, or the source an ingest job writes to. */
  readonly sourceId: string;
  readonly device?: string;
  /** False when assigned to another device, or unassigned and this device lacks credentials. */
  readonly runsHere: boolean;
  readonly lastAttemptAt?: string;
  readonly lastSuccessAt?: string;
  readonly lastStatus?: string;
  readonly lastDetail?: string;
  readonly nextDueAt?: string;
}

export interface JobsStatus {
  readonly device?: string;
  readonly jobs: readonly JobStatusEntry[];
}

function withRecord(record: JobRecord | undefined): Partial<JobStatusEntry> {
  return { ...(record ?? {}) };
}

/** Last run, next due time and assignment for every refresh and ingest job. */
export async function jobsStatus(
  config: MachineConfig,
  now: Date = new Date(),
): Promise<JobsStatus> {
  const state = await loadJobState();
  const device = await loadDevice();
  const deviceName = device.isOk() ? device.value.name : undefined;

  const refresh = config.sources.map((source): JobStatusEntry => {
    const cadence = sourceRefresh(source);
    const record = state.refresh[source.id];
    const next = nextDueAt(cadence, record?.lastAttemptAt, now);
    return {
      kind: 'refresh',
      id: source.id,
      cadence,
      sourceId: source.id,
      runsHere: true,
      ...withRecord(record),
      ...(next !== undefined ? { nextDueAt: next } : {}),
    };
  });

  const ingest: JobStatusEntry[] = [];
  for (const job of config.ingest ?? []) {
    const cadence = ingestSchedule(job);
    const record = state.ingest[job.id];
    const runsHere =
      job.device === undefined ? await credentialsExist(job.connector) : job.device === deviceName;
    const next = runsHere ? nextDueAt(cadence, record?.lastAttemptAt, now) : undefined;
    ingest.push({
      kind: 'ingest',
      id: job.id,
      cadence,
      sourceId: job.source,
      ...(job.device !== undefined ? { device: job.device } : {}),
      runsHere,
      ...withRecord(record),
      ...(next !== undefined ? { nextDueAt: next } : {}),
    });
  }

  return { ...(deviceName !== undefined ? { device: deviceName } : {}), jobs: [...refresh, ...ingest] };
}
