import { err, ok, type Result } from 'neverthrow';

import type { MachineConfig } from '../config/schemas.js';
import { indexNotAvailable } from '../errors.js';
import type { RailError } from '@eddy-works/never-rest';
import type { Principal } from './principal.js';

export function grantedIndexIds(
  config: MachineConfig,
  principal: Principal,
): readonly string[] {
  if (principal.kind === 'operator') {
    return config.indexes.map((index) => index.id);
  }
  const grant = config.grants.find((entry) => entry.project === principal.id);
  if (grant === undefined) {
    return [];
  }
  return grant.indexes.filter((id) =>
    config.indexes.some((index) => index.id === id),
  );
}

export function assertIndexAccess(
  config: MachineConfig,
  principal: Principal,
  indexId: string,
): Result<void, RailError<'index_not_available'>> {
  if (grantedIndexIds(config, principal).includes(indexId)) {
    return ok(undefined);
  }
  return err(indexNotAvailable());
}

export function findIndex(config: MachineConfig, indexId: string) {
  return config.indexes.find((index) => index.id === indexId);
}
