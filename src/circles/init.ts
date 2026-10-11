import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { err, ok, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import type { MachineConfig } from '../config/schemas.js';
import { invalidConfig } from '../errors.js';
import { runGit } from '../sources/git.js';

export interface CircleRepos {
  readonly id: string;
  readonly sourceId: string;
  readonly bare: string;
  readonly checkout: string;
  readonly remote: string;
}

async function ownerOnlyDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

/**
 * Create a local bare repo and checkout for a circle, both mode 0700.
 */
export async function createCircleRepos(
  id: string,
  parentDir: string,
): Promise<Result<CircleRepos, RailError<'invalid_config'>>> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    return err(invalidConfig('Circle id must be a slug'));
  }
  const root = resolve(parentDir);
  await ownerOnlyDir(root);
  const bare = join(root, `${id}.git`);
  const checkout = join(root, id);
  const sourceId = randomUUID();
  await ownerOnlyDir(bare);
  const initBare = await runGit(bare, ['init', '--bare', '-b', 'main']);
  if (initBare.code !== 0) {
    return err(invalidConfig(initBare.stderr || 'Could not create the bare repo'));
  }
  await ownerOnlyDir(checkout);
  const initWork = await runGit(checkout, ['init', '-b', 'main']);
  if (initWork.code !== 0) {
    return err(invalidConfig(initWork.stderr || 'Could not create the checkout'));
  }
  await mkdir(join(checkout, 'docs'), { recursive: true, mode: 0o700 });
  await writeFile(
    join(checkout, 'kanon.yml'),
    `schema: kanon/source/v1\nid: ${sourceId}\nname: ${id}\nroots:\n  - path: docs\n    pattern: "**/*.md"\n`,
    'utf8',
  );
  await writeFile(join(checkout, 'docs/readme.md'), `# ${id}\n\nCircle checkout.\n`, 'utf8');
  const add = await runGit(checkout, ['add', '-A']);
  const commit = await runGit(
    checkout,
    ['-c', 'user.name=Kanon', '-c', 'user.email=kanon@example.test', 'commit', '--no-gpg-sign', '-m', `kanon(circle): seed ${id}`],
    { credentials: true },
  );
  if (add.code !== 0 || commit.code !== 0) {
    return err(invalidConfig(commit.stderr || 'Could not seed the checkout'));
  }
  const remote = `file://${bare}`;
  await runGit(checkout, ['remote', 'add', 'origin', remote]);
  const pushed = await runGit(checkout, ['push', remote, 'HEAD:refs/heads/main'], { credentials: true });
  if (pushed.code !== 0) {
    return err(invalidConfig(pushed.stderr || 'Could not push the seed commit'));
  }
  await chmod(bare, 0o700);
  await chmod(checkout, 0o700);
  return ok({ id, sourceId, bare, checkout, remote });
}

export function configWithCircle(
  config: MachineConfig,
  repos: CircleRepos,
  members: readonly string[],
  ceiling: 0 | 1 | 2 | 3,
): MachineConfig {
  return {
    ...config,
    sources: [
      ...config.sources,
      {
        id: repos.sourceId,
        kind: 'managed',
        path: repos.checkout,
        remote: repos.remote,
        branch: 'main',
        access: 'write',
        refresh: 'daily',
      },
    ],
    indexes: [...config.indexes, { id: repos.id, sources: [repos.sourceId] }],
    circles: [
      ...(config.circles ?? []),
      { id: repos.id, source: repos.sourceId, members: [...members], ceiling, admit: 'review' },
    ],
  };
}
