import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { dispatchCli } from '../src/cli/commands.js';
import { parseArgv } from '../src/cli/parse.js';
import { initDevice, renameDevice } from '../src/config/device.js';
import { loadMachineConfig, saveMachineConfig } from '../src/config/machine.js';
import { emptyMachineConfig } from '../src/config/schemas.js';
import { configPath, credentialsPath } from '../src/env.js';
import { acquireTickLock } from '../src/jobs/state.js';
import { createSourceRemote, remoteHead } from './git-helpers.js';
import { testRoot } from './setup.js';

async function run(argv: readonly string[]): Promise<unknown> {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    chunks.push(String(chunk));
    return true;
  });
  try {
    await dispatchCli(parseArgv(argv));
  } finally {
    spy.mockRestore();
  }
  return JSON.parse(chunks.join(''));
}

afterEach(() => {
  process.exitCode = undefined;
});

describe('job CLI', () => {
  it('keeps connector secrets out of config.yml and in a 0600 credentials file', async () => {
    await saveMachineConfig(emptyMachineConfig());
    const keyFile = join(testRoot, 'sa.json');
    await writeFile(
      keyFile,
      JSON.stringify({
        type: 'service_account',
        client_email: 'kanon@example.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n',
      }),
    );
    const secretFile = join(testRoot, 'client.json');
    await writeFile(
      secretFile,
      JSON.stringify({ installed: { client_id: 'cid', client_secret: 'csecret' } }),
    );

    await run(['connector', 'add', 'drive-sa', '--kind', 'google-drive', '--service-account', keyFile]);
    const added = (await run(['connector', 'add', 'drive', '--kind', 'google-drive', '--client-secret', secretFile])) as {
      nextStep?: string;
    };
    expect(added.nextStep).toBe('Run kanon connector auth drive');

    const configText = await readFile(configPath(), 'utf8');
    expect(configText).not.toContain('secret');
    expect(configText).not.toContain('PRIVATE KEY');
    expect((await loadMachineConfig())._unsafeUnwrap().connectors).toEqual([
      { id: 'drive-sa', kind: 'google-drive', auth: 'service-account' },
      { id: 'drive', kind: 'google-drive', auth: 'oauth' },
    ]);
    expect((await stat(credentialsPath('drive-sa'))).mode & 0o777).toBe(0o600);

    const listed = (await run(['connector', 'list'])) as Array<{ id: string; credentials: string }>;
    expect(listed.map((row) => [row.id, row.credentials])).toEqual([
      ['drive-sa', 'ready'],
      ['drive', 'needs_auth'],
    ]);
  });

  it('refuses a manual ingest run on the wrong device without --here', async () => {
    await initDevice();
    await renameDevice('laptop');
    const id = 'a0000000-0000-4000-8000-000000000001';
    const remote = await createSourceRemote('cli-ingest', id);
    await saveMachineConfig({
      ...emptyMachineConfig(),
      sources: [{ id, kind: 'managed', path: remote.clone, remote: remote.url, branch: 'main', access: 'write' }],
      connectors: [{ id: 'drive', kind: 'google-drive', auth: 'oauth' }],
      ingest: [{ id: 'policies', connector: 'drive', source: id, folder: 'f', target: 'docs/policies', device: 'desk' }],
    });
    const before = await remoteHead(remote);

    const output = (await run(['ingest', 'run', 'policies'])) as { report: { status: string } };
    expect(output.report.status).toBe('assigned_elsewhere');
    expect(process.exitCode).toBe(1);
    expect(await remoteHead(remote)).toBe(before);
  });

  it('reports a locked tick quietly instead of failing', async () => {
    await saveMachineConfig(emptyMachineConfig());
    const held = (await acquireTickLock())._unsafeUnwrap();
    try {
      const output = (await run(['tick'])) as { status: string };
      expect(output.status).toBe('locked');
      expect(process.exitCode).toBeUndefined();
    } finally {
      await held();
    }
  });
});
