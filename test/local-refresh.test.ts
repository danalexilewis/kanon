import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { MachineConfig } from '../src/config/schemas.js';
import { refreshSources } from '../src/jobs/refresh.js';
import { loadCatalogue } from '../src/retrieval/catalogue.js';
import { updateIndex } from '../src/retrieval/index-job.js';
import * as gitModule from '../src/sources/git.js';
import {
  cloneRemote,
  commitFiles,
  createSourceRemote,
  git,
  sourceManifest,
  writeFiles,
} from './git-helpers.js';
import { testRoot } from './setup.js';

vi.mock('../src/sources/git.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/sources/git.js')>();
  return {
    ...actual,
    gitLsRemote: vi.fn(actual.gitLsRemote),
    gitFetchBranch: vi.fn(actual.gitFetchBranch),
    gitProbeWrite: vi.fn(actual.gitProbeWrite),
    gitPush: vi.fn(actual.gitPush),
  };
});

const LOCAL_ID = '80000000-0000-4000-8000-000000000001';

async function localSource(name: string): Promise<string> {
  const dir = join(testRoot, name);
  await mkdir(dir, { recursive: true });
  await writeFiles(dir, {
    'kanon.yml': sourceManifest(LOCAL_ID),
    'docs/day-one.md': '# Day one\n',
  });
  return dir;
}

function localConfig(path: string, indexId: string): MachineConfig {
  return {
    schema: 'kanon/machine/v1',
    sources: [{ id: LOCAL_ID, kind: 'local', path, refresh: 'hourly' }],
    indexes: [{ id: indexId, sources: [LOCAL_ID] }],
    projects: [],
    grants: [],
  };
}

async function generation(indexId: string): Promise<number | undefined> {
  return (await loadCatalogue(indexId))?.generation;
}

function networkCalls(): number {
  return (
    vi.mocked(gitModule.gitLsRemote).mock.calls.length +
    vi.mocked(gitModule.gitFetchBranch).mock.calls.length +
    vi.mocked(gitModule.gitProbeWrite).mock.calls.length +
    vi.mocked(gitModule.gitPush).mock.calls.length
  );
}

describe('local refresh', () => {
  it('reindexes a plain directory on add, edit and delete, and not otherwise', async () => {
    const dir = await localSource('local-plain');
    const config = localConfig(dir, 'lp');
    await updateIndex(config, 'lp');
    const calls = networkCalls();

    const unchanged = await refreshSources(config, config.sources);
    expect(unchanged.sources[0]).toMatchObject({ kind: 'local', status: 'unchanged' });
    expect(await generation('lp')).toBe(1);

    await writeFile(join(dir, 'docs/day-two.md'), '# Day two\n');
    expect((await refreshSources(config, config.sources)).sources[0]?.status).toBe('updated');
    expect(await generation('lp')).toBe(2);

    await writeFile(join(dir, 'docs/day-one.md'), '# Day one, edited\n');
    await refreshSources(config, config.sources);
    expect(await generation('lp')).toBe(3);

    await rm(join(dir, 'docs/day-two.md'));
    await refreshSources(config, config.sources);
    expect(await generation('lp')).toBe(4);

    await refreshSources(config, config.sources);
    expect(await generation('lp')).toBe(4);
    expect(networkCalls()).toBe(calls);
  });

  it('sees uncommitted edits in a local git repo and never fetches', async () => {
    const dir = await localSource('local-git');
    await git(dir, ['init', '-b', 'main']);
    await commitFiles(dir, {}, 'init');
    await git(dir, ['remote', 'add', 'origin', `file://${join(testRoot, 'nowhere.git')}`]);
    const config = localConfig(dir, 'lg');
    await updateIndex(config, 'lg');
    const calls = networkCalls();

    await writeFile(join(dir, 'docs/day-one.md'), '# Uncommitted thought\n');
    const result = await refreshSources(config, config.sources);
    expect(result.sources[0]?.status).toBe('updated');
    expect(await generation('lg')).toBe(2);
    expect(networkCalls()).toBe(calls);
  });

  it('rebuilds a mixed index exactly once when both sources change', async () => {
    const managedId = '80000000-0000-4000-8000-000000000002';
    const remote = await createSourceRemote('local-mixed', managedId);
    const dir = await localSource('local-mixed-journal');
    const config: MachineConfig = {
      schema: 'kanon/machine/v1',
      sources: [
        { id: managedId, kind: 'managed', path: remote.clone, remote: remote.url },
        { id: LOCAL_ID, kind: 'local', path: dir },
      ],
      indexes: [{ id: 'mixed', sources: [managedId, LOCAL_ID] }],
      projects: [],
      grants: [],
    };
    await updateIndex(config, 'mixed');

    await writeFile(join(dir, 'docs/day-one.md'), '# Local edit\n');
    const localOnly = await refreshSources(config, config.sources);
    expect(localOnly.indexes.map((rebuild) => rebuild.indexId)).toEqual(['mixed']);
    expect(await generation('mixed')).toBe(2);

    const other = await cloneRemote(remote, 'local-mixed-other');
    await commitFiles(other, { 'docs/remote.md': '# Remote\n' }, 'remote');
    await git(other, ['push', 'origin', 'main']);
    await writeFile(join(dir, 'docs/day-one.md'), '# Another local edit\n');
    const both = await refreshSources(config, config.sources);
    expect(both.sources.map((report) => report.status)).toEqual(['updated', 'updated']);
    expect(both.indexes).toHaveLength(1);
    expect(await generation('mixed')).toBe(3);
  });
});
