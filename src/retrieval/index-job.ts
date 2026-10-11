import type { MachineConfig, SourceManifest } from '../config/schemas.js';
import { loadSourceManifest } from '../config/source-manifest.js';
import { scanSourceDocuments, type KnowledgeDocument } from '../core/documents.js';
import { gitHead, gitIsRepo } from '../sources/git.js';
import {
  buildCatalogue,
  loadCatalogue,
  saveCatalogue,
  type Catalogue,
  type CatalogueSource,
} from './catalogue.js';
import { collectionsForIndex, openIndexStore } from './qmd-adapter.js';

export interface IndexUpdateReport {
  readonly indexId: string;
  readonly generation: number;
  readonly documents: number;
  readonly embedded: boolean;
}

type LoadedManifest = {
  readonly path: string;
  readonly manifest: SourceManifest;
};

export async function updateIndex(
  config: MachineConfig,
  indexId: string,
  options: { readonly embed?: boolean } = {},
): Promise<IndexUpdateReport> {
  const index = config.indexes.find((entry) => entry.id === indexId);
  if (index === undefined) {
    throw new Error(`Unknown index ${indexId}`);
  }

  const previous = await loadCatalogue(indexId);
  const generation = (previous?.generation ?? 0) + 1;
  const documents: Array<KnowledgeDocument & { readonly gitCommit?: string }> =
    [];
  const manifests = new Map<string, LoadedManifest>();
  const sourceCommits: Record<string, CatalogueSource> = {};

  for (const sourceId of index.sources) {
    const source = config.sources.find((entry) => entry.id === sourceId);
    if (source === undefined) {
      continue;
    }
    const commit = (await gitIsRepo(source.path))
      ? await gitHead(source.path)
      : undefined;
    sourceCommits[sourceId] = { gitCommit: commit };
    const manifestResult = await loadSourceManifest(source.path);
    if (manifestResult.isErr()) {
      continue;
    }
    manifests.set(sourceId, {
      path: source.path,
      manifest: manifestResult.value,
    });
    const scanned = await scanSourceDocuments(source.path, manifestResult.value);
    if (scanned.isErr()) {
      throw new Error(scanned.error.message);
    }
    for (const document of scanned.value) {
      documents.push({ ...document, gitCommit: commit });
    }
  }

  const catalogue = buildCatalogue(indexId, generation, documents, sourceCommits);
  await saveCatalogue(indexId, catalogue);

  const collections = collectionsForIndex(config, indexId, manifests);
  const storeResult = await openIndexStore(indexId, collections);
  if (storeResult.isOk()) {
    await storeResult.value.update();
    if (options.embed === true) {
      await storeResult.value.embed();
    }
    await storeResult.value.close();
  }

  return {
    indexId,
    generation,
    documents: documents.length,
    embedded: options.embed === true,
  };
}

export async function currentCatalogue(
  indexId: string,
): Promise<Catalogue | undefined> {
  return loadCatalogue(indexId);
}
