import { err, ok, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import { circleById, type MachineConfig } from '../config/schemas.js';
import type { Connector, ConnectorItem } from '../connectors/types.js';
import { invalidConfig, promotionDenied } from '../errors.js';
import { itemCanShare } from '../jobs/readers.js';
import { appendLedger } from './io.js';

export async function approveDocument(input: {
  readonly config: MachineConfig;
  readonly jobId: string;
  readonly uri: string;
  readonly circleId: string;
  readonly note: string;
  readonly by: string;
  readonly hash: string;
  readonly readers: readonly string[];
  readonly level: 0 | 1 | 2 | 3;
  readonly connector?: Connector;
  readonly item?: ConnectorItem;
}): Promise<Result<{ readonly basis: 'sharing' | 'promotion' }, RailError<'promotion_denied' | 'invalid_config'>>> {
  const circle = circleById(input.config, input.circleId);
  if (circle === undefined) {
    return err(invalidConfig('Unknown circle'));
  }
  if (input.level > circle.ceiling) {
    return err(invalidConfig(`Level ${input.level} is above the ${input.circleId} ceiling`));
  }
  const added = circle.members.filter((member) => !input.readers.includes(member));
  const basis = added.length > 0 ? 'promotion' : 'sharing';
  if (basis === 'promotion') {
    if (input.connector === undefined || input.item === undefined) {
      return err(promotionDenied('Promotion needs canShare'));
    }
    const allowed = await itemCanShare(input.connector, input.item);
    if (!allowed) {
      return err(promotionDenied('Approver cannot share this file'));
    }
  }
  await appendLedger(input.jobId, {
    schema: 'kanon/review/v1',
    kind: 'approval',
    uri: input.uri,
    circle: input.circleId,
    hash: input.hash,
    basis,
    canShare: basis === 'promotion',
    added,
    note: input.note,
    by: input.by,
    at: new Date().toISOString(),
    level: input.level,
  });
  return ok({ basis });
}
