import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createDispatcher } from '@eddy-works/never-rest/local';
import { registerContract } from '@eddy-works/never-rest/mcp';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { knowledgeHandlers } from '../src/app/handlers.js';
import { knowledgeContract } from '../src/contracts/knowledge.js';
import { projectPrincipal } from '../src/core/principal.js';
import { knowledgePolicy } from '../src/mcp/policy.js';
import { updateIndex } from '../src/retrieval/index-job.js';
import { knowledgeClient } from '../src/cli/client.js';
import { copyFixture, writePilotConfig } from './helpers.js';
import { testRoot } from './setup.js';

describe('MCP adapter', () => {
  it('matches the SDK for a granted search and denies an ungranted index', async () => {
    const config = await writePilotConfig({
      alpha: await copyFixture('team-alpha', join(testRoot, 'mcp-alpha')),
      beta: await copyFixture('team-beta', join(testRoot, 'mcp-beta')),
      journal: await copyFixture('journal', join(testRoot, 'mcp-journal')),
    });
    await updateIndex(config, 'team');
    const principal = projectPrincipal('alpha-app');
    const dispatcher = createDispatcher(knowledgeContract, knowledgeHandlers, {
      context: { config, principal },
      policy: knowledgePolicy(config),
    });
    const server = new Server(
      { name: 'kanon-test', version: '0.0.0' },
      { capabilities: { tools: {} } },
    );
    registerContract(server, dispatcher, {
      contract: knowledgeContract,
      resolvePrincipal: () => principal,
      resolveContext: () => ({ config, principal }),
    });
    const client = new Client({ name: 't', version: '0.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      'get',
      'listIndexes',
      'search',
      'status',
    ]);

    const sdk = await knowledgeClient({ config, principal }).search({
      query: { query: 'release', index: 'team', mode: 'lexical', limit: 5 },
    });
    const mcp = await client.callTool({
      name: 'search',
      arguments: { query: 'release', index: 'team', mode: 'lexical', limit: 5 },
    });
    expect(sdk.isOk()).toBe(true);
    expect(mcp.isError).toBeUndefined();
    expect((mcp.structuredContent as { hits: unknown[] }).hits.length).toBe(
      sdk._unsafeUnwrap().hits.length,
    );

    const denied = await client.callTool({
      name: 'search',
      arguments: { query: 'password', index: 'personal', mode: 'lexical', limit: 5 },
    });
    expect(denied.isError).toBe(true);
    expect(denied.structuredContent).toMatchObject({
      code: 'index_not_available',
    });
    expect(JSON.stringify(denied.structuredContent)).not.toMatch(/password/i);
  });
});
