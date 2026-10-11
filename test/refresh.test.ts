import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { MachineConfig } from '../src/config/schemas.js';
import { refreshSources } from '../src/jobs/refresh.js';
import { loadCatalogue } from '../src/retrieval/catalogue.js';
import { updateIndex } from '../src/retrieval/index-job.js';
import { gitHead } from '../src/sources/git.js';
import {
  cloneRemote,
  commitFiles,
  createSourceRemote,
  git,
  remoteHead,
} from './git-helpers.js';

function managedConfig(
  id: string,
  indexId: string,
  path: string,
  remote: string,
): MachineConfig {
  return {
    schema: 'kanon/machine/v1',
    sources: [{ id, kind: 'managed', path, remote, branch: 'main' }],
    indexes: [{ id: indexId, sources: [id] }],
    projects: [],
    grants: [],
  };
}

async function generation(indexId: string): Promise<number | undefined> {
  return (await loadCatalogue(indexId))?.generation;
}

describe('managed refresh', () => {
  it('fast-forwards when the remote head moved and rebuilds the index once', async () => {
    const id = '70000000-0000-4000-8000-000000000001';
    const remote = await createSourceRemote('refresh-moved', id);
    const config = managedConfig(id, 'rm', remote.clone, remote.url);
    await updateIndex(config, 'rm');
    expect(await generation('rm')).toBe(1);

    const other = await cloneRemote(remote, 'refresh-moved-other');
    await commitFiles(other, { 'docs/new.md': '# New page\n' }, 'add page');
    await git(other, ['push', 'origin', 'main']);

    const result = await refreshSources(config, config.sources);
    expect(result.sources[0]).toMatchObject({ status: 'updated', indexes: ['rm'] });
    expect(await gitHead(remote.clone)).toBe(await remoteHead(remote));
    expect(result.indexes.map((rebuild) => rebuild.indexId)).toEqual(['rm']);
    expect(await generation('rm')).toBe(2);
    const catalogue = await loadCatalogue('rm');
    expect(catalogue?.entries.some((entry) => entry.relativePath === 'docs/new.md')).toBe(true);

    const again = await refreshSources(config, config.sources);
    expect(again.sources[0]).toMatchObject({ status: 'unchanged', indexes: [] });
    expect(again.indexes).toEqual([]);
    expect(await generation('rm')).toBe(2);
  });

  it('reindexes after a manual pull even though the remote did not move', async () => {
    const id = '70000000-0000-4000-8000-000000000002';
    const remote = await createSourceRemote('refresh-manual', id);
    const config = managedConfig(id, 'rmp', remote.clone, remote.url);
    await updateIndex(config, 'rmp');

    const other = await cloneRemote(remote, 'refresh-manual-other');
    await commitFiles(other, { 'docs/pulled.md': '# Pulled\n' }, 'pulled');
    await git(other, ['push', 'origin', 'main']);
    await git(remote.clone, ['pull', '--ff-only']);

    const result = await refreshSources(config, config.sources);
    expect(result.sources[0]).toMatchObject({ status: 'unchanged', indexes: ['rmp'] });
    expect(await generation('rmp')).toBe(2);
  });

  it('leaves dirty, diverged and wrong-branch checkouts untouched', async () => {
    const id = '70000000-0000-4000-8000-000000000003';
    const remote = await createSourceRemote('refresh-untouched', id);
    const config = managedConfig(id, 'ru', remote.clone, remote.url);
    await updateIndex(config, 'ru');
    const other = await cloneRemote(remote, 'refresh-untouched-other');
    await commitFiles(other, { 'docs/upstream.md': '# Upstream\n' }, 'upstream');
    await git(other, ['push', 'origin', 'main']);
    const before = await gitHead(remote.clone);

    await writeFile(join(remote.clone, 'docs/readme.md'), 'local edit\n');
    const dirty = await refreshSources(config, config.sources);
    expect(dirty.sources[0]?.status).toBe('dirty');
    expect(await gitHead(remote.clone)).toBe(before);
    expect(await readFile(join(remote.clone, 'docs/readme.md'), 'utf8')).toBe('local edit\n');
    expect(dirty.indexes).toEqual([]);

    await git(remote.clone, ['checkout', '--', 'docs/readme.md']);
    const localCommit = await commitFiles(remote.clone, { 'docs/mine.md': '# Mine\n' }, 'mine');
    const diverged = await refreshSources(config, config.sources);
    expect(diverged.sources[0]?.status).toBe('diverged');
    expect(await gitHead(remote.clone)).toBe(localCommit);

    await git(remote.clone, ['checkout', '-b', 'feature']);
    const wrong = await refreshSources(config, config.sources);
    expect(wrong.sources[0]?.status).toBe('wrong_branch');
    expect(await gitHead(remote.clone)).toBe(localCommit);
  });
});
