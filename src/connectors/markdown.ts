import { createHash } from 'node:crypto';
import { posix } from 'node:path';

import { stringify as stringifyYaml } from 'yaml';

import type { DocumentAccess } from '../config/schemas.js';
import type { ConnectorItem } from './types.js';

/** Namespace for ingested document ids (UUID v5). Never change it. */
export const INGEST_ID_NAMESPACE = '3f1d9a6c-2b47-4e0f-9c1a-7e5b8d2f4a60';

export const ASSETS_DIR = '_assets';

/** Same cap as Google's export limit; larger documents are skipped. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

function uuidBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

/** RFC 9562 UUID version 5 (SHA-1, name-based). */
export function uuidV5(name: string, namespace: string = INGEST_ID_NAMESPACE): string {
  const hash = createHash('sha1')
    .update(uuidBytes(namespace))
    .update(Buffer.from(name, 'utf8'))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Stable across renames and moves upstream, so git sees a rename, not a new doc. */
export function ingestDocId(sourceId: string, uri: string): string {
  return uuidV5(`${sourceId}\n${uri}`);
}

export function slugify(value: string, fallback = 'untitled'): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : fallback;
}

/** Slug every folder segment; `..`, `.` and empty segments disappear. */
export function safeRelativeDir(dir: string): string {
  return dir
    .split(/[\\/]+/)
    .map((segment) => slugify(segment, ''))
    .filter((segment) => segment.length > 0)
    .join('/');
}

export interface ExtractedAsset {
  /** Relative to the job target, e.g. `_assets/ab12….png`. */
  readonly path: string;
  readonly bytes: Buffer;
}

const DATA_URI = /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g;

function extensionFor(mime: string): string {
  const subtype = mime.split('/')[1]?.toLowerCase() ?? 'bin';
  if (subtype === 'jpeg') {
    return 'jpg';
  }
  if (subtype === 'svg+xml') {
    return 'svg';
  }
  return /^[a-z0-9]+$/.test(subtype) ? subtype : 'bin';
}

function stripImages(markdown: string): string {
  const labels = new Set<string>();
  const withoutDefinitions = markdown.replace(
    /^\s*\[([^\]\n]+)\]:\s*<?data:image\/[^\s>]+>?[^\n]*\n?/gm,
    (_match, label: string) => {
      labels.add(label.toLowerCase());
      return '';
    },
  );
  return withoutDefinitions
    .replace(/!\[[^\]\n]*\]\[([^\]\n]*)\]/g, (match, label: string) =>
      labels.has(label.toLowerCase()) ? '' : match,
    )
    .replace(/!\[[^\]\n]*\]\(\s*<?data:image\/[^)]*\)/g, '')
    .replace(DATA_URI, '');
}

/**
 * Google's Markdown export inlines images as base64 data URIs. `extract`
 * moves them to content-hashed files under `_assets`; `strip` drops them.
 * `docDir` is the document's folder relative to the job target.
 */
export function processImages(
  markdown: string,
  mode: 'extract' | 'strip',
  docDir: string,
): { readonly markdown: string; readonly assets: readonly ExtractedAsset[] } {
  if (mode === 'strip') {
    return { markdown: stripImages(markdown), assets: [] };
  }
  const assets = new Map<string, ExtractedAsset>();
  const toAssets = posix.relative(docDir === '' ? '.' : docDir, ASSETS_DIR);
  const rewritten = markdown.replace(DATA_URI, (_match, mime: string, data: string) => {
    const bytes = Buffer.from(data, 'base64');
    const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}.${extensionFor(mime)}`;
    assets.set(name, { path: `${ASSETS_DIR}/${name}`, bytes });
    return `${toAssets}/${name}`;
  });
  return { markdown: rewritten, assets: [...assets.values()] };
}

/** Asset file names a rendered document points at. */
export function referencedAssets(markdown: string): readonly string[] {
  return [...markdown.matchAll(/_assets\/([a-f0-9]{16,64}\.[a-z0-9]+)/g)].map(
    (match) => match[1] ?? '',
  );
}

/**
 * Wrap connector Markdown in Kanon frontmatter. Kanon owns `doc.id`,
 * `doc.kind` and `doc.sources`; upstream `vars` are kept as data.
 */
export function renderIngestedDocument(input: {
  readonly item: ConnectorItem;
  readonly sourceId: string;
  readonly body: string;
  readonly vars?: Record<string, unknown>;
  readonly access?: DocumentAccess;
}): string {
  const frontmatter = {
    schema: 'eddy-kb/document/v1',
    doc: {
      id: ingestDocId(input.sourceId, input.item.uri),
      title: input.item.title,
      kind: 'source',
      sources: [
        { uri: input.item.uri, revision: input.item.revision, relation: 'exported-from' },
      ],
      ...(input.access !== undefined ? { access: input.access } : {}),
    },
    ...(input.vars !== undefined ? { vars: input.vars } : {}),
  };
  const body = input.body.replace(/^\s+/, '').replace(/\s*$/, '\n');
  return `---\n${stringifyYaml(frontmatter)}---\n\n${body}`;
}
