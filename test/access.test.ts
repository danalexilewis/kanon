import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { dispatchCli } from '../src/cli/commands.js';
import { loadMachineConfig, saveMachineConfig } from '../src/config/machine.js';
import type { MachineConfig } from '../src/config/schemas.js';
import { probeSourceAccess, probeSourceWrite } from '../src/sources/access.js';
import { gitLsRemote } from '../src/sources/git.js';
import { createSourceRemote, remoteHead } from './git-helpers.js';
import { testRoot } from './setup.js';

const SOURCE_ID = '66666666-6666-4666-8666-666666666666';

describe('remote access', () => {
  it('reads the remote head and probes write access on a bare remote', async () => {
    const remote = await createSourceRemote('access-ok', SOURCE_ID);
    const head = await gitLsRemote(remote.clone, remote.url, 'main');
    expect(head._unsafeUnwrap()).toBe(await remoteHead(remote));

    const source = {
      id: SOURCE_ID,
      kind: 'managed' as const,
      path: remote.clone,
      remote: remote.url,
      access: 'write' as const,
    };
    expect((await probeSourceWrite(source)).isOk()).toBe(true);
    const probe = await probeSourceAccess(source);
    expect(probe).toMatchObject({ read: true, write: true });
  });

  it('reports write_denied when the remote cannot be opened', async () => {
    const remote = await createSourceRemote('access-missing', SOURCE_ID);
    const source = {
      id: SOURCE_ID,
      kind: 'managed' as const,
      path: remote.clone,
      remote: `file://${join(testRoot, 'does-not-exist.git')}`,
    };
    const denied = await probeSourceWrite(source);
    expect(denied._unsafeUnwrapErr().code).toBe('write_denied');
    expect(await probeSourceAccess(source)).toMatchObject({ read: false, write: false });
  });

  it('source set saves access: write only after the probe passes', async () => {
    const remote = await createSourceRemote('access-set', SOURCE_ID);
    const config: MachineConfig = {
      schema: 'kanon/machine/v1',
      sources: [{ id: SOURCE_ID, kind: 'managed', path: remote.clone }],
      indexes: [],
      projects: [],
      grants: [],
    };
    await saveMachineConfig(config);

    await expect(
      dispatchCli({
        command: 'source',
        rest: ['set', SOURCE_ID],
        flags: { access: 'write', remote: `file://${join(testRoot, 'nope.git')}` },
      }),
    ).rejects.toThrow(/Write access refused/);
    expect((await loadMachineConfig())._unsafeUnwrap().sources[0]?.access).toBeUndefined();

    await dispatchCli({
      command: 'source',
      rest: ['set', SOURCE_ID],
      flags: { access: 'write', remote: remote.url, refresh: 'hourly' },
    });
    const saved = (await loadMachineConfig())._unsafeUnwrap().sources[0];
    expect(saved).toMatchObject({ access: 'write', refresh: 'hourly', remote: remote.url });
  });

  it('source set refuses access: write on a local source', async () => {
    await saveMachineConfig({
      schema: 'kanon/machine/v1',
      sources: [{ id: SOURCE_ID, kind: 'local', path: testRoot }],
      indexes: [],
      projects: [],
      grants: [],
    });
    await expect(
      dispatchCli({ command: 'source', rest: ['set', SOURCE_ID], flags: { access: 'write' } }),
    ).rejects.toThrow(/managed/);
  });
});
