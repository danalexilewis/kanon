import { err, ok } from 'neverthrow';
import type { LocalHandlers } from '@eddy-works/never-rest/local';
import { readFile } from 'node:fs/promises';

import { loadMachineConfig } from '../config/machine.js';
import type { MachineConfig, SourceManifest } from '../config/schemas.js';
import { loadSourceManifest } from '../config/source-manifest.js';
import { knowledgeContract } from '../contracts/knowledge.js';
import { sha256File } from '../core/hash.js';
import type { Principal } from '../core/principal.js';
import { assertIndexAccess, grantedIndexIds } from '../core/scope.js';
import {
  isRawQmdUri,
  looksLikePathTraversal,
  parseDocumentUri,
} from '../core/uris.js';
import { citationMismatch, indexNotAvailable, notFound } from '../errors.js';
import {
  findCatalogueEntry,
  loadCatalogue,
  type Catalogue,
} from '../retrieval/catalogue.js';
import {
  collectionsForIndex,
  openIndexStore,
  searchStore,
} from '../retrieval/qmd-adapter.js';
import type { AppContext } from './context.js';
import { resolvePrincipal } from './context.js';

function sliceBody(
  text: string,
  fromLine: number | undefined,
  maxLines: number | undefined,
): string {
  if (fromLine === undefined && maxLines === undefined) {
    return text;
  }
  const lines = text.split('\n');
  const start = Math.max((fromLine ?? 1) - 1, 0);
  const end = maxLines === undefined ? lines.length : start + maxLines;
  return lines.slice(start, end).join('\n');
}

function matchHitPath(
  hitPath: string,
  absolutePath: string,
  relativePath: string,
): boolean {
  return (
    hitPath === absolutePath ||
    hitPath === relativePath ||
    hitPath.endsWith(`/${relativePath}`) ||
    absolutePath.endsWith(hitPath)
  );
}

async function loadIndexManifests(
  config: MachineConfig,
  indexId: string,
): Promise<Map<string, { readonly path: string; readonly manifest: SourceManifest }>> {
  const loaded = new Map<
    string,
    { readonly path: string; readonly manifest: SourceManifest }
  >();
  const index = config.indexes.find((entry) => entry.id === indexId);
  for (const sourceId of index?.sources ?? []) {
    const source = config.sources.find((entry) => entry.id === sourceId);
    if (source === undefined) {
      continue;
    }
    const manifest = await loadSourceManifest(source.path);
    if (manifest.isOk()) {
      loaded.set(sourceId, { path: source.path, manifest: manifest.value });
    }
  }
  return loaded;
}

function hitsFromCatalogue(
  catalogue: Catalogue,
  mode: 'lexical' | 'semantic' | 'hybrid',
  rows: readonly {
    readonly path: string;
    readonly title: string;
    readonly score: number;
    readonly snippet: string | undefined;
  }[],
) {
  return rows.flatMap((hit) => {
    const entry = catalogue.entries.find((candidate) =>
      matchHitPath(hit.path, candidate.absolutePath, candidate.relativePath),
    );
    if (entry === undefined) {
      return [];
    }
    return [
      {
        uri: entry.uri,
        sourceId: entry.sourceId,
        docId: entry.docId,
        identity: entry.identity,
        revision: {
          gitCommit: entry.gitCommit,
          contentHash: entry.contentHash,
          generation: catalogue.generation,
        },
        path: entry.relativePath,
        title: hit.title || entry.title,
        score: hit.score,
        mode,
        snippet: hit.snippet,
      },
    ];
  });
}

export const knowledgeHandlers: LocalHandlers<
  typeof knowledgeContract,
  AppContext,
  Principal
> = {
  listIndexes: (args) => {
    const principal = resolvePrincipal(args);
    return ok({
      indexes: [...grantedIndexIds(args.context.config, principal)],
    });
  },

  status: async (args) => {
    const principal = resolvePrincipal(args);
    const ids = grantedIndexIds(args.context.config, principal);
    const indexes = [];
    for (const id of ids) {
      const catalogue = await loadCatalogue(id);
      indexes.push({
        id,
        generation: catalogue?.generation,
        documents: catalogue?.entries.length,
      });
    }
    return ok({ indexes });
  },

  search: async (args) => {
    const principal = resolvePrincipal(args);
    const allowed = assertIndexAccess(
      args.context.config,
      principal,
      args.query.index,
    );
    if (allowed.isErr()) {
      return err(allowed.error);
    }
    const catalogue = await loadCatalogue(args.query.index);
    if (catalogue === undefined) {
      return err(indexNotAvailable());
    }
    const loaded = await loadIndexManifests(args.context.config, args.query.index);
    const storeResult = await openIndexStore(
      args.query.index,
      collectionsForIndex(args.context.config, args.query.index, loaded),
    );
    if (storeResult.isErr()) {
      return err(storeResult.error);
    }
    const searched = await searchStore(
      storeResult.value,
      args.query.query,
      args.query.mode,
      args.query.limit,
    );
    await storeResult.value.close();
    if (searched.isErr()) {
      return err(searched.error);
    }
    return ok({
      mode: searched.value.mode,
      hits: hitsFromCatalogue(catalogue, searched.value.mode, searched.value.hits),
    });
  },

  get: async (args) => {
    const principal = resolvePrincipal(args);
    const allowed = assertIndexAccess(
      args.context.config,
      principal,
      args.query.index,
    );
    if (allowed.isErr()) {
      return err(allowed.error);
    }
    if (isRawQmdUri(args.query.uri) || looksLikePathTraversal(args.query.uri)) {
      return err(notFound());
    }
    const catalogue = await loadCatalogue(args.query.index);
    if (catalogue === undefined) {
      return err(indexNotAvailable());
    }
    const parsed = parseDocumentUri(args.query.uri);
    const entry = findCatalogueEntry(catalogue, parsed?.docRef ?? args.query.uri);
    if (entry === undefined) {
      return err(notFound());
    }
    if (parsed !== undefined && parsed.sourceId !== entry.sourceId) {
      return err(notFound());
    }
    const liveHash = await sha256File(entry.absolutePath);
    if (liveHash !== entry.contentHash) {
      return err(citationMismatch());
    }
    const text = await readFile(entry.absolutePath, 'utf8');
    return ok({
      uri: entry.uri,
      sourceId: entry.sourceId,
      docId: entry.docId,
      identity: entry.identity,
      revision: {
        gitCommit: entry.gitCommit,
        contentHash: entry.contentHash,
        generation: catalogue.generation,
      },
      path: entry.relativePath,
      title: entry.title,
      body: sliceBody(text, args.query.fromLine, args.query.maxLines),
      liveHash,
    });
  },
};

export async function loadAppContext(principal: Principal): Promise<AppContext> {
  const config = await loadMachineConfig();
  if (config.isErr()) {
    throw new Error(config.error.message);
  }
  return { config: config.value, principal };
}
