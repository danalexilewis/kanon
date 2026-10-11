import { err, ok, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import type { MachineConnector } from '../../config/schemas.js';
import { invalidConfig } from '../../errors.js';
import type { Connector } from '../types.js';
import { accessTokenProvider } from './auth.js';
import { loadGoogleCredentials } from './credentials.js';
import { createDriveConnector } from './drive.js';

export interface GoogleDriveDeps {
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

export async function createGoogleDriveConnector(
  config: MachineConnector,
  deps: GoogleDriveDeps = {},
): Promise<Result<Connector, RailError<'connector_auth_required' | 'invalid_config'>>> {
  const credentials = await loadGoogleCredentials(config.id);
  if (credentials.isErr()) {
    return err(credentials.error);
  }
  const expected = config.auth === 'oauth' ? 'oauth' : 'service-account';
  if (credentials.value.type !== expected) {
    return err(invalidConfig(`Connector ${config.id} is auth: ${config.auth} but its credentials are ${credentials.value.type}`));
  }
  const provider = accessTokenProvider(credentials.value, config.id);
  if (provider.isErr()) {
    return err(provider.error);
  }
  return ok(
    createDriveConnector({
      connectorId: config.id,
      accessToken: provider.value,
      ...(deps.fetch !== undefined ? { fetch: deps.fetch } : {}),
      ...(deps.sleep !== undefined ? { sleep: deps.sleep } : {}),
    }),
  );
}
