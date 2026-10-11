import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { err, ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import type { MachineConfig, MachineIngest } from '../src/config/schemas.js';
import { ingestDocId } from '../src/connectors/markdown.js';
import type { Connector, ConnectorFormat, ConnectorItem } from '../src/connectors/types.js';
import { writeDenied } from '../src/errors.js';
import { runIngest, type IngestDeps } from '../src/jobs/ingest.js';
import { gitHead } from '../src/sources/git.js';
import {
  cloneRemote,
  commitFiles,
  createSourceRemote,
  git,
  remoteHead,
  type SourceRemote,
} from './git-helpers.js';

interface FakeDoc {
  id: string;
  title: string;
  revision: string;
  body: string;
  dir?: string;
  formats?: ConnectorFormat[];
}

interface FakeConnector {
  readonly connector: Connector;
  readonly reads: string[];
  readonly lists: { count: number };
}

function fakeConnector(docs: (folder: string) => readonly FakeDoc[]): FakeConnector {
  const reads: string[] = [];
  const lists = { count: 0 };
  function toItem(doc: FakeDoc): ConnectorItem {
    return {
      externalId: doc.id,
      uri: `fake://${doc.id}`,
      title: doc.title,
      relativeDir: doc.dir ?? '',
      revision: doc.revision,
      formats: doc.formats ?? ['markdown'],
    };
  }
  const bodies = new Map<string, string>();
  const connector: Connector = {
    kind: 'fake',
    scheme: 'fake',
    list: async (scope) => {
      lists.count += 1;
      const listed = docs(scope.folder);
      listed.forEach((doc) => bodies.set(doc.id, doc.body));
      return ok(listed.map(toItem));
    },
    read: async (item) => {
      reads.push(item.externalId);
      return ok(bodies.get(item.externalId) ?? '');
    },
  };
  return { connector, reads, lists };
}

function deps(fake: FakeConnector, extra: Partial<IngestDeps> = {}): IngestDeps {
  return { connectorFor: async () => ok(fake.connector), ...extra };
}

function ingestConfig(
  sourceId: string,
  path: string,
  remote: SourceRemote,
  jobs: readonly Partial<MachineIngest>[] = [{}],
): MachineConfig {
  return {
    schema: 'kanon/machine/v1',
    sources: [
      { id: sourceId, kind: 'managed', path, remote: remote.url, branch: 'main', access: 'write' },
    ],
    indexes: [{ id: `idx-${sourceId.slice(-4)}`, sources: [sourceId] }],
    projects: [],
    grants: [],
    connectors: [{ id: 'fake', kind: 'google-drive', auth: 'oauth' }],
    ingest: jobs.map((job, index) => ({
      id: `job-${index}`,
      connector: 'fake',
      source: sourceId,
      folder: 'root',
      target: 'docs/imported',
      ...job,
    })),
  };
}

async function remoteFiles(remote: SourceRemote): Promise<string[]> {
  return (await git(remote.bare, ['ls-tree', '-r', '--name-only', 'main'])).split('\n');
}

async function remoteFile(remote: SourceRemote, path: string): Promise<string> {
  return git(remote.bare, ['show', `main:${path}`]);
}

async function commitCount(remote: SourceRemote): Promise<number> {
  return Number(await git(remote.bare, ['rev-list', '--count', 'main']));
}

const PNG = Buffer.from('fake-png-bytes').toString('base64');

describe('ingest pipeline', () => {
  it('pushes a first import, then reports unchanged without re-reading', async () => {
    const id = '80000000-0000-4000-8000-000000000001';
    const remote = await createSourceRemote('ingest-first', id);
    const docs: FakeDoc[] = [
      { id: 'a1', title: 'Alpha', revision: '1', body: '# Alpha\n\nFirst.\n' },
      { id: 'b2', title: 'Beta', revision: '1', body: '# Beta\n', dir: 'Team Notes' },
    ];
    const fake = fakeConnector(() => docs);
    const config = ingestConfig(id, remote.clone, remote, [
      { author: { name: 'Ingest Bot', email: 'bot@example.test' } },
    ]);

    const first = await runIngest(config, 'job-0', {}, deps(fake));
    expect(first).toMatchObject({
      status: 'pushed',
      attempts: 1,
      added: ['docs/imported/alpha.md', 'docs/imported/team-notes/beta.md'],
      indexes: [`idx-${id.slice(-4)}`],
    });
    expect(first.commit).toBe(await remoteHead(remote));
    expect(await gitHead(remote.clone)).toBe(await remoteHead(remote));
    const alpha = await remoteFile(remote, 'docs/imported/alpha.md');
    expect(alpha).toContain(`id: ${ingestDocId(id, 'fake://a1')}`);
    expect(alpha).toContain('uri: fake://a1');
    expect(alpha).toContain('relation: exported-from');
    const log = await git(remote.bare, ['log', '-1', '--format=%an <%ae>%n%B', 'main']);
    expect(log).toContain('Ingest Bot <bot@example.test>');
    expect(log).toContain('Kanon-Ingest: job-0');

    const second = await runIngest(config, 'job-0', {}, deps(fake));
    expect(second.status).toBe('unchanged');
    expect(fake.reads).toEqual(['a1', 'b2']);
    expect(await commitCount(remote)).toBe(2);
  });

  it('updates, renames, removes and adds while preserving files it does not own', async () => {
    const id = '80000000-0000-4000-8000-000000000002';
    const remote = await createSourceRemote('ingest-changes', id, {
      'docs/imported/manual.md': '# Written by hand\n',
      'docs/imported/alpha.md': '# Hand-written alpha\n',
    });
    let docs: FakeDoc[] = [
      { id: 'alpha-1234567890', title: 'Alpha', revision: '1', body: '# Alpha\n' },
      { id: 'beta', title: 'Beta', revision: '1', body: '# Beta\n' },
    ];
    const fake = fakeConnector(() => docs);
    const config = ingestConfig(id, remote.clone, remote);

    const first = await runIngest(config, 'job-0', {}, deps(fake));
    expect(first.added).toEqual(['docs/imported/alpha-alpha-12.md', 'docs/imported/beta.md']);

    docs = [
      { id: 'alpha-1234567890', title: 'Alpha Two', revision: '2', body: '# Alpha v2\n' },
      { id: 'gamma', title: 'Gamma', revision: '1', body: '# Gamma\n' },
    ];
    const second = await runIngest(config, 'job-0', {}, deps(fake));
    expect(second).toMatchObject({
      status: 'pushed',
      added: ['docs/imported/gamma.md'],
      updated: ['docs/imported/alpha-two.md'],
      removed: ['docs/imported/beta.md'],
    });
    const files = await remoteFiles(remote);
    expect(files).toEqual(
      expect.arrayContaining(['docs/imported/manual.md', 'docs/imported/alpha.md', 'docs/imported/alpha-two.md']),
    );
    expect(files).not.toContain('docs/imported/beta.md');
    expect(files).not.toContain('docs/imported/alpha-alpha-12.md');
    expect(await remoteFile(remote, 'docs/imported/alpha.md')).toBe('# Hand-written alpha');
    expect(await remoteFile(remote, 'docs/imported/alpha-two.md')).toContain('# Alpha v2');
  });

  it('reports unsupported formats and extracts or strips images', async () => {
    const id = '80000000-0000-4000-8000-000000000003';
    const remote = await createSourceRemote('ingest-images', id);
    const body = `# Pics\n\n![chart](data:image/png;base64,${PNG})\n`;
    const fake = fakeConnector((folder) =>
      folder === 'strip-root'
        ? [{ id: 'pic-strip', title: 'Pictures', revision: '1', dir: 'deep', body }]
        : [
            { id: 'pic', title: 'Pictures', revision: '1', dir: 'deep', body },
            { id: 'sheet', title: 'Budget', revision: '1', body: '', formats: [] },
          ],
    );
    const config = ingestConfig(id, remote.clone, remote, [
      { target: 'docs/extract', images: 'extract' },
      { target: 'docs/strip', images: 'strip', folder: 'strip-root' },
      { target: 'docs/overlap' },
    ]);

    const extracted = await runIngest(config, 'job-0', {}, deps(fake));
    expect(extracted.status).toBe('pushed');
    expect(extracted.skipped).toEqual([
      { uri: 'fake://sheet', title: 'Budget', reason: 'unsupported_format' },
    ]);
    const rendered = await remoteFile(remote, 'docs/extract/deep/pictures.md');
    const asset = /\.\.\/_assets\/([a-f0-9]{32}\.png)/.exec(rendered)?.[1];
    expect(asset).toBeDefined();
    expect(await remoteFiles(remote)).toContain(`docs/extract/_assets/${asset}`);

    const stripped = await runIngest(config, 'job-1', {}, deps(fake));
    expect(stripped.status).toBe('pushed');
    const plain = await remoteFile(remote, 'docs/strip/deep/pictures.md');
    expect(plain).not.toContain('data:image');
    expect(plain).not.toContain('_assets');
    expect((await remoteFiles(remote)).some((file) => file.startsWith('docs/strip/_assets'))).toBe(false);

    const before = await remoteHead(remote);
    const overlapping = await runIngest(config, 'job-2', {}, deps(fake));
    expect(overlapping.status).toBe('failed');
    expect(overlapping.detail).toContain('Duplicate document id');
    expect(await remoteHead(remote)).toBe(before);
  });

  it('keeps hostile titles and folders inside the target', async () => {
    const id = '80000000-0000-4000-8000-000000000004';
    const remote = await createSourceRemote('ingest-hostile', id);
    const fake = fakeConnector(() => [
      { id: 'x', title: '../../etc/passwd', revision: '1', dir: '../../../outside/./..', body: '# X\n' },
      { id: '../y', title: '..', revision: '1', dir: '/abs/../path', body: '# Y\n' },
    ]);
    const config = ingestConfig(id, remote.clone, remote);

    const report = await runIngest(config, 'job-0', {}, deps(fake));
    expect(report.status).toBe('pushed');
    const changed = (await git(remote.bare, ['diff', '--name-only', 'main~1', 'main'])).split('\n');
    expect(changed.length).toBe(2);
    expect(changed.every((path) => path.startsWith('docs/imported/'))).toBe(true);
  });

  it('fails without pushing when the target contains a symlink or sits outside the roots', async () => {
    const id = '80000000-0000-4000-8000-000000000005';
    const remote = await createSourceRemote('ingest-symlink', id);
    const seeder = await cloneRemote(remote, 'ingest-symlink-seeder');
    await mkdir(join(seeder, 'docs/imported'), { recursive: true });
    await symlink('../..', join(seeder, 'docs/imported/escape'));
    await git(seeder, ['add', '-A']);
    await git(seeder, ['commit', '-m', 'symlink']);
    await git(seeder, ['push', 'origin', 'main']);
    const before = await remoteHead(remote);
    const fake = fakeConnector(() => [{ id: 'a', title: 'A', revision: '1', body: '# A\n' }]);

    const linked = await runIngest(ingestConfig(id, remote.clone, remote), 'job-0', {}, deps(fake));
    expect(linked.status).toBe('failed');
    expect(linked.detail).toContain('symlink');

    const outside = await runIngest(
      ingestConfig(id, remote.clone, remote, [{ target: 'notes/imported' }]),
      'job-0',
      {},
      deps(fake),
    );
    expect(outside.status).toBe('failed');
    expect(await remoteHead(remote)).toBe(before);
  });

  it('stops at write_denied before listing or committing', async () => {
    const id = '80000000-0000-4000-8000-000000000006';
    const remote = await createSourceRemote('ingest-denied', id);
    const before = await remoteHead(remote);
    const fake = fakeConnector(() => [{ id: 'a', title: 'A', revision: '1', body: '# A\n' }]);

    const report = await runIngest(
      ingestConfig(id, remote.clone, remote),
      'job-0',
      {},
      deps(fake, { probeWrite: async () => err(writeDenied('no push access')) }),
    );
    expect(report).toMatchObject({ status: 'write_denied', attempts: 0 });
    expect(fake.lists.count).toBe(0);
    expect(await remoteHead(remote)).toBe(before);
  });

  it('rebuilds once from the new tip when the remote moves mid-run', async () => {
    const id = '80000000-0000-4000-8000-000000000007';
    const remote = await createSourceRemote('ingest-race', id);
    const other = await cloneRemote(remote, 'ingest-race-other');
    const fake = fakeConnector(() => [
      { id: 'a', title: 'A', revision: '1', body: '# A\n' },
      { id: 'b', title: 'B', revision: '1', body: '# B\n' },
    ]);

    const report = await runIngest(
      ingestConfig(id, remote.clone, remote),
      'job-0',
      {},
      deps(fake, {
        beforePush: async (attempt) => {
          if (attempt === 1) {
            await commitFiles(other, { 'docs/racing.md': '# Racing\n' }, 'racing');
            await git(other, ['push', 'origin', 'main']);
          }
        },
      }),
    );
    expect(report).toMatchObject({ status: 'pushed', attempts: 2 });
    expect(fake.reads).toEqual(['a', 'b']);
    expect(await remoteFiles(remote)).toEqual(
      expect.arrayContaining(['docs/racing.md', 'docs/imported/a.md', 'docs/imported/b.md']),
    );
    expect(await commitCount(remote)).toBe(3);
  });

  it('pushes nothing on a dry run', async () => {
    const id = '80000000-0000-4000-8000-000000000008';
    const remote = await createSourceRemote('ingest-dry', id);
    const before = await remoteHead(remote);
    const fake = fakeConnector(() => [{ id: 'a', title: 'A', revision: '1', body: '# A\n' }]);

    const report = await runIngest(ingestConfig(id, remote.clone, remote), 'job-0', { dryRun: true }, deps(fake));
    expect(report).toMatchObject({ status: 'dry_run', added: ['docs/imported/a.md'] });
    expect(await remoteHead(remote)).toBe(before);
    expect(await gitHead(remote.clone)).toBe(before);
  });

  it('pushes from a worktree and leaves a dirty operator checkout alone', async () => {
    const id = '80000000-0000-4000-8000-000000000009';
    const remote = await createSourceRemote('ingest-dirty', id);
    const before = await gitHead(remote.clone);
    await writeFile(join(remote.clone, 'docs/readme.md'), 'local edit\n');
    const fake = fakeConnector(() => [{ id: 'a', title: 'A', revision: '1', body: '# A\n' }]);

    const report = await runIngest(ingestConfig(id, remote.clone, remote), 'job-0', {}, deps(fake));
    expect(report.status).toBe('pushed');
    expect(report.checkout?.status).toBe('dirty');
    expect(await gitHead(remote.clone)).toBe(before);
    expect(await readFile(join(remote.clone, 'docs/readme.md'), 'utf8')).toBe('local edit\n');
    expect(await remoteHead(remote)).not.toBe(before);
  });

  it('runs an assigned job on one device only, and --here adds no second commit', async () => {
    const id = '80000000-0000-4000-8000-00000000000a';
    const remote = await createSourceRemote('ingest-devices', id);
    const desk = await cloneRemote(remote, 'ingest-devices-desk');
    const fake = fakeConnector(() => [{ id: 'a', title: 'A', revision: '1', body: '# A\n' }]);
    const laptopConfig = ingestConfig(id, remote.clone, remote, [{ device: 'laptop' }]);
    const deskConfig = ingestConfig(id, desk, remote, [{ device: 'laptop' }]);

    const onLaptop = await runIngest(laptopConfig, 'job-0', { deviceName: 'laptop' }, deps(fake));
    expect(onLaptop.status).toBe('pushed');

    const onDesk = await runIngest(deskConfig, 'job-0', { deviceName: 'desk' }, deps(fake));
    expect(onDesk.status).toBe('assigned_elsewhere');

    const forced = await runIngest(deskConfig, 'job-0', { deviceName: 'desk', here: true }, deps(fake));
    expect(forced.status).toBe('unchanged');
    expect(await commitCount(remote)).toBe(2);
  });
});
