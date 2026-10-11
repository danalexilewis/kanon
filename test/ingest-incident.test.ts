import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import type { MachineConfig } from '../src/config/schemas.js';
import type { Connector, ConnectorItem } from '../src/connectors/types.js';
import { audienceTooWide } from '../src/errors.js';
import { runIngest } from '../src/jobs/ingest.js';
import { createSourceRemote, git, type SourceRemote } from './git-helpers.js';

const ME = 'e0000000-0000-4000-8000-000000000001';
const FOUNDERS = 'e0000000-0000-4000-8000-000000000002';
const TEAM = 'e0000000-0000-4000-8000-000000000003';

function item(id: string): ConnectorItem {
  return {
    externalId: id,
    uri: `fake://${id}`,
    title: id,
    relativeDir: '',
    revision: '1',
    formats: ['markdown'],
  };
}

/** Anonymised replay: team is readable by the whole organisation. */
function incidentConnector(): Connector {
  const shares: Record<string, readonly string[]> = {
    'operator-only': [],
    'staff-no-github': ['staff@example.test'],
    'with-cofounder': ['cofounder@example.test'],
    'cofounder-and-staff': ['cofounder@example.test', 'staff@example.test'],
    'member-not-cofounder': ['member@example.test'],
    'external-guest': ['guest@other.test'],
  };
  return {
    kind: 'fake',
    scheme: 'fake',
    list: async () => ok(Object.keys(shares).map(item)),
    read: async (entry) => ok(`# ${entry.title}\n`),
    sharing: async (entry) =>
      ok({
        sharing: 'full',
        grants: (shares[entry.externalId] ?? []).map((email) => ({ type: 'user' as const, emailAddress: email })),
      }),
    account: async () => ok('operator@example.test'),
  };
}

function incidentConfig(me: SourceRemote, founders: SourceRemote, team: SourceRemote): MachineConfig {
  return {
    schema: 'kanon/machine/v1',
    sources: [
      { id: ME, kind: 'managed', path: me.clone, remote: me.url, branch: 'main', access: 'write' },
      { id: FOUNDERS, kind: 'managed', path: founders.clone, remote: founders.url, branch: 'main', access: 'write' },
      { id: TEAM, kind: 'managed', path: team.clone, remote: team.url, branch: 'main', access: 'write' },
    ],
    indexes: [],
    projects: [],
    grants: [],
    people: [
      { id: 'operator', google: ['operator@example.test'] },
      { id: 'cofounder', google: ['cofounder@example.test'] },
      { id: 'member', google: ['member@example.test'] },
    ],
    domains: ['example.test'],
    circles: [
      { id: 'team', source: TEAM, members: ['operator', 'cofounder', 'member'], ceiling: 0, admit: 'auto' },
      { id: 'founders', source: FOUNDERS, members: ['operator', 'cofounder'], ceiling: 2, admit: 'auto' },
      { id: 'me', source: ME, members: ['operator'], ceiling: 3, admit: 'auto' },
    ],
    connectors: [{ id: 'fake', kind: 'google-drive', auth: 'oauth' }],
    ingest: [{ id: 'meetings', connector: 'fake', route: ['team', 'founders', 'me'], folder: 'root', target: 'docs/imported' }],
  };
}

describe('ingest incident replay', () => {
  it('writes nothing to a too-wide team circle, founders notes to founders, and the rest to me', async () => {
    const me = await createSourceRemote('inc-me', ME);
    const founders = await createSourceRemote('inc-founders', FOUNDERS);
    const team = await createSourceRemote('inc-team', TEAM);
    const report = await runIngest(
      incidentConfig(me, founders, team),
      'meetings',
      {},
      {
        connectorFor: async () => ok(incidentConnector()),
        checkAudience: async (circle) =>
          circle.id === 'team' ? err(audienceTooWide('org-wide')) : ok({ readers: ['operator'] }),
      },
    );

    expect(report.held).toEqual([]);
    expect(report.circles.find((circle) => circle.circleId === 'team')).toMatchObject({
      status: 'audience_too_wide',
      added: [],
    });
    const founderFiles = await git(founders.bare, ['ls-tree', '-r', '--name-only', 'main']);
    const meFiles = await git(me.bare, ['ls-tree', '-r', '--name-only', 'main']);
    const teamFiles = await git(team.bare, ['ls-tree', '-r', '--name-only', 'main']);
    expect(founderFiles).toContain('docs/imported/with-cofounder.md');
    expect(founderFiles).toContain('docs/imported/cofounder-and-staff.md');
    expect(meFiles).toContain('docs/imported/operator-only.md');
    expect(meFiles).toContain('docs/imported/staff-no-github.md');
    expect(meFiles).toContain('docs/imported/member-not-cofounder.md');
    expect(meFiles).toContain('docs/imported/external-guest.md');
    expect(teamFiles).not.toContain('docs/imported/');
    expect(teamFiles).not.toMatch(/docs\/imported\//);
  });
});
