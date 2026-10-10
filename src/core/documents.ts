import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import { err, ok, type Result } from 'neverthrow';

import { interpretFrontmatter, splitFrontmatter } from '../config/frontmatter.js';
import { resolveContainedPath } from '../config/paths.js';
import type { SourceManifest } from '../config/schemas.js';
import { invalidConfig } from '../errors.js';
import type { RailError } from '@eddy-works/never-rest';
import { sha256Bytes } from './hash.js';
import { pathIdentity } from './identity.js';
import { documentUri } from './uris.js';

export interface KnowledgeDocument {
  readonly sourceId: string;
  readonly docId: string;
  readonly identity: 'stable' | 'unstable_identity';
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly title: string | undefined;
  readonly contentHash: string;
  readonly vars: Record<string, unknown> | undefined;
  readonly uri: string;
}

function matchesExclude(
  relativePath: string,
  exclude: readonly string[],
): boolean {
  return exclude.some((pattern) => {
    if (pattern.endsWith('/**')) {
      return relativePath.startsWith(pattern.slice(0, -3));
    }
    return relativePath === pattern || relativePath.endsWith(`/${pattern}`);
  });
}

async function filesForRoot(
  repoRoot: string,
  rootPath: string,
  pattern: string,
): Promise<readonly string[]> {
  const contained = await resolveContainedPath(repoRoot, rootPath);
  if (contained.isErr()) {
    return [];
  }
  const matches: string[] = [];
  for await (const file of glob(pattern, {
    cwd: contained.value,
  })) {
    matches.push(resolve(contained.value, file));
  }
  return matches;
}

export async function loadDocument(
  sourceId: string,
  repoRoot: string,
  absolutePath: string,
): Promise<KnowledgeDocument> {
  const bytes = await readFile(absolutePath);
  const text = bytes.toString('utf8');
  const split = splitFrontmatter(text);
  const parsed = interpretFrontmatter(split.data);
  const relativePath = pathIdentity(relative(repoRoot, absolutePath));
  const docId = parsed.docId ?? relativePath;
  return {
    sourceId,
    docId,
    identity: parsed.identity,
    relativePath,
    absolutePath,
    title: parsed.title,
    contentHash: sha256Bytes(bytes),
    vars: parsed.vars,
    uri: documentUri(sourceId, docId),
  };
}

export async function scanSourceDocuments(
  repoRoot: string,
  manifest: SourceManifest,
): Promise<Result<readonly KnowledgeDocument[], RailError<'invalid_config'>>> {
  const collected: KnowledgeDocument[] = [];
  const seenIds = new Map<string, string>();

  for (const root of manifest.roots) {
    const files = await filesForRoot(repoRoot, root.path, root.pattern);
    for (const file of files) {
      const relativePath = pathIdentity(relative(repoRoot, file));
      if (matchesExclude(relativePath, manifest.exclude)) {
        continue;
      }
      const document = await loadDocument(manifest.id, repoRoot, file);
      const existing = seenIds.get(document.docId);
      if (existing !== undefined && existing !== document.relativePath) {
        return err(
          invalidConfig(`Duplicate document id ${document.docId}`),
        );
      }
      seenIds.set(document.docId, document.relativePath);
      collected.push(document);
    }
  }

  return ok(collected);
}
