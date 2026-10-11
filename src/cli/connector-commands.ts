import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { saveMachineConfig } from '../config/machine.js';
import type { MachineConnector } from '../config/schemas.js';
import { authorizeOAuth } from '../connectors/google-drive/auth.js';
import {
  loadGoogleCredentials,
  parseClientSecretFile,
  parseServiceAccountFile,
} from '../connectors/google-drive/credentials.js';
import { writeCredentials } from '../connectors/credentials.js';
import { flagString, type ParsedCli } from './parse.js';
import { printJson, requireConfig, validatedConfig } from './shared.js';

async function readJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Register a connector and copy its secret into `$KANON_HOME/credentials`.
 * Only the id, kind and auth mode go into `config.yml`.
 */
async function cmdConnectorAdd(cli: ParsedCli): Promise<void> {
  const id = cli.rest[0];
  const kind = flagString(cli.flags, 'kind');
  const clientSecret = flagString(cli.flags, 'client-secret');
  const serviceAccount = flagString(cli.flags, 'service-account');
  if (id === undefined || kind !== 'google-drive' || (clientSecret === undefined) === (serviceAccount === undefined)) {
    throw new Error(
      'connector add <id> --kind google-drive (--client-secret <json> | --service-account <json>)',
    );
  }
  const config = await requireConfig();
  const credentials =
    clientSecret !== undefined
      ? parseClientSecretFile(await readJsonFile(clientSecret))
      : parseServiceAccountFile(await readJsonFile(serviceAccount!));
  if (credentials.isErr()) {
    throw new Error(credentials.error.message);
  }
  const connector: MachineConnector = {
    id,
    kind,
    auth: clientSecret !== undefined ? 'oauth' : 'service-account',
  };
  const next = validatedConfig({
    ...config,
    connectors: [...(config.connectors ?? []).filter((entry) => entry.id !== id), connector],
  });
  await writeCredentials(id, credentials.value);
  await saveMachineConfig(next);
  printJson({
    connector,
    ...(connector.auth === 'oauth' ? { nextStep: `Run kanon connector auth ${id}` } : {}),
  });
}

async function cmdConnectorAuth(cli: ParsedCli): Promise<void> {
  const id = cli.rest[0];
  if (id === undefined) {
    throw new Error('connector auth <id>');
  }
  const config = await requireConfig();
  if (!(config.connectors ?? []).some((entry) => entry.id === id)) {
    throw new Error('Unknown connector id');
  }
  const result = await authorizeOAuth(id, {
    log: (line) => process.stderr.write(`${line}\n`),
  });
  if (result.isErr()) {
    throw new Error(result.error.message);
  }
  printJson({ connector: id, status: 'authorized' });
}

async function cmdConnectorList(): Promise<void> {
  const config = await requireConfig();
  const rows = [];
  for (const connector of config.connectors ?? []) {
    const credentials = await loadGoogleCredentials(connector.id);
    const status = credentials.isErr()
      ? 'missing'
      : credentials.value.type === 'oauth' && credentials.value.refreshToken === undefined
        ? 'needs_auth'
        : 'ready';
    rows.push({ ...connector, credentials: status });
  }
  printJson(rows);
}

/** Handle `connector add|auth|list`. Returns false when not ours. */
export async function dispatchConnectorCli(cli: ParsedCli): Promise<boolean> {
  if (cli.command !== 'connector') {
    return false;
  }
  const sub = cli.rest[0];
  const rest = { ...cli, rest: cli.rest.slice(1) };
  if (sub === 'add') {
    await cmdConnectorAdd(rest);
    return true;
  }
  if (sub === 'auth') {
    await cmdConnectorAuth(rest);
    return true;
  }
  if (sub === 'list') {
    await cmdConnectorList();
    return true;
  }
  return false;
}
