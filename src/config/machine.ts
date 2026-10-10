import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { err, ok, type Result } from 'neverthrow';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { configPath } from '../env.js';
import { invalidConfig } from '../errors.js';
import type { RailError } from '@eddy-works/never-rest';
import {
  emptyMachineConfig,
  machineConfigSchema,
  type MachineConfig,
} from './schemas.js';

export function parseMachineConfig(
  value: unknown,
): Result<MachineConfig, RailError<'invalid_config'>> {
  const parsed = machineConfigSchema.safeParse(value);
  if (!parsed.success) {
    return err(
      invalidConfig(parsed.error.issues[0]?.message ?? 'Invalid machine config'),
    );
  }
  return ok(parsed.data);
}

export async function loadMachineConfig(): Promise<
  Result<MachineConfig, RailError<'invalid_config'>>
> {
  try {
    const text = await readFile(configPath(), 'utf8');
    return parseMachineConfig(parseYaml(text));
  } catch {
    return err(invalidConfig('Machine config is missing. Run kanon init.'));
  }
}

export async function saveMachineConfig(config: MachineConfig): Promise<void> {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stringifyYaml(config), 'utf8');
}

export async function initMachineConfig(): Promise<MachineConfig> {
  try {
    await readFile(configPath(), 'utf8');
    const loaded = await loadMachineConfig();
    if (loaded.isOk()) {
      return loaded.value;
    }
  } catch {
    // create
  }
  const empty = emptyMachineConfig();
  await saveMachineConfig(empty);
  return empty;
}
