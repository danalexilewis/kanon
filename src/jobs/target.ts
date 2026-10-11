import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

import { err, ok, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import { resolveContainedPath } from '../config/paths.js';
import type { SourceManifest } from '../config/schemas.js';
import { invalidConfig } from '../errors.js';

function normalizeRel(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function isUnderRoot(target: string, root: string): boolean {
  const normalizedRoot = normalizeRel(root);
  if (normalizedRoot === '' || normalizedRoot === '.') {
    return true;
  }
  return target === normalizedRoot || target.startsWith(`${normalizedRoot}/`);
}

/**
 * Resolve an ingest target inside a checkout. It must sit under a declared
 * `kanon.yml` root, stay inside the repository, and no existing segment may be
 * a symlink, so ingest never writes through a link.
 */
export async function resolveIngestTarget(
  repoRoot: string,
  manifest: SourceManifest,
  target: string,
): Promise<Result<string, RailError<'invalid_config'>>> {
  const normalized = normalizeRel(target);
  if (!manifest.roots.some((root) => isUnderRoot(normalized, root.path))) {
    return err(invalidConfig(`Ingest target ${normalized} is not inside a kanon.yml root`));
  }
  const contained = await resolveContainedPath(repoRoot, normalized);
  if (contained.isErr()) {
    return err(contained.error);
  }
  let current = repoRoot;
  for (const segment of normalized.split('/')) {
    current = join(current, segment);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) {
        return err(invalidConfig(`Ingest target ${normalized} passes through a symlink`));
      }
    } catch {
      break;
    }
  }
  return ok(join(repoRoot, normalized));
}
