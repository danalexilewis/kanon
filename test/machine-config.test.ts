import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseMachineConfig } from '../src/config/machine.js';
import { parseSourceManifest } from '../src/config/source-manifest.js';
import { grantedIndexIds, assertIndexAccess } from '../src/core/scope.js';
import { OPERATOR, projectPrincipal } from '../src/core/principal.js';
import { copyFixture, writePilotConfig } from './helpers.js';
import { testRoot } from './setup.js';

describe('machine config and grants', () => {
  it('rejects a grant block on a source manifest', () => {
    const parsed = parseSourceManifest({
      schema: 'kanon/source/v1',
      id: '11111111-1111-4111-8111-111111111111',
      name: 'x',
      roots: [{ path: 'docs' }],
      grants: [{ project: 'me', indexes: ['team'] }],
    });
    expect(parsed.isErr()).toBe(true);
  });

  it('defaults a journal to local-only in the pilot helper', async () => {
    const config = await writePilotConfig({
      alpha: await copyFixture('team-alpha', join(testRoot, 'cfg-alpha')),
      beta: await copyFixture('team-beta', join(testRoot, 'cfg-beta')),
      journal: await copyFixture('journal', join(testRoot, 'cfg-journal')),
    });
    const journal = config.sources.find((source) => source.id.startsWith('3333'));
    expect(journal?.kind).toBe('local');
    expect(journal?.remote).toBeUndefined();
  });

  it('rejects circles declared on a source manifest', () => {
    const parsed = parseSourceManifest({
      schema: 'kanon/source/v1',
      id: '11111111-1111-4111-8111-111111111111',
      name: 'x',
      roots: [{ path: 'docs' }],
      circles: [{ id: 'me', source: '11111111-1111-4111-8111-111111111111', members: ['operator'] }],
    });
    expect(parsed.isErr()).toBe(true);
  });

  it('validates people, circle membership, route containment and scorer endpoints', () => {
    const me = '44444444-4444-4444-8444-444444444444';
    const founders = '45555555-5555-4555-8555-555555555555';
    const write = (id: string) => ({
      id,
      kind: 'managed' as const,
      path: '/tmp/x',
      remote: `file:///tmp/${id}.git`,
      access: 'write' as const,
    });
    const ok = parseMachineConfig({
      schema: 'kanon/machine/v1',
      sources: [write(me), write(founders)],
      indexes: [],
      projects: [],
      grants: [],
      people: [
        { id: 'operator', google: ['operator@example.test'] },
        { id: 'cofounder', google: ['cofounder@example.test'] },
      ],
      domains: ['example.test'],
      circles: [
        { id: 'founders', source: founders, members: ['operator', 'cofounder'], ceiling: 2, admit: 'auto' },
        { id: 'me', source: me, members: ['operator'], ceiling: 3, admit: 'auto' },
      ],
      scorers: [{ id: 'cloud', kind: 'openai-compatible', endpoint: 'https://api.example.test/v1', model: 'm' }],
      connectors: [{ id: 'drive', kind: 'google-drive', auth: 'oauth' }],
      ingest: [
        {
          id: 'notes',
          connector: 'drive',
          route: ['founders', 'me'],
          folder: 'folder',
          target: 'docs/notes',
          score: { scorer: 'cloud', for: ['founders'] },
        },
      ],
    });
    expect(ok.isOk()).toBe(true);

    const unknownMember = parseMachineConfig({
      schema: 'kanon/machine/v1',
      sources: [write(me)],
      indexes: [],
      projects: [],
      grants: [],
      people: [{ id: 'operator', google: ['operator@example.test'] }],
      circles: [{ id: 'me', source: me, members: ['ghost'], ceiling: 3 }],
    });
    expect(unknownMember._unsafeUnwrapErr().message).toMatch(/unknown person/);

    const http = parseMachineConfig({
      schema: 'kanon/machine/v1',
      sources: [],
      indexes: [],
      projects: [],
      grants: [],
      scorers: [{ id: 'cloud', kind: 'openai-compatible', endpoint: 'http://example.test/v1', model: 'm' }],
    });
    expect(http._unsafeUnwrapErr().message).toMatch(/https/);

    const loopback = parseMachineConfig({
      schema: 'kanon/machine/v1',
      sources: [],
      indexes: [],
      projects: [],
      grants: [],
      scorers: [{ id: 'local', kind: 'openai-compatible', endpoint: 'http://127.0.0.1:11434/v1', model: 'm' }],
    });
    expect(loopback.isOk()).toBe(true);
  });

  it('unknown and ungranted indexes look the same', async () => {
    const config = parseMachineConfig({
      schema: 'kanon/machine/v1',
      sources: [],
      indexes: [{ id: 'team', sources: ['11111111-1111-4111-8111-111111111111'] }],
      projects: [{ id: 'alpha-app', root: '/tmp' }],
      grants: [{ project: 'alpha-app', indexes: ['team'] }],
    })._unsafeUnwrap();

    const unknown = assertIndexAccess(config, projectPrincipal('alpha-app'), 'nope');
    const other = assertIndexAccess(config, projectPrincipal('alpha-app'), 'personal');
    const operator = grantedIndexIds(config, OPERATOR);
    expect(unknown._unsafeUnwrapErr().code).toBe('index_not_available');
    expect(other._unsafeUnwrapErr().code).toBe('index_not_available');
    expect(operator).toEqual(['team']);
  });
});
