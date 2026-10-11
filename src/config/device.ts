import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname } from 'node:path';

import { err, ok, type Result } from 'neverthrow';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import type { RailError } from '@eddy-works/never-rest';
import { devicePath } from '../env.js';
import { invalidConfig } from '../errors.js';
import { deviceSchema, type Device } from './schemas.js';

/** Turn a hostname like `Dans-MacBook-Pro.local` into `dans-macbook-pro`. */
export function deviceNameFromHostname(host: string): string {
  const slug = host
    .toLowerCase()
    .replace(/\.(local|lan|home)$/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return slug.length > 0 ? slug : 'device';
}

export function parseDevice(value: unknown): Result<Device, RailError<'invalid_config'>> {
  const parsed = deviceSchema.safeParse(value);
  if (!parsed.success) {
    return err(invalidConfig(parsed.error.issues[0]?.message ?? 'Invalid device.yml'));
  }
  return ok(parsed.data);
}

export async function loadDevice(): Promise<Result<Device, RailError<'invalid_config'>>> {
  let text: string;
  try {
    text = await readFile(devicePath(), 'utf8');
  } catch {
    return err(invalidConfig('Device identity is missing. Run kanon init.'));
  }
  return parseDevice(parseYaml(text));
}

async function saveDevice(device: Device): Promise<void> {
  const path = devicePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stringifyYaml(device), 'utf8');
}

/**
 * Create `device.yml` once. An existing valid file is returned unchanged, so
 * the name survives hostname changes; an invalid file is reported, not replaced.
 */
export async function initDevice(): Promise<Result<Device, RailError<'invalid_config'>>> {
  try {
    await readFile(devicePath(), 'utf8');
    return loadDevice();
  } catch {
    const device: Device = {
      schema: 'kanon/device/v1',
      id: randomUUID(),
      name: deviceNameFromHostname(hostname()),
    };
    await saveDevice(device);
    return ok(device);
  }
}

export async function renameDevice(
  name: string,
): Promise<Result<Device, RailError<'invalid_config'>>> {
  const current = await initDevice();
  if (current.isErr()) {
    return err(current.error);
  }
  const next = parseDevice({ ...current.value, name });
  if (next.isErr()) {
    return err(invalidConfig('Device name must be lowercase letters, digits and dashes'));
  }
  await saveDevice(next.value);
  return ok(next.value);
}
