import { readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { jobLockPath } from '../src/env.js';
import { DRIFT_TOLERANCE_MS, isDue, nextDueAt } from '../src/jobs/cadence.js';
import {
  acquireTickLock,
  emptyJobState,
  loadJobState,
  recordOutcome,
  saveJobState,
} from '../src/jobs/state.js';

const NOW = new Date('2026-10-11T02:00:00.000Z');

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe('cadence', () => {
  it('treats never-run jobs as due and off as never due', () => {
    expect(isDue('daily', undefined, NOW)).toBe(true);
    expect(isDue('off', undefined, NOW)).toBe(false);
    expect(nextDueAt('off', undefined, NOW)).toBeUndefined();
  });

  it('is not due inside the interval and due after it', () => {
    expect(isDue('daily', ago(3 * 3_600_000), NOW)).toBe(false);
    expect(isDue('daily', ago(25 * 3_600_000), NOW)).toBe(true);
    expect(isDue('weekly', ago(6 * 24 * 3_600_000), NOW)).toBe(false);
    expect(isDue('weekly', ago(8 * 24 * 3_600_000), NOW)).toBe(true);
  });

  it('tolerates an hourly tick that fires a little early', () => {
    expect(isDue('hourly', ago(3_600_000 - 30_000), NOW)).toBe(true);
    expect(isDue('hourly', ago(3_600_000 - DRIFT_TOLERANCE_MS - 1_000), NOW)).toBe(false);
  });

  it('catches up after sleep and recovers from a clock set backwards', () => {
    expect(isDue('daily', ago(3 * 24 * 3_600_000), NOW)).toBe(true);
    expect(isDue('daily', new Date(NOW.getTime() + 86_400_000).toISOString(), NOW)).toBe(true);
    const next = nextDueAt('daily', ago(3_600_000), NOW);
    expect(Date.parse(next ?? '')).toBe(
      NOW.getTime() - 3_600_000 + 86_400_000 - DRIFT_TOLERANCE_MS,
    );
  });
});

describe('job state and lock', () => {
  it('records attempts and keeps the last success on failure', async () => {
    let state = recordOutcome(emptyJobState(), 'ingest', 'policies', {
      at: ago(10),
      status: 'pushed',
      ok: true,
    });
    state = recordOutcome(state, 'ingest', 'policies', {
      at: NOW.toISOString(),
      status: 'failed',
      ok: false,
      detail: 'boom',
    });
    await saveJobState(state);
    const loaded = await loadJobState();
    expect(loaded.ingest.policies).toEqual({
      lastAttemptAt: NOW.toISOString(),
      lastSuccessAt: ago(10),
      lastStatus: 'failed',
      lastDetail: 'boom',
    });
  });

  it('refuses a second holder and replaces a stale lock', async () => {
    const first = await acquireTickLock(NOW);
    expect(first.isOk()).toBe(true);
    const second = await acquireTickLock(NOW);
    expect(second._unsafeUnwrapErr().code).toBe('job_locked');
    await first._unsafeUnwrap()();

    await writeFile(
      jobLockPath(),
      JSON.stringify({ pid: 999_999_999, startedAt: NOW.toISOString() }),
    );
    const replaced = await acquireTickLock(NOW);
    expect(replaced.isOk()).toBe(true);
    expect(JSON.parse(await readFile(jobLockPath(), 'utf8')).pid).toBe(process.pid);
    await replaced._unsafeUnwrap()();
  });
});
