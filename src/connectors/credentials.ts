import { access, chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { credentialsPath } from '../env.js';

export async function credentialsExist(connectorId: string): Promise<boolean> {
  try {
    await access(credentialsPath(connectorId));
    return true;
  } catch {
    return false;
  }
}

export async function readCredentials(connectorId: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(credentialsPath(connectorId), 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

/** Atomic write, owner-only permissions. Secrets never go in config.yml or a repo. */
export async function writeCredentials(connectorId: string, value: unknown): Promise<void> {
  const path = credentialsPath(connectorId);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
}
