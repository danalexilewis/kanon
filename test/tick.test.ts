import { join } from 'node:path';

import { ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { initDevice, renameDevice } from '../src/config/device.js';
import type { MachineConfig } from '../src/config/schemas.js';
import { writeCredentials } from '../src/connectors/credentials.js';
import type { Connector } from '../src/connectors/types.js';
import { acquireTickLock, loadJobState } from '../src/jobs/state.js';
import { jobsStatus } from '../src/jobs/status.js';
import { runTick, type TickDeps } from '../src/jobs/tick.js';
import { createSourceRemote } from './git-helpers.js';
import { OPERATOR_PERSON, soloCircle } from './helpers.js';
import { testRoot } from './setup.js';

const T0 = new Date('2026-10-11T02:00:00.000Z');
const HOUR = 3_600_000;

function at(offsetMs: number): () => Date {
  return () => new Date(T0.getTime() + offsetMs);
}

const fake: Connector = {
  kind: 'fake',
  scheme: 'fake',
  list: async (scope) =>
    ok([
      {
        externalId: scope.folder,
        uri: `fake://${scope.folder}`,
        title: scope.folder,
        relativeDir: '',
        revision: '1',
        formats: ['markdown'],
      },
    ]),
  read: async () => ok('# A\n'),
};

function tickDeps(offsetMs: number): TickDeps {
  return { now: at(offsetMs), ingest: { connectorFor: async () => ok(fake) } };
}

function tickConfig(sourceId: string, path: string, remote: string): MachineConfig {
  return {
    schema: 'kanon/machine/v1',
    sources: [
      { id: sourceId, kind: 'managed', path, remote, branch: 'main', access: 'write', refresh: 'daily' },
      {
        id: '90000000-0000-4000-8000-0000000000ff',
        kind: 'local',
        path: join(testRoot, 'tick-local'),
        refresh: 'off',
      },
    ],
    indexes: [{ id: 'tick-idx', sources: [sourceId] }],
    projects: [],
    grants: [],
    people: [OPERATOR_PERSON],
    circles: [soloCircle(sourceId)],
    connectors: [
      { id: 'fake', kind: 'google-drive', auth: 'oauth' },
      { id: 'nocreds', kind: 'google-drive', auth: 'oauth' },
    ],
    ingest: [
      { id: 'here', connector: 'fake', route: ['me'], folder: 'f-here', target: 'docs/here', device: 'laptop' },
      { id: 'elsewhere', connector: 'fake', route: ['me'], folder: 'f-desk', target: 'docs/elsewhere', device: 'desk' },
      { id: 'unassigned', connector: 'nocreds', route: ['me'], folder: 'f-any', target: 'docs/unassigned' },
    ],
  };
}

describe('kanon tick', () => {
  it('runs due jobs for this device, skips the rest, and rebuilds each index once', async () => {
    await initDevice();
    await renameDevice('laptop');
    const id = '90000000-0000-4000-8000-000000000001';
    const remote = await createSourceRemote('tick-due', id);
    const config = tickConfig(id, remote.clone, remote.url);

    const first = (await runTick(config, {}, tickDeps(0)))._unsafeUnwrap();
    expect(first.device).toBe('laptop');
    expect(first.refresh.map((report) => report.sourceId)).toEqual([id]);
    expect(first.ingest.map((report) => [report.jobId, report.status])).toEqual([['here', 'pushed']]);
    expect(first.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'refresh', reason: 'off' }),
        expect.objectContaining({ id: 'elsewhere', reason: 'assigned_elsewhere' }),
        expect.objectContaining({ id: 'unassigned', reason: 'no_credentials' }),
      ]),
    );
    expect(first.indexes.map((rebuild) => [rebuild.indexId, rebuild.ok])).toEqual([['tick-idx', true]]);
    expect(first.ok).toBe(true);
    expect(first.reportPath).toBeDefined();

    const state = await loadJobState();
    expect(state.refresh[id]?.lastAttemptAt).toBe(T0.toISOString());
    expect(state.ingest.here?.lastStatus).toBe('pushed');
    expect(state.ingest.elsewhere).toBeUndefined();

    const soon = (await runTick(config, {}, tickDeps(HOUR / 2)))._unsafeUnwrap();
    expect(soon.refresh).toEqual([]);
    expect(soon.ingest).toEqual([]);
    expect(soon.skipped.filter((skip) => skip.reason === 'not_due').map((skip) => skip.id)).toEqual([
      id,
      'here',
    ]);

    const nextDay = (await runTick(config, {}, tickDeps(25 * HOUR)))._unsafeUnwrap();
    expect(nextDay.refresh[0]).toMatchObject({ status: 'unchanged', indexes: [] });
    expect(nextDay.ingest.map((report) => report.status)).toEqual(['unchanged']);
    expect(nextDay.indexes).toEqual([]);

    const forced = (await runTick(config, { force: true }, tickDeps(25 * HOUR + 60_000)))._unsafeUnwrap();
    expect(forced.refresh).toHaveLength(1);
    expect(forced.ingest).toHaveLength(1);

    const status = await jobsStatus(config, at(25 * HOUR + 60_000)());
    expect(status.device).toBe('laptop');
    expect(status.jobs.find((job) => job.id === 'here')).toMatchObject({
      runsHere: true,
      lastStatus: 'unchanged',
      cadence: 'daily',
    });
    expect(status.jobs.find((job) => job.id === 'elsewhere')).toMatchObject({
      runsHere: false,
      device: 'desk',
    });
    expect(status.jobs.find((job) => job.id === 'elsewhere')?.nextDueAt).toBeUndefined();
    expect(status.jobs.find((job) => job.id === 'unassigned')?.runsHere).toBe(false);
  });

  it('runs an unassigned job once this device holds its credentials', async () => {
    await initDevice();
    await renameDevice('laptop');
    const id = '90000000-0000-4000-8000-000000000002';
    const remote = await createSourceRemote('tick-creds', id);
    const config = tickConfig(id, remote.clone, remote.url);
    await writeCredentials('nocreds', { type: 'oauth', clientId: 'c', clientSecret: 's' });

    const report = (await runTick(config, { force: true }, tickDeps(0)))._unsafeUnwrap();
    expect(report.ingest.map((entry) => [entry.jobId, entry.status])).toEqual([
      ['here', 'pushed'],
      ['unassigned', 'pushed'],
    ]);
    expect(report.skipped.some((skip) => skip.reason === 'no_credentials')).toBe(false);
  });

  it('refuses to overlap a running tick', async () => {
    const id = '90000000-0000-4000-8000-000000000003';
    const remote = await createSourceRemote('tick-locked', id);
    const held = (await acquireTickLock(T0))._unsafeUnwrap();
    try {
      const result = await runTick(tickConfig(id, remote.clone, remote.url), {}, tickDeps(0));
      expect(result._unsafeUnwrapErr().code).toBe('job_locked');
    } finally {
      await held();
    }
  });
});
