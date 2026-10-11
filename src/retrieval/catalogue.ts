import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { cataloguePath } from '../env.js';
import type { KnowledgeDocument } from '../core/documents.js';

export interface CatalogueEntry {
  readonly uri: string;
  readonly sourceId: string;
  readonly docId: string;
  readonly identity: 'stable' | 'unstable_identity';
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly contentHash: string;
  readonly gitCommit: string | undefined;
  readonly title: string | undefined;
}

export interface CatalogueSource {
  readonly gitCommit: string | undefined;
}

export interface Catalogue {
  readonly generation: number;
  readonly updatedAt: string;
  readonly indexId: string;
  readonly qmdPackage: string;
  /** Commit each source was indexed at, including sources with no documents. */
  readonly sources?: Readonly<Record<string, CatalogueSource>>;
  readonly entries: readonly CatalogueEntry[];
}

export function buildCatalogue(
  indexId: string,
  generation: number,
  documents: readonly (KnowledgeDocument & { readonly gitCommit?: string })[],
  sources: Readonly<Record<string, CatalogueSource>> = {},
): Catalogue {
  return {
    generation,
    updatedAt: new Date().toISOString(),
    indexId,
    qmdPackage: '2.8.3',
    sources,
    entries: documents.map((document) => ({
      uri: document.uri,
      sourceId: document.sourceId,
      docId: document.docId,
      identity: document.identity,
      relativePath: document.relativePath,
      absolutePath: document.absolutePath,
      contentHash: document.contentHash,
      gitCommit: document.gitCommit,
      title: document.title,
    })),
  };
}

export async function saveCatalogue(indexId: string, catalogue: Catalogue): Promise<void> {
  const path = cataloguePath(indexId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(catalogue, null, 2)}\n`, 'utf8');
}

export async function loadCatalogue(indexId: string): Promise<Catalogue | undefined> {
  try {
    const text = await readFile(cataloguePath(indexId), 'utf8');
    return JSON.parse(text) as Catalogue;
  } catch {
    return undefined;
  }
}

export function findCatalogueEntry(
  catalogue: Catalogue,
  docRef: string,
): CatalogueEntry | undefined {
  return catalogue.entries.find(
    (entry) =>
      entry.docId === docRef ||
      entry.relativePath === docRef ||
      entry.uri === docRef ||
      entry.absolutePath === docRef,
  );
}
