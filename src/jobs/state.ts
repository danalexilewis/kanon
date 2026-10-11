import { mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';

import type { RailError } from '@eddy-works/never-rest';
import { jobLockPath, jobRunsDir, jobStatePath } from '../env.js';
import { jobLocked } from '../errors.js';

const jobRecordSchema = z
  .object({
    lastAttemptAt: z.string().optional(),
    lastSuccessAt: z.string().optional(),
    lastStatus: z.string().optional(),
    lastDetail: z.string().optional(),
  })
  .strict();

const jobStateSchema = z
  .object({
    schema: z.literal('kanon/job-state/v1'),
    refresh: z.record(z.string(), jobRecordSchema),
    ingest: z.record(z.string(), jobRecordSchema),
  })
  .strict();

export type JobRecord = z.infer<typeof jobRecordSchema>;
export type JobState = z.infer<typeof jobStateSchema>;
export type JobKind = 'refresh' | 'ingest';

export interface JobOutcome {
  readonly at: string;
  readonly status: string;
  readonly ok: boolean;
  readonly detail?: string;
}

/** Locks older than this are stale even if the pid was reused. */
const STALE_LOCK_MS = 12 * 3_600_000;
const KEPT_RUN_REPORTS = 50;

export function emptyJobState(): JobState {
  return { schema: 'kanon/job-state/v1', refresh: {}, ingest: {} };
}

/** Missing or unreadable state means every job is due, which is safe. */
export async function loadJobState(): Promise<JobState> {
  try {
    const parsed = jobStateSchema.safeParse(
      JSON.parse(await readFile(jobStatePath(), 'utf8')),
    );
    return parsed.success ? parsed.data : emptyJobState();
  } catch {
    return emptyJobState();
  }
}

async function writeAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, text, 'utf8');
  await rename(temp, path);
}

export async function saveJobState(state: JobState): Promise<void> {
  await writeAtomic(jobStatePath(), `${JSON.stringify(state, null, 2)}\n`);
}

export function recordOutcome(
  state: JobState,
  kind: JobKind,
  id: string,
  outcome: JobOutcome,
): JobState {
  const previous = state[kind][id] ?? {};
  const record: JobRecord = {
    lastAttemptAt: outcome.at,
    ...(outcome.ok
      ? { lastSuccessAt: outcome.at }
      : previous.lastSuccessAt !== undefined
        ? { lastSuccessAt: previous.lastSuccessAt }
        : {}),
    lastStatus: outcome.status,
    ...(outcome.detail !== undefined ? { lastDetail: outcome.detail.slice(0, 500) } : {}),
  };
  return { ...state, [kind]: { ...state[kind], [id]: record } };
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readLock(): Promise<{ readonly pid: number; readonly startedAt: string } | undefined> {
  try {
    const value = JSON.parse(await readFile(jobLockPath(), 'utf8')) as {
      pid?: unknown;
      startedAt?: unknown;
    };
    if (typeof value.pid === 'number' && typeof value.startedAt === 'string') {
      return { pid: value.pid, startedAt: value.startedAt };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function createLock(now: Date): Promise<boolean> {
  try {
    const handle = await open(jobLockPath(), 'wx');
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: now.toISOString() }));
    await handle.close();
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return false;
    }
    throw error;
  }
}

/**
 * Take the tick lock so overlapping ticks (a long ingest plus the next hourly
 * fire) never run jobs twice. A lock whose pid is gone, or which is older
 * than 12 hours, is treated as stale and replaced.
 */
export async function acquireTickLock(
  now: Date = new Date(),
): Promise<Result<() => Promise<void>, RailError<'job_locked'>>> {
  await mkdir(dirname(jobLockPath()), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (await createLock(now)) {
      return ok(async () => {
        const held = await readLock();
        if (held?.pid === process.pid) {
          await rm(jobLockPath(), { force: true });
        }
      });
    }
    const held = await readLock();
    const age = held === undefined ? Infinity : now.getTime() - Date.parse(held.startedAt);
    if (held !== undefined && pidAlive(held.pid) && age < STALE_LOCK_MS) {
      return err(
        jobLocked(`Another tick (pid ${held.pid}) has been running since ${held.startedAt}`),
      );
    }
    await rm(jobLockPath(), { force: true });
  }
  return err(jobLocked('Could not take the tick lock'));
}

/** Write a run report and keep only the most recent ones. */
export async function writeRunReport(report: unknown, now: Date): Promise<string> {
  const dir = jobRunsDir();
  const path = join(dir, `${now.toISOString().replace(/[:.]/g, '-')}.json`);
  await writeAtomic(path, `${JSON.stringify(report, null, 2)}\n`);
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  for (const name of files.slice(0, Math.max(files.length - KEPT_RUN_REPORTS, 0))) {
    await rm(join(dir, name), { force: true });
  }
  return path;
}
