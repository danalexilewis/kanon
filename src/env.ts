import { homedir } from 'node:os';
import { join } from 'node:path';

/** Directory for machine config (`config.yml`). */
export function kanonHome(): string {
  if (process.env.KANON_HOME !== undefined && process.env.KANON_HOME.length > 0) {
    return process.env.KANON_HOME;
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg !== undefined && xdg.length > 0) {
    return join(xdg, 'kanon');
  }
  return join(homedir(), '.config', 'kanon');
}

/** Directory for rebuildable indexes and catalogues. */
export function kanonCache(): string {
  if (process.env.KANON_CACHE !== undefined && process.env.KANON_CACHE.length > 0) {
    return process.env.KANON_CACHE;
  }
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg !== undefined && xdg.length > 0) {
    return join(xdg, 'kanon');
  }
  return join(homedir(), '.cache', 'kanon');
}

export function configPath(): string {
  return join(kanonHome(), 'config.yml');
}

export function indexDir(indexId: string): string {
  return join(kanonCache(), 'indexes', indexId);
}

export function indexDbPath(indexId: string): string {
  return join(indexDir(indexId), 'index.sqlite');
}

export function cataloguePath(indexId: string): string {
  return join(indexDir(indexId), 'catalogue.json');
}

/** Device identity. Never synced between machines. */
export function devicePath(): string {
  return join(kanonHome(), 'device.yml');
}

/** Connector secrets, one `<connector-id>.json` per connector (mode 0600). */
export function credentialsDir(): string {
  return join(kanonHome(), 'credentials');
}

export function credentialsPath(connectorId: string): string {
  return join(credentialsDir(), `${connectorId}.json`);
}

/** Scheduled job state, locks, run reports, and temporary worktrees. */
export function jobsDir(): string {
  return join(kanonCache(), 'jobs');
}

export function jobStatePath(): string {
  return join(jobsDir(), 'state.json');
}

export function jobLockPath(): string {
  return join(jobsDir(), 'tick.lock');
}

export function jobRunsDir(): string {
  return join(jobsDir(), 'runs');
}

export function jobLogsDir(): string {
  return join(jobsDir(), 'logs');
}

/** The saved listing for an ingest job, written by `kanon ingest scan`. */
export function ingestScanPath(jobId: string): string {
  return join(jobsDir(), 'scans', `${jobId}.json`);
}

export function worktreeDir(jobId: string): string {
  return join(jobsDir(), 'worktrees', jobId);
}
