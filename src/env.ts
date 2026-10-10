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
