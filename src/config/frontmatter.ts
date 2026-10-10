import { parse as parseYaml } from 'yaml';

import { documentDocSchema } from './schemas.js';

export interface ParsedDocument {
  readonly raw: Record<string, unknown> | undefined;
  readonly docId: string | undefined;
  readonly title: string | undefined;
  readonly vars: Record<string, unknown> | undefined;
  readonly identity: 'stable' | 'unstable_identity';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Split optional YAML frontmatter from Markdown. */
export function splitFrontmatter(text: string): {
  readonly data: unknown;
  readonly body: string;
} {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return { data: undefined, body: text };
  }
  const rest = text.slice(text.startsWith('---\r\n') ? 5 : 4);
  const closer = rest.search(/\r?\n---(?:\r?\n|$)/);
  if (closer === -1) {
    return { data: undefined, body: text };
  }
  const raw = rest.slice(0, closer);
  const after = rest.slice(closer).replace(/^\r?\n---(?:\r?\n)?/, '');
  return { data: parseYaml(raw), body: after };
}

export function interpretFrontmatter(data: unknown): ParsedDocument {
  if (!isPlainObject(data)) {
    return {
      raw: undefined,
      docId: undefined,
      title: undefined,
      vars: undefined,
      identity: 'unstable_identity',
    };
  }
  const docParsed = documentDocSchema.safeParse(data.doc);
  const vars = isPlainObject(data.vars) ? data.vars : undefined;
  if (!docParsed.success) {
    return {
      raw: data,
      docId: undefined,
      title: typeof data.title === 'string' ? data.title : undefined,
      vars,
      identity: 'unstable_identity',
    };
  }
  return {
    raw: data,
    docId: docParsed.data.id,
    title: docParsed.data.title,
    vars,
    identity: 'stable',
  };
}
