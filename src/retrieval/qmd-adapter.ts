import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { createStore, type CollectionConfig, type QMDStore } from '@tobilu/qmd';

import type { MachineConfig, SourceManifest } from '../config/schemas.js';
import { indexDbPath } from '../env.js';
import { qmdUnavailable } from '../errors.js';
import { err, ok, type Result } from 'neverthrow';
import type { RailError } from '@eddy-works/never-rest';

export type SearchMode = 'lexical' | 'semantic' | 'hybrid';

export interface QmdHit {
  readonly path: string;
  readonly title: string;
  readonly score: number;
  readonly collectionName: string;
  readonly snippet: string | undefined;
}

export function collectionName(sourceId: string, rootIndex: number): string {
  return `s${sourceId.replaceAll('-', '').slice(0, 12)}r${rootIndex}`;
}

export function collectionsForIndex(
  config: MachineConfig,
  indexId: string,
  manifests: ReadonlyMap<string, { readonly path: string; readonly manifest: SourceManifest }>,
): CollectionConfig {
  const index = config.indexes.find((entry) => entry.id === indexId);
  const collections: CollectionConfig['collections'] = {};
  if (index === undefined) {
    return { collections };
  }
  for (const sourceId of index.sources) {
    const loaded = manifests.get(sourceId);
    if (loaded === undefined) {
      continue;
    }
    loaded.manifest.roots.forEach((root, rootIndex) => {
      collections[collectionName(sourceId, rootIndex)] = {
        path: loaded.path,
        pattern: `${root.path.replace(/\/$/, '')}/${root.pattern}`,
        ...(root.context !== undefined ? { context: { '': root.context } } : {}),
        ...(loaded.manifest.exclude.length > 0
          ? { ignore: [...loaded.manifest.exclude] }
          : {}),
      };
    });
  }
  return { collections };
}

export async function openIndexStore(
  indexId: string,
  collections: CollectionConfig,
): Promise<Result<QMDStore, RailError<'qmd_unavailable'>>> {
  const dbPath = indexDbPath(indexId);
  try {
    await mkdir(dirname(dbPath), { recursive: true });
    const store = await createStore({ dbPath, config: collections });
    return ok(store);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(qmdUnavailable(message));
  }
}

export async function searchStore(
  store: QMDStore,
  query: string,
  mode: SearchMode,
  limit: number,
): Promise<Result<{ readonly mode: SearchMode; readonly hits: readonly QmdHit[] }, RailError<'qmd_unavailable'>>> {
  try {
    if (mode === 'lexical') {
      const rows = await store.searchLex(query, { limit });
      return ok({ mode, hits: rows.map(toHit) });
    }
    if (mode === 'semantic') {
      const rows = await store.searchVector(query, { limit });
      return ok({ mode, hits: rows.map(toHit) });
    }
    const rows = await store.search({ query, limit, rerank: false });
    return ok({
      mode,
      hits: rows.map((row) => ({
        path: row.file,
        title: row.title,
        score: row.score,
        collectionName: '',
        snippet: row.bestChunk,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(qmdUnavailable(message));
  }
}

function toHit(row: {
  readonly filepath: string;
  readonly title: string;
  readonly score: number;
  readonly collectionName: string;
}): QmdHit {
  return {
    path: row.filepath,
    title: row.title,
    score: row.score,
    collectionName: row.collectionName,
    snippet: undefined,
  };
}
