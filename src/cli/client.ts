import { createLocalClient } from '@eddy-works/never-rest/local';
import type { ClientArgsOf } from '@eddy-works/never-rest/contract';

import { knowledgeHandlers } from '../app/handlers.js';
import type { AppContext } from '../app/context.js';
import { knowledgeContract } from '../contracts/knowledge.js';
import { knowledgePolicy } from '../mcp/policy.js';

export function knowledgeClient(context: AppContext) {
  const client = createLocalClient(knowledgeContract, knowledgeHandlers, {
    context,
    policy: knowledgePolicy(context.config),
    origin: 'kanon-cli',
  });
  const call = { context, principal: context.principal };

  function search(args: ClientArgsOf<(typeof knowledgeContract)['search']>) {
    return client.search(args, call);
  }

  function get(args: ClientArgsOf<(typeof knowledgeContract)['get']>) {
    return client.get(args, call);
  }

  function status(args: ClientArgsOf<(typeof knowledgeContract)['status']>) {
    return client.status(args, call);
  }

  function listIndexes(
    args: ClientArgsOf<(typeof knowledgeContract)['listIndexes']>,
  ) {
    return client.listIndexes(args, call);
  }

  return { search, get, status, listIndexes };
}
