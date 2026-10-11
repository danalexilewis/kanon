import { ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { dispatchCli } from '../src/cli/commands.js';
import { parseArgv } from '../src/cli/parse.js';
import { saveMachineConfig } from '../src/config/machine.js';
import type { MachineConfig } from '../src/config/schemas.js';
import type { Connector } from '../src/connectors/types.js';
import { runIngest } from '../src/jobs/ingest.js';
import { approveDocument } from '../src/review/actions.js';
import { appendLedger, loadLedger } from '../src/review/io.js';
import { contentHash } from '../src/scoring/signals.js';
import { createSourceRemote, git, type SourceRemote } from './git-helpers.js';

const ME = 'f0000000-0000-4000-8000-000000000001';
const TEAM = 'f0000000-0000-4000-8000-000000000002';

function connector(canShare = true): Connector {
  return {
    kind: 'fake',
    scheme: 'fake',
    list: async () =>
      ok([
        {
          externalId: 'note',
          uri: 'fake://note',
          title: 'Note',
          relativeDir: '',
          revision: '1',
          formats: ['markdown'],
        },
      ]),
    read: async () => ok('# Note\n'),
    sharing: async () =>
      ok({
        sharing: 'full',
        grants: [
          { type: 'user', emailAddress: 'cofounder@example.test' },
          { type: 'user', emailAddress: 'lead@example.test' },
          { type: 'user', emailAddress: 'member@example.test' },
        ],
      }),
    canShare: async () => ok(canShare),
    account: async () => ok('operator@example.test'),
  };
}

function config(me: SourceRemote, team: SourceRemote): MachineConfig {
  return {
    schema: 'kanon/machine/v1',
    sources: [
      { id: ME, kind: 'managed', path: me.clone, remote: me.url, branch: 'main', access: 'write' },
      { id: TEAM, kind: 'managed', path: team.clone, remote: team.url, branch: 'main', access: 'write' },
    ],
    indexes: [],
    projects: [],
    grants: [],
    people: [
      { id: 'operator', google: ['operator@example.test'] },
      { id: 'cofounder', google: ['cofounder@example.test'] },
      { id: 'lead', google: ['lead@example.test'] },
      { id: 'member', google: ['member@example.test'] },
    ],
    circles: [
      { id: 'team', source: TEAM, members: ['operator', 'cofounder', 'lead', 'member'], ceiling: 0, admit: 'review' },
      { id: 'me', source: ME, members: ['operator'], ceiling: 3, admit: 'auto' },
    ],
    connectors: [{ id: 'fake', kind: 'google-drive', auth: 'oauth' }],
    ingest: [{ id: 'notes', connector: 'fake', route: ['team', 'me'], folder: 'root', target: 'docs/imported' }],
  };
}

describe('review ledger and CLI', () => {
  it('places a document in team after an approval, and refuses a promotion without canShare', async () => {
    const me = await createSourceRemote('rev-me', ME);
    const team = await createSourceRemote('rev-team', TEAM);
    const machine = config(me, team);
    await saveMachineConfig(machine);
    const denied = await approveDocument({
      config: machine,
      jobId: 'notes',
      uri: 'fake://note',
      circleId: 'team',
      note: 'share',
      by: 'operator@example.test',
      hash: contentHash('# Note\n'),
      readers: ['operator'],
      level: 0,
      connector: connector(false),
      item: {
        externalId: 'note',
        uri: 'fake://note',
        title: 'Note',
        relativeDir: '',
        revision: '1',
        formats: ['markdown'],
      },
    });
    expect(denied._unsafeUnwrapErr().code).toBe('promotion_denied');

    const allowed = await approveDocument({
      config: machine,
      jobId: 'notes',
      uri: 'fake://note',
      circleId: 'team',
      note: 'share with the team',
      by: 'operator@example.test',
      hash: contentHash('# Note\n'),
      readers: ['operator', 'cofounder', 'lead', 'member'],
      level: 0,
    });
    expect(allowed.isOk()).toBe(true);
    const ledger = await loadLedger('notes');
    expect(ledger.state['fake://note']?.approvals.team?.note).toBe('share with the team');

    const report = await runIngest(machine, 'notes', {}, { connectorFor: async () => ok(connector(true)) });
    expect(report.circles.find((circle) => circle.circleId === 'team')?.added).toEqual(['docs/imported/note.md']);
    expect(await git(team.bare, ['ls-tree', '-r', '--name-only', 'main'])).toContain('docs/imported/note.md');
  });

  it('cancels an approval when the body changes, and honours revoke and exclude', async () => {
    const me = await createSourceRemote('rev2-me', ME);
    const team = await createSourceRemote('rev2-team', TEAM);
    const machine = config(me, team);
    await appendLedger('notes', {
      schema: 'kanon/review/v1',
      kind: 'approval',
      uri: 'fake://note',
      circle: 'team',
      hash: contentHash('# Note\n'),
      basis: 'sharing',
      canShare: false,
      added: [],
      note: 'ok',
      by: 'operator@example.test',
      at: '2026-10-12T00:00:00.000Z',
    });
    const body = '# Changed\n';
    const fake: Connector = {
      ...connector(true),
      read: async () => ok(body),
    };
    const moved = await runIngest(machine, 'notes', {}, { connectorFor: async () => ok(fake) });
    expect(moved.circles.find((circle) => circle.circleId === 'me')?.added).toEqual(['docs/imported/note.md']);

    await appendLedger('notes', {
      schema: 'kanon/review/v1',
      kind: 'exclude',
      uri: 'fake://note',
      note: 'hold',
      by: 'operator@example.test',
      at: '2026-10-12T00:01:00.000Z',
    });
    const held = await runIngest(machine, 'notes', {}, { connectorFor: async () => ok(fake) });
    expect(held.held).toContain('fake://note');

    await appendLedger('notes', {
      schema: 'kanon/review/v1',
      kind: 'revoke',
      uri: 'fake://note',
      circle: 'team',
      note: 'undo',
      by: 'operator@example.test',
      at: '2026-10-12T00:02:00.000Z',
    });
    const { state } = await loadLedger('notes');
    expect(state['fake://note']?.approvals.team).toBeUndefined();
  });

  it('does not list review commands as MCP tools', async () => {
    const chunks: string[] = [];
    const spy = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await dispatchCli(parseArgv(['--help']));
    } finally {
      process.stdout.write = spy;
    }
    expect(chunks.join('')).toContain('review list');
  });
});
