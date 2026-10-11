import { chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dispatchCli } from '../src/cli/commands.js';
import { parseArgv } from '../src/cli/parse.js';
import { loadMachineConfig, saveMachineConfig } from '../src/config/machine.js';
import { emptyMachineConfig } from '../src/config/schemas.js';
import { checkAudience, hostFor } from '../src/hosts/audience.js';
import { createSourceRemote } from './git-helpers.js';
import { OPERATOR_PERSON } from './helpers.js';
import { testRoot } from './setup.js';

describe('host audience', () => {
  it('treats file remotes as local and hosted remotes as unverified', () => {
    expect(hostFor('file:///tmp/me.git')).toBe('local');
    expect(hostFor('/tmp/me.git')).toBe('local');
    expect(hostFor('https://github.com/org/repo.git')).toBe('unverified');
    expect(hostFor('git@github.com:org/repo.git')).toBe('unverified');
  });

  it('passes an owner-only local circle and rejects a group-readable one', async () => {
    const id = 'c0000000-0000-4000-8000-000000000001';
    const remote = await createSourceRemote('audience-ok', id);
    const circle = { id: 'me', source: id, members: ['operator'], ceiling: 3 as const, admit: 'auto' as const };
    const source = { id, kind: 'managed' as const, path: remote.clone, remote: remote.url, access: 'write' as const };
    expect((await checkAudience(circle, source))._unsafeUnwrap().readers).toEqual(['operator']);

    await chmod(remote.bare, 0o750);
    const wide = await checkAudience(circle, source);
    expect(wide._unsafeUnwrapErr().code).toBe('audience_too_wide');
  });

  it('reports unverified when the path is missing or the remote is hosted', async () => {
    const circle = { id: 'me', source: 'c0000000-0000-4000-8000-000000000002', members: ['operator'], ceiling: 3 as const };
    const missing = await checkAudience(circle, {
      id: circle.source,
      kind: 'managed',
      path: join(testRoot, 'no-such-checkout'),
      remote: `file://${join(testRoot, 'no-such.git')}`,
      access: 'write',
    });
    expect(missing._unsafeUnwrapErr().code).toBe('audience_unverified');

    const hosted = await checkAudience(circle, {
      id: circle.source,
      kind: 'managed',
      path: join(testRoot, 'hosted'),
      remote: 'https://github.com/example/repo.git',
      access: 'write',
    });
    expect(hosted._unsafeUnwrapErr().code).toBe('audience_unverified');
  });

  it('circle init produces a working owner-only circle', async () => {
    await saveMachineConfig({
      ...emptyMachineConfig(),
      people: [OPERATOR_PERSON],
    });
    const dir = join(testRoot, 'circles');
    await mkdir(dir, { recursive: true });
    const chunks: string[] = [];
    const write = (chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    };
    const spy = process.stdout.write.bind(process.stdout);
    process.stdout.write = write as typeof process.stdout.write;
    try {
      await dispatchCli(parseArgv(['circle', 'init', 'me', '--dir', dir, '--members', 'operator', '--ceiling', '3']));
    } finally {
      process.stdout.write = spy;
    }
    const printed = JSON.parse(chunks.join('')) as { id: string; path: string };
    expect(printed.id).toBe('me');
    const config = (await loadMachineConfig())._unsafeUnwrap();
    const circle = config.circles?.[0];
    const source = config.sources.find((entry) => entry.id === circle?.source);
    expect(circle?.admit).toBe('review');
    expect(source?.remote?.startsWith('file://')).toBe(true);
    expect((await checkAudience(circle!, source!)).isOk()).toBe(true);
  });
});
