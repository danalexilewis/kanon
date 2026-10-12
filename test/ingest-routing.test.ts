import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import type { MachineConfig } from '../src/config/schemas.js';
import type { Connector, ConnectorItem } from '../src/connectors/types.js';
import { stagingDir } from '../src/env.js';
import { audienceTooWide } from '../src/errors.js';
import { runIngest } from '../src/jobs/ingest.js';
import { createSourceRemote, git, type SourceRemote } from './git-helpers.js';

const ME = 'd0000000-0000-4000-8000-000000000001';
const FOUNDERS = 'd0000000-0000-4000-8000-000000000002';

function item(id: string, title: string): ConnectorItem {
  return {
    externalId: id,
    uri: `fake://${id}`,
    title,
    relativeDir: '',
    revision: '1',
    formats: ['markdown'],
  };
}

function routingConnector(shares: Record<string, readonly string[]>): Connector {
  return {
    kind: 'fake',
    scheme: 'fake',
    list: async () => ok(Object.keys(shares).map((id) => item(id, id))),
    read: async (entry) => ok(`# ${entry.title}\n`),
    sharing: async (entry) =>
      ok({
        sharing: 'full',
        grants: (shares[entry.externalId] ?? []).map((email) => ({ type: 'user' as const, emailAddress: email })),
      }),
    account: async () => ok('operator@example.test'),
  };
}

function routingConfig(me: SourceRemote, founders: SourceRemote): MachineConfig {
  return {
    schema: 'kanon/machine/v1',
    sources: [
      { id: ME, kind: 'managed', path: me.clone, remote: me.url, branch: 'main', access: 'write' },
      { id: FOUNDERS, kind: 'managed', path: founders.clone, remote: founders.url, branch: 'main', access: 'write' },
    ],
    indexes: [
      { id: 'idx-me', sources: [ME] },
      { id: 'idx-founders', sources: [FOUNDERS] },
    ],
    projects: [],
    grants: [],
    people: [
      { id: 'operator', google: ['operator@example.test'] },
      { id: 'cofounder', google: ['cofounder@example.test'] },
    ],
    domains: ['example.test'],
    circles: [
      { id: 'founders', source: FOUNDERS, members: ['operator', 'cofounder'], ceiling: 2, admit: 'auto' },
      { id: 'me', source: ME, members: ['operator'], ceiling: 3, admit: 'auto' },
    ],
    connectors: [{ id: 'fake', kind: 'google-drive', auth: 'oauth' }],
    ingest: [{ id: 'notes', connector: 'fake', route: ['founders', 'me'], folder: 'root', target: 'docs/imported' }],
  };
}

describe('routed ingest', () => {
  it('places cofounder-shared notes in founders and the rest in me', async () => {
    const me = await createSourceRemote('route-me', ME);
    const founders = await createSourceRemote('route-founders', FOUNDERS);
    const connector = routingConnector({
      solo: [],
      pair: ['cofounder@example.test'],
    });
    const report = await runIngest(routingConfig(me, founders), 'notes', {}, { connectorFor: async () => ok(connector) });
    expect(report.status).toBe('pushed');
    expect(report.circles.map((circle) => [circle.circleId, circle.status, circle.added])).toEqual([
      ['founders', 'pushed', ['docs/imported/pair.md']],
      ['me', 'pushed', ['docs/imported/solo.md']],
    ]);
    expect(await git(founders.bare, ['ls-tree', '-r', '--name-only', 'main'])).toContain('docs/imported/pair.md');
    expect(await git(me.bare, ['ls-tree', '-r', '--name-only', 'main'])).toContain('docs/imported/solo.md');
    expect(await git(founders.bare, ['ls-tree', '-r', '--name-only', 'main'])).not.toContain('docs/imported/solo.md');
  });

  it('skips additions when the audience is too wide', async () => {
    const me = await createSourceRemote('wide-me', ME);
    const founders = await createSourceRemote('wide-founders', FOUNDERS);
    const connector = routingConnector({ pair: ['cofounder@example.test'] });
    const report = await runIngest(
      routingConfig(me, founders),
      'notes',
      {},
      {
        connectorFor: async () => ok(connector),
        checkAudience: async (circle) =>
          circle.id === 'founders' ? err(audienceTooWide('wide')) : ok({ readers: ['operator'] }),
      },
    );
    expect(report.circles.find((circle) => circle.circleId === 'founders')?.status).toBe('audience_too_wide');
    expect(await git(founders.bare, ['ls-tree', '-r', '--name-only', 'main'])).not.toContain('docs/imported/pair.md');
  });

  it('stages downloads owner-only and reports a narrowing even when deferred', async () => {
    const me = await createSourceRemote('narrow-me', ME);
    const founders = await createSourceRemote('narrow-founders', FOUNDERS);
    const shares: Record<string, readonly string[]> = { pair: ['cofounder@example.test'] };
    let revision = '1';
    const connector: Connector = {
      kind: 'fake',
      scheme: 'fake',
      list: async () =>
        ok([
          {
            ...item('pair', 'pair'),
            revision,
          },
        ]),
      read: async (entry) => ok(`# ${entry.title}\n`),
      sharing: async (entry) =>
        ok({
          sharing: 'full',
          grants: (shares[entry.externalId] ?? []).map((email) => ({
            type: 'user' as const,
            emailAddress: email,
          })),
        }),
      account: async () => ok('operator@example.test'),
    };
    const machine = routingConfig(me, founders);
    const first = await runIngest(machine, 'notes', {}, { connectorFor: async () => ok(connector) });
    expect(first.circles.find((circle) => circle.circleId === 'founders')?.added).toEqual([
      'docs/imported/pair.md',
    ]);
    const staged = join(stagingDir('notes'), 'pair@1');
    expect((await stat(stagingDir('notes'))).mode & 0o777).toBe(0o700);
    expect((await stat(staged)).mode & 0o777).toBe(0o600);
    expect(await readFile(staged, 'utf8')).toBe('# pair\n');

    shares.pair = [];
    revision = '2';
    const lines: string[] = [];
    const second = await runIngest(
      machine,
      'notes',
      { limit: 0, log: (line) => lines.push(line) },
      { connectorFor: async () => ok(connector) },
    );
    expect(second.narrowed).toEqual(['fake://pair']);
    expect(lines.some((line) => line.includes('Git history') && line.includes('founders'))).toBe(true);
    expect(await git(founders.bare, ['ls-tree', '-r', '--name-only', 'main'])).not.toContain(
      'docs/imported/pair.md',
    );
  });
});
