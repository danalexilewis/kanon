import { loadMachineConfig, parseMachineConfig } from '../config/machine.js';
import {
  cadenceSchema,
  type Cadence,
  type MachineConfig,
  type MachineSource,
} from '../config/schemas.js';
import { probeSourceWrite } from '../sources/access.js';
import { flagString, type ParsedCli } from './parse.js';

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function requireConfig(): Promise<MachineConfig> {
  const loaded = await loadMachineConfig();
  if (loaded.isErr()) {
    throw new Error(loaded.error.message);
  }
  return loaded.value;
}

/** Run the full schema (cross-field rules included) before a config is saved. */
export function validatedConfig(config: MachineConfig): MachineConfig {
  const parsed = parseMachineConfig(config);
  if (parsed.isErr()) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

/** A write grant is saved only after `git push --dry-run` succeeds. */
export async function assertWriteAccess(source: MachineSource): Promise<void> {
  if (source.access !== 'write') {
    return;
  }
  const probe = await probeSourceWrite(source);
  if (probe.isErr()) {
    throw new Error(`Write access refused: ${probe.error.message}`);
  }
}

export function parseCadenceFlag(cli: ParsedCli, name: string): Cadence | undefined {
  const value = flagString(cli.flags, name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = cadenceSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`--${name} must be off, hourly, daily or weekly`);
  }
  return parsed.data;
}

export function parseAccessFlag(cli: ParsedCli): 'read' | 'write' | undefined {
  const value = flagString(cli.flags, 'access');
  if (value === undefined) {
    return undefined;
  }
  if (value !== 'read' && value !== 'write') {
    throw new Error('--access must be read or write');
  }
  return value;
}
