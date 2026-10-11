import type { Cadence } from '../config/schemas.js';

const HOUR_MS = 3_600_000;

const CADENCE_MS: Readonly<Record<Exclude<Cadence, 'off'>, number>> = {
  hourly: HOUR_MS,
  daily: 24 * HOUR_MS,
  weekly: 7 * 24 * HOUR_MS,
};

/** Slack so an hourly OS tick that fires a few seconds early is not skipped. */
export const DRIFT_TOLERANCE_MS = 5 * 60_000;

export function cadenceIntervalMs(cadence: Cadence): number | undefined {
  return cadence === 'off' ? undefined : CADENCE_MS[cadence];
}

/**
 * Due when the last attempt is at least one interval (minus drift tolerance)
 * ago. Never-run jobs are due; a last attempt stamped in the future (clock
 * change) counts as due rather than stalling the job.
 */
export function isDue(
  cadence: Cadence,
  lastAttemptAt: string | undefined,
  now: Date,
): boolean {
  const interval = cadenceIntervalMs(cadence);
  if (interval === undefined) {
    return false;
  }
  if (lastAttemptAt === undefined) {
    return true;
  }
  const last = Date.parse(lastAttemptAt);
  if (Number.isNaN(last) || last > now.getTime() + DRIFT_TOLERANCE_MS) {
    return true;
  }
  return now.getTime() - last >= interval - DRIFT_TOLERANCE_MS;
}

export function nextDueAt(
  cadence: Cadence,
  lastAttemptAt: string | undefined,
  now: Date,
): string | undefined {
  const interval = cadenceIntervalMs(cadence);
  if (interval === undefined) {
    return undefined;
  }
  if (isDue(cadence, lastAttemptAt, now) || lastAttemptAt === undefined) {
    return now.toISOString();
  }
  return new Date(Date.parse(lastAttemptAt) + interval - DRIFT_TOLERANCE_MS).toISOString();
}
