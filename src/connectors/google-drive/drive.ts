import { posix } from 'node:path';

import { err, ok, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import { connectorAuthRequired, connectorFailed, unsupportedFormat } from '../../errors.js';
import type {
  Connector,
  ConnectorError,
  ConnectorFormat,
  ConnectorItem,
  ConnectorScope,
} from '../types.js';
import type { AccessTokenProvider } from './auth.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DOC_MIME = 'application/vnd.google-apps.document';
const MARKDOWN_MIMES = new Set(['text/markdown', 'text/x-markdown']);
const FOLDER_ID = /^[A-Za-z0-9_-]+$/;
const LIST_FIELDS = 'nextPageToken,files(id,name,mimeType,version,modifiedTime,webViewLink)';
const MAX_ITEMS = 20_000;
const MAX_ATTEMPTS = 3;

export interface DriveDeps {
  readonly connectorId: string;
  readonly accessToken: AccessTokenProvider;
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

interface DriveFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly version?: string;
  readonly modifiedTime?: string;
  readonly webViewLink?: string;
}

interface DriveList {
  readonly nextPageToken?: string;
  readonly files?: readonly DriveFile[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMarkdownFile(file: DriveFile): boolean {
  if (MARKDOWN_MIMES.has(file.mimeType)) {
    return true;
  }
  return (
    /\.(md|markdown)$/i.test(file.name) &&
    (file.mimeType.startsWith('text/') || file.mimeType === 'application/octet-stream')
  );
}

/** Google Docs export natively to Markdown; uploaded `.md` files download as-is. */
export function driveFormats(file: DriveFile): readonly ConnectorFormat[] {
  return file.mimeType === DOC_MIME || isMarkdownFile(file) ? ['markdown'] : [];
}

function toItem(file: DriveFile, relativeDir: string): ConnectorItem {
  const title = isMarkdownFile(file) ? file.name.replace(/\.(md|markdown)$/i, '') : file.name;
  return {
    externalId: file.id,
    uri: `gdrive://${file.id}`,
    title,
    relativeDir,
    revision: file.version ?? file.modifiedTime ?? '',
    formats: driveFormats(file),
    mimeType: file.mimeType,
    ...(file.webViewLink !== undefined ? { webUrl: file.webViewLink } : {}),
  };
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    return typeof body.error?.message === 'string' ? body.error.message.slice(0, 200) : response.statusText;
  } catch {
    return response.statusText;
  }
}

/**
 * Talk to the Drive REST API with plain `fetch`. Retries 429 and 5xx with
 * backoff; 401 means the stored credentials no longer work.
 */
export function createDriveConnector(deps: DriveDeps): Connector {
  const fetchImpl = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? delay;

  async function request(url: string): Promise<Result<Response, ConnectorError>> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let token: string;
      try {
        token = await deps.accessToken();
      } catch {
        return err(connectorAuthRequired(deps.connectorId));
      }
      let response: Response;
      try {
        response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
      } catch (error) {
        if (attempt === MAX_ATTEMPTS) {
          return err(connectorFailed(`Drive request failed: ${error instanceof Error ? error.message : String(error)}`));
        }
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      if (response.ok) {
        return ok(response);
      }
      if (response.status === 401) {
        return err(connectorAuthRequired(deps.connectorId));
      }
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      return err(connectorFailed(`Drive API ${response.status}: ${await errorMessage(response)}`));
    }
    return err(connectorFailed('Drive request failed'));
  }

  async function listFolder(
    folderId: string,
  ): Promise<Result<readonly DriveFile[], ConnectorError>> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false`,
        fields: LIST_FIELDS,
        pageSize: '1000',
        orderBy: 'name',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        ...(pageToken !== undefined ? { pageToken } : {}),
      });
      const response = await request(`${DRIVE_API}/files?${params.toString()}`);
      if (response.isErr()) {
        return err(response.error);
      }
      const page = (await response.value.json()) as DriveList;
      files.push(...(page.files ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken !== undefined);
    return ok(files);
  }

  async function list(
    scope: ConnectorScope,
  ): Promise<Result<readonly ConnectorItem[], ConnectorError>> {
    if (!FOLDER_ID.test(scope.folder)) {
      return err(connectorFailed('Invalid Google Drive folder id'));
    }
    const items: ConnectorItem[] = [];
    const visited = new Set<string>();
    const queue: Array<{ readonly id: string; readonly dir: string }> = [
      { id: scope.folder, dir: '' },
    ];
    while (queue.length > 0) {
      const next = queue.shift()!;
      if (visited.has(next.id)) {
        continue;
      }
      visited.add(next.id);
      const files = await listFolder(next.id);
      if (files.isErr()) {
        return err(files.error);
      }
      for (const file of files.value) {
        if (file.mimeType === FOLDER_MIME) {
          if (FOLDER_ID.test(file.id)) {
            queue.push({ id: file.id, dir: posix.join(next.dir, file.name) });
          }
          continue;
        }
        items.push(toItem(file, next.dir));
        if (items.length > MAX_ITEMS) {
          return err(connectorFailed(`Folder has more than ${MAX_ITEMS} files`));
        }
      }
    }
    return ok(items);
  }

  async function read(
    item: ConnectorItem,
    format: ConnectorFormat,
  ): Promise<Result<string, ConnectorError | RailError<'unsupported_format'>>> {
    if (format !== 'markdown' || !item.formats.includes('markdown')) {
      return err(unsupportedFormat(`${item.title} (${item.mimeType ?? 'unknown'}) has no Markdown form`));
    }
    const id = encodeURIComponent(item.externalId);
    const url =
      item.mimeType === DOC_MIME
        ? `${DRIVE_API}/files/${id}/export?mimeType=${encodeURIComponent('text/markdown')}`
        : `${DRIVE_API}/files/${id}?alt=media&supportsAllDrives=true`;
    const response = await request(url);
    if (response.isErr()) {
      return err(response.error);
    }
    return ok(await response.value.text());
  }

  return { kind: 'google-drive', scheme: 'gdrive', list, read };
}
