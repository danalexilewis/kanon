import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { knowledgeClient } from '../src/cli/client.js';
import { OPERATOR, projectPrincipal } from '../src/core/principal.js';
import { documentUri } from '../src/core/uris.js';
import { updateIndex } from '../src/retrieval/index-job.js';
import {
  copyFixture,
  RELEASE_DOC_ID,
  TEAM_ALPHA_ID,
  writePilotConfig,
} from './helpers.js';
import { testRoot } from './setup.js';

async function pilot() {
  const config = await writePilotConfig({
    alpha: await copyFixture('team-alpha', join(testRoot, 'sr-alpha')),
    beta: await copyFixture('team-beta', join(testRoot, 'sr-beta')),
    journal: await copyFixture('journal', join(testRoot, 'sr-journal')),
  });
  await updateIndex(config, 'team');
  await updateIndex(config, 'personal');
  return config;
}

describe('search and get', () => {
  it('returns citations for a lexical search', async () => {
    const config = await pilot();
    const client = knowledgeClient({ config, principal: OPERATOR });
    const result = await client.search({
      query: { query: 'release process', index: 'team', mode: 'lexical', limit: 10 },
    });
    expect(result.isOk()).toBe(true);
    const hits = result._unsafeUnwrap().hits;
    expect(hits.some((hit) => hit.docId === RELEASE_DOC_ID)).toBe(true);
    expect(hits[0]?.revision.contentHash.length).toBe(64);
  });

  it('does not leak personal hits to an ungranted project', async () => {
    const config = await pilot();
    const client = knowledgeClient({
      config,
      principal: projectPrincipal('alpha-app'),
    });
    const denied = await client.search({
      query: { query: 'garden password', index: 'personal', mode: 'lexical', limit: 10 },
    });
    expect(denied._unsafeUnwrapErr().code).toBe('index_not_available');
    expect(JSON.stringify(denied._unsafeUnwrapErr())).not.toMatch(/garden/i);
  });

  it('rejects raw qmd URIs and path traversal', async () => {
    const config = await pilot();
    const client = knowledgeClient({ config, principal: OPERATOR });
    const qmd = await client.get({
      query: { uri: 'qmd://team/docs/release-process.md', index: 'team' },
    });
    const traversal = await client.get({
      query: { uri: 'kanon://11111111-1111-4111-8111-111111111111/../etc/passwd', index: 'team' },
    });
    expect(qmd._unsafeUnwrapErr().code).toBe('not_found');
    expect(traversal._unsafeUnwrapErr().code).toBe('not_found');
  });

  it('rejects misspelled fields at the contract', async () => {
    const config = await pilot();
    const client = knowledgeClient({ config, principal: OPERATOR });
    const result = await client.search({
      query: {
        query: 'release',
        index: 'team',
        mode: 'lexical',
        limit: 5,
        colection: 'team',
      } as never,
    });
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('validation_error');
  });

  it('detects a live hash mismatch after an external edit', async () => {
    const config = await pilot();
    const client = knowledgeClient({ config, principal: OPERATOR });
    const uri = documentUri(TEAM_ALPHA_ID, RELEASE_DOC_ID);
    const okGet = await client.get({ query: { uri, index: 'team' } });
    expect(okGet.isOk()).toBe(true);
    const path = okGet._unsafeUnwrap().path;
    const absolute = join(
      config.sources.find((source) => source.id === TEAM_ALPHA_ID)!.path,
      path,
    );
    await writeFile(absolute, `${await (await import('node:fs/promises')).readFile(absolute, 'utf8')}\nchanged\n`);
    const stale = await client.get({ query: { uri, index: 'team' } });
    expect(stale._unsafeUnwrapErr().code).toBe('citation_mismatch');
  });
});
