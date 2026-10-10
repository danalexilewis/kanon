import { createDispatcher } from '@eddy-works/never-rest/local';
import { registerContract } from '@eddy-works/never-rest/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { knowledgeHandlers } from '../app/handlers.js';
import { loadMachineConfig } from '../config/machine.js';
import { knowledgeContract } from '../contracts/knowledge.js';
import { projectPrincipal } from '../core/principal.js';
import { knowledgePolicy } from './policy.js';

export async function startMcpServer(projectId: string): Promise<void> {
  const config = await loadMachineConfig();
  if (config.isErr()) {
    throw new Error(config.error.message);
  }
  const principal = projectPrincipal(projectId);
  const policy = knowledgePolicy(config.value);
  const dispatcher = createDispatcher(knowledgeContract, knowledgeHandlers, {
    context: { config: config.value, principal },
    policy,
    origin: 'kanon-mcp',
  });
  const server = new McpServer({ name: 'kanon', version: '2.0.0-dev' });
  registerContract(server, dispatcher, {
    contract: knowledgeContract,
    resolvePrincipal: () => principal,
    resolveContext: () => ({ config: config.value, principal }),
  });
  await server.connect(new StdioServerTransport());
}
