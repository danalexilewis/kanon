import { err, ok } from 'neverthrow';
import { definePolicy } from '@eddy-works/never-rest/policy';

import type { MachineConfig } from '../config/schemas.js';
import { knowledgeContract } from '../contracts/knowledge.js';
import type { Principal } from '../core/principal.js';
import { assertIndexAccess } from '../core/scope.js';
import { indexNotAvailable } from '../errors.js';

export function knowledgePolicy(config: MachineConfig) {
  return definePolicy<typeof knowledgeContract, Principal>(knowledgeContract, {
    operations: {
      search: ({ principal, args }) => {
        if (principal === undefined) {
          return err(indexNotAvailable());
        }
        return assertIndexAccess(config, principal as Principal, args.query.index);
      },
      get: ({ principal, args }) => {
        if (principal === undefined) {
          return err(indexNotAvailable());
        }
        return assertIndexAccess(config, principal as Principal, args.query.index);
      },
      status: ({ principal }) => {
        if (principal === undefined) {
          return err(indexNotAvailable());
        }
        return ok(undefined);
      },
      listIndexes: ({ principal }) => {
        if (principal === undefined) {
          return err(indexNotAvailable());
        }
        return ok(undefined);
      },
    },
  });
}
