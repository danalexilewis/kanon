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
