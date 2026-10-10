import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

import { parseSourceManifest } from '../src/config/source-manifest.js';
import { resolveContainedPath } from '../src/config/paths.js';
import { scanSourceDocuments } from '../src/core/documents.js';
import { copyFixture, TEAM_ALPHA_ID } from './helpers.js';
import { testRoot } from './setup.js';

describe('source manifest', () => {
  it('rejects extra keys such as hooks', () => {
    const parsed = parseSourceManifest({
      schema: 'kanon/source/v1',
      id: TEAM_ALPHA_ID,
      name: 'x',
      roots: [{ path: 'docs' }],
      hooks: { update: 'true' },
    });
    expect(parsed.isErr()).toBe(true);
  });

  it('rejects a root path that escapes the repository', async () => {
    const resolved = await resolveContainedPath(testRoot, '../../../etc');
    expect(resolved.isErr()).toBe(true);
  });

  it('rejects a symlink root that escapes the repository', async () => {
    const repo = join(testRoot, 'symlink-repo');
    await mkdir(join(repo, 'docs'), { recursive: true });
    await symlink('/tmp', join(repo, 'docs', 'escape'));
    const resolved = await resolveContainedPath(repo, 'docs/escape');
    expect(resolved.isErr()).toBe(true);
  });

  it('rejects duplicate document ids', async () => {
    const dir = join(testRoot, 'dupes');
    await mkdir(join(dir, 'docs'), { recursive: true });
    const front = `---
schema: eddy-kb/document/v1
doc:
  id: 59e71e48-76c1-4c01-aab3-1d39a4fe8e64
  title: A
---
`;
    await writeFile(join(dir, 'docs', 'a.md'), `${front}\none\n`);
    await writeFile(join(dir, 'docs', 'b.md'), `${front}\ntwo\n`);
    const scanned = await scanSourceDocuments(dir, {
      schema: 'kanon/source/v1',
      id: TEAM_ALPHA_ID,
      name: 'dupes',
      roots: [{ path: 'docs', pattern: '**/*.md' }],
      exclude: [],
    });
    expect(scanned.isErr()).toBe(true);
    expect(scanned._unsafeUnwrapErr().message).toMatch(/Duplicate/);
  });

  it('parses the team-alpha fixture', async () => {
    const dest = join(testRoot, 'alpha-copy');
    await copyFixture('team-alpha', dest);
    const { readFile } = await import('node:fs/promises');
    const parsed = parseSourceManifest(
      parseYaml(await readFile(join(dest, 'kanon.yml'), 'utf8')),
    );
    expect(parsed._unsafeUnwrap().id).toBe(TEAM_ALPHA_ID);
  });
});
