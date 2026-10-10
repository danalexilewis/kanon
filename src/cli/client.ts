import { createLocalClient } from '@eddy-works/never-rest/local';

import { knowledgeHandlers } from '../app/handlers.js';
import type { AppContext } from '../app/context.js';
import { knowledgeContract } from '../contracts/knowledge.js';

export function knowledgeClient(context: AppContext) {
  return createLocalClient(knowledgeContract, knowledgeHandlers, { context });
}
