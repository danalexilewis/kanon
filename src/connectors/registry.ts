import type { Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import type { MachineConnector } from '../config/schemas.js';
import { createGoogleDriveConnector, type GoogleDriveDeps } from './google-drive/index.js';
import type { Connector } from './types.js';

export type ConnectorDeps = GoogleDriveDeps;

/** Build a connector for a configured kind. New kinds (Dropbox, OneDrive) slot in here. */
export function createConnector(
  config: MachineConnector,
  deps: ConnectorDeps = {},
): Promise<Result<Connector, RailError<'connector_auth_required' | 'invalid_config'>>> {
  switch (config.kind) {
    case 'google-drive':
      return createGoogleDriveConnector(config, deps);
  }
}
