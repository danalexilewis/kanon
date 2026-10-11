import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import type { MachineConfig } from '../src/config/schemas.js';
import { readCredentials, writeCredentials } from '../src/connectors/credentials.js';
import { authorizeOAuth } from '../src/connectors/google-drive/auth.js';
import {
  parseClientSecretFile,
  parseServiceAccountFile,
} from '../src/connectors/google-drive/credentials.js';
import { createDriveConnector } from '../src/connectors/google-drive/drive.js';
import { createGoogleDriveConnector } from '../src/connectors/google-drive/index.js';
import { ingestDocId } from '../src/connectors/markdown.js';
import { runIngest } from '../src/jobs/ingest.js';
import { createSourceRemote, git } from './git-helpers.js';

const DOC = 'application/vnd.google-apps.document';
const FOLDER = 'application/vnd.google-apps.folder';
const TOKEN = 'ya29.secret-token';
const PNG = Buffer.from('drive-png').toString('base64');

interface FakeFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly parents: readonly string[];
  readonly version?: string;
  readonly content?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A tiny in-memory Drive v3: pages of two, export and alt=media. */
function fakeDrive(files: readonly FakeFile[]) {
  const calls: URL[] = [];
  const scripted: Response[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    const queued = scripted.shift();
    if (queued !== undefined) {
      return queued;
    }
    const headers = new Headers(init?.headers);
    if (headers.get('authorization') !== `Bearer ${TOKEN}`) {
      return json({ error: { message: 'Invalid Credentials' } }, 401);
    }
    if (url.pathname === '/drive/v3/files') {
      const parent = /'([^']+)' in parents/.exec(url.searchParams.get('q') ?? '')?.[1];
      const children = files.filter((file) => parent !== undefined && file.parents.includes(parent));
      const offset = Number(url.searchParams.get('pageToken') ?? 0);
      const page = children.slice(offset, offset + 2);
      return json({
        files: page.map(({ id, name, mimeType, version }) => ({ id, name, mimeType, version })),
        ...(offset + 2 < children.length ? { nextPageToken: String(offset + 2) } : {}),
      });
    }
    const exported = /^\/drive\/v3\/files\/([^/]+)\/export$/.exec(url.pathname);
    const media = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    const id = decodeURIComponent((exported ?? media)?.[1] ?? '');
    const file = files.find((entry) => entry.id === id);
    if (file === undefined) {
      return json({ error: { message: 'File not found' } }, 404);
    }
    if (exported !== null && url.searchParams.get('mimeType') === 'text/markdown') {
      return new Response(file.content ?? '');
    }
    if (media !== null && url.searchParams.get('alt') === 'media') {
      return new Response(file.content ?? '');
    }
    return json({ error: { message: 'Bad request' } }, 400);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls, scripted };
}

const TREE: readonly FakeFile[] = [
  { id: 'doc-handbook', name: 'Handbook', mimeType: DOC, parents: ['root'], version: '12', content: '# Handbook\n' },
  { id: 'md-notes', name: 'notes.md', mimeType: 'text/markdown', parents: ['root'], version: '3', content: '# Notes\n' },
  { id: 'sheet-budget', name: 'Budget', mimeType: 'application/vnd.google-apps.spreadsheet', parents: ['root'], version: '1' },
  { id: 'folder-policies', name: 'Policies', mimeType: FOLDER, parents: ['root', 'folder-archive'] },
  { id: 'doc-leave', name: 'Leave', mimeType: DOC, parents: ['folder-policies'], version: '7', content: '# Leave\n' },
  { id: 'folder-archive', name: 'Archive', mimeType: FOLDER, parents: ['folder-policies'] },
];

function connectorFor(drive: ReturnType<typeof fakeDrive>, sleeps: number[] = []) {
  return createDriveConnector({
    connectorId: 'gd',
    accessToken: async () => TOKEN,
    fetch: drive.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
}

describe('google drive connector', () => {
  it('lists a folder tree across pages, once per folder, with formats and revisions', async () => {
    const drive = fakeDrive(TREE);
    const items = (await connectorFor(drive).list({ folder: 'root' }))._unsafeUnwrap();

    expect(items.map((item) => [item.uri, item.title, item.relativeDir, item.revision, item.formats])).toEqual([
      ['gdrive://doc-handbook', 'Handbook', '', '12', ['markdown']],
      ['gdrive://md-notes', 'notes', '', '3', ['markdown']],
      ['gdrive://sheet-budget', 'Budget', '', '1', []],
      ['gdrive://doc-leave', 'Leave', 'Policies', '7', ['markdown']],
    ]);
    const listCalls = drive.calls.filter((url) => url.pathname === '/drive/v3/files');
    expect(listCalls.length).toBe(4);
    expect(listCalls.every((url) => url.searchParams.get('supportsAllDrives') === 'true')).toBe(true);
    expect(listCalls.every((url) => url.searchParams.get('includeItemsFromAllDrives') === 'true')).toBe(true);
  });

  it('exports Google Docs as Markdown and downloads .md files', async () => {
    const drive = fakeDrive(TREE);
    const connector = connectorFor(drive);
    const items = (await connector.list({ folder: 'root' }))._unsafeUnwrap();
    const handbook = items.find((item) => item.externalId === 'doc-handbook')!;
    const notes = items.find((item) => item.externalId === 'md-notes')!;

    expect((await connector.read(handbook, 'markdown'))._unsafeUnwrap()).toBe('# Handbook\n');
    expect((await connector.read(notes, 'markdown'))._unsafeUnwrap()).toBe('# Notes\n');
    const reads = drive.calls.slice(-2).map((url) => url.pathname + url.search);
    expect(reads[0]).toBe('/drive/v3/files/doc-handbook/export?mimeType=text%2Fmarkdown');
    expect(reads[1]).toBe('/drive/v3/files/md-notes?alt=media&supportsAllDrives=true');
  });

  it('refuses unsupported formats and malformed folder ids without calling Drive', async () => {
    const drive = fakeDrive(TREE);
    const connector = connectorFor(drive);
    const sheet = {
      externalId: 'sheet-budget',
      uri: 'gdrive://sheet-budget',
      title: 'Budget',
      relativeDir: '',
      revision: '1',
      formats: [],
    };
    expect((await connector.read(sheet, 'markdown'))._unsafeUnwrapErr().code).toBe('unsupported_format');
    expect((await connector.list({ folder: "root' or 'x" }))._unsafeUnwrapErr().code).toBe('connector_failed');
    expect(drive.calls).toEqual([]);
  });

  it('retries 429 and 5xx, maps 401 to auth_required, and never echoes the token', async () => {
    const drive = fakeDrive(TREE);
    const sleeps: number[] = [];
    const connector = connectorFor(drive, sleeps);

    drive.scripted.push(json({ error: { message: 'Rate limit' } }, 429));
    expect((await connector.list({ folder: 'folder-archive' })).isOk()).toBe(true);
    expect(sleeps).toEqual([1000]);

    drive.scripted.push(json({}, 503), json({}, 503), json({ error: { message: 'Backend Error' } }, 503));
    const failed = (await connector.list({ folder: 'root' }))._unsafeUnwrapErr();
    expect(failed.code).toBe('connector_failed');
    expect(failed.message).toContain('503');
    expect(failed.message).not.toContain(TOKEN);

    drive.scripted.push(json({ error: { message: 'Invalid Credentials' } }, 401));
    expect((await connector.list({ folder: 'root' }))._unsafeUnwrapErr().code).toBe('connector_auth_required');

    const broken = createDriveConnector({
      connectorId: 'gd',
      accessToken: async () => {
        throw new Error('invalid_grant');
      },
      fetch: drive.fetch,
    });
    expect((await broken.list({ folder: 'root' }))._unsafeUnwrapErr().code).toBe('connector_auth_required');
  });

  it('builds from stored credentials and checks the auth mode', async () => {
    const config = { id: 'gd-build', kind: 'google-drive', auth: 'oauth' } as const;
    expect((await createGoogleDriveConnector(config))._unsafeUnwrapErr().code).toBe('connector_auth_required');

    await writeCredentials('gd-build', { type: 'oauth', clientId: 'cid', clientSecret: 'cs' });
    expect((await createGoogleDriveConnector(config))._unsafeUnwrapErr().code).toBe('connector_auth_required');

    await writeCredentials('gd-build', { type: 'oauth', clientId: 'cid', clientSecret: 'cs', refreshToken: 'rt' });
    expect((await createGoogleDriveConnector(config)).isOk()).toBe(true);

    await writeCredentials('gd-build', { type: 'service-account', clientEmail: 'a@b', privateKey: 'k' });
    expect((await createGoogleDriveConnector(config))._unsafeUnwrapErr().code).toBe('invalid_config');

    expect(parseClientSecretFile({ installed: { client_id: 'i', client_secret: 's' } })._unsafeUnwrap()).toEqual({
      type: 'oauth',
      clientId: 'i',
      clientSecret: 's',
    });
    expect(parseClientSecretFile({ type: 'service_account' }).isErr()).toBe(true);
    expect(
      parseServiceAccountFile({ type: 'service_account', client_email: 'e', private_key: 'k' })._unsafeUnwrap(),
    ).toEqual({ type: 'service-account', clientEmail: 'e', privateKey: 'k' });
    expect(parseServiceAccountFile({ installed: {} }).isErr()).toBe(true);
  });

  it('completes the loopback sign-in with PKCE and state, and stores the refresh token', async () => {
    const bodies: string[] = [];
    const tokenServer = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      request.on('end', () => {
        bodies.push(body);
        response.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({ access_token: 'at', refresh_token: 'rt-1', expires_in: 3600, token_type: 'Bearer' }),
        );
      });
    });
    await new Promise<void>((resolve) => tokenServer.listen(0, '127.0.0.1', resolve));
    const tokenUrl = `http://127.0.0.1:${(tokenServer.address() as AddressInfo).port}/token`;
    await writeCredentials('gd-auth', { type: 'oauth', clientId: 'cid', clientSecret: 'csecret' });
    const opened: URL[] = [];

    try {
      const result = await authorizeOAuth('gd-auth', {
        log: () => undefined,
        tokenUrl,
        openUrl: (url) => {
          const auth = new URL(url);
          opened.push(auth);
          const redirect = auth.searchParams.get('redirect_uri') ?? '';
          void fetch(`${redirect}?code=the-code&state=${auth.searchParams.get('state') ?? ''}`);
        },
      });
      expect(result.isOk()).toBe(true);
      expect(opened[0]?.searchParams.get('code_challenge_method')).toBe('S256');
      expect(opened[0]?.searchParams.get('code_challenge')).toBeTruthy();
      expect(opened[0]?.searchParams.get('access_type')).toBe('offline');
      expect(opened[0]?.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.readonly');
      expect(opened[0]?.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth2callback$/);
      const exchange = new URLSearchParams(bodies[0]);
      expect(exchange.get('code')).toBe('the-code');
      expect(exchange.get('code_verifier')).toBeTruthy();
      expect(await readCredentials('gd-auth')).toMatchObject({ refreshToken: 'rt-1' });

      const forged = await authorizeOAuth('gd-auth', {
        log: () => undefined,
        tokenUrl,
        openUrl: (url) => {
          const redirect = new URL(url).searchParams.get('redirect_uri') ?? '';
          void fetch(`${redirect}?code=stolen&state=forged`);
        },
      });
      expect(forged._unsafeUnwrapErr().code).toBe('connector_failed');
      expect(bodies).toHaveLength(1);
    } finally {
      tokenServer.close();
    }
  });

  it('ingests a Drive folder into git with stable ids, provenance and extracted images', async () => {
    const id = 'b0000000-0000-4000-8000-000000000001';
    const remote = await createSourceRemote('drive-e2e', id);
    const drive = fakeDrive([
      {
        id: 'doc-leave',
        name: 'Leave Policy',
        mimeType: DOC,
        parents: ['root'],
        version: '7',
        content: `# Leave\n\n![chart](data:image/png;base64,${PNG})\n`,
      },
      { id: 'folder-guides', name: 'Guides', mimeType: FOLDER, parents: ['root'] },
      { id: 'md-setup', name: 'Setup.md', mimeType: 'text/markdown', parents: ['folder-guides'], version: '2', content: '# Setup\n' },
    ]);
    const config: MachineConfig = {
      schema: 'kanon/machine/v1',
      sources: [{ id, kind: 'managed', path: remote.clone, remote: remote.url, branch: 'main', access: 'write' }],
      indexes: [],
      projects: [],
      grants: [],
      connectors: [{ id: 'gd', kind: 'google-drive', auth: 'oauth' }],
      ingest: [{ id: 'drive', connector: 'gd', source: id, folder: 'root', target: 'docs/drive' }],
    };

    const report = await runIngest(config, 'drive', {}, { connectorFor: async () => ok(connectorFor(drive)) });
    expect(report).toMatchObject({
      status: 'pushed',
      added: ['docs/drive/leave-policy.md', 'docs/drive/guides/setup.md'],
    });
    const leave = await git(remote.bare, ['show', 'main:docs/drive/leave-policy.md']);
    expect(leave).toContain(`id: ${ingestDocId(id, 'gdrive://doc-leave')}`);
    expect(leave).toContain('uri: gdrive://doc-leave');
    expect(leave).toContain('revision: "7"');
    expect(leave).toMatch(/\]\(_assets\/[a-f0-9]{32}\.png\)/);
    const files = await git(remote.bare, ['ls-tree', '-r', '--name-only', 'main']);
    expect(files).toMatch(/docs\/drive\/_assets\/[a-f0-9]{32}\.png/);
  });
});
