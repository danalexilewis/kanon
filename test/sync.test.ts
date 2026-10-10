import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runGit } from '../src/sources/git.js';
import { syncSource } from '../src/sources/sync.js';
import { testRoot } from './setup.js';

describe('sync', () => {
  it('leaves a dirty managed repo untouched', async () => {
    const repo = join(testRoot, 'dirty-repo');
    await mkdir(repo, { recursive: true });
    await runGit(repo, ['init']);
    await writeFile(join(repo, 'a.md'), 'one\n');
    await runGit(repo, ['add', 'a.md']);
    await runGit(repo, ['-c', 'user.email=t@t.test', '-c', 'user.name=t', 'commit', '-m', 'init']);
    await writeFile(join(repo, 'a.md'), 'dirty\n');

    const result = await syncSource({
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'managed',
      path: repo,
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().status).toBe('dirty');
    const { readFile } = await import('node:fs/promises');
    expect(await readFile(join(repo, 'a.md'), 'utf8')).toBe('dirty\n');
  });
});
