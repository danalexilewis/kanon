import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { err, ok, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import { splitFrontmatter } from '../config/frontmatter.js';
import { resolveContainedPath } from '../config/paths.js';
import { documentDocSchema, type SourceManifest } from '../config/schemas.js';
import { invalidConfig } from '../errors.js';

/** A file under a job target that carries this connector's provenance URI. */
export interface OwnedFile {
  readonly uri: string;
  readonly revision: string | undefined;
  /** Relative to the job target. */
  readonly path: string;
  readonly content: string;
}

export interface TargetFiles {
  readonly owned: ReadonlyMap<string, OwnedFile>;
  /** Every existing file path under the target, owned or not. */
  readonly paths: ReadonlySet<string>;
}

export function toFs(root: string, relative: string): string {
  return relative === '' ? root : join(root, ...relative.split('/'));
}

/** Walk a job target. Any symlink fails the walk; ingest never writes through one. */
export async function readTargetFiles(
  targetAbs: string,
  scheme: string,
): Promise<Result<TargetFiles, RailError<'invalid_config'>>> {
  const owned = new Map<string, OwnedFile>();
  const paths = new Set<string>();

  async function walk(relative: string): Promise<Result<void, RailError<'invalid_config'>>> {
    let entries: string[];
    try {
      entries = await readdir(toFs(targetAbs, relative));
    } catch {
      return ok(undefined);
    }
    for (const name of entries.sort()) {
      const child = relative === '' ? name : `${relative}/${name}`;
      const stats = await lstat(toFs(targetAbs, child));
      if (stats.isSymbolicLink()) {
        return err(invalidConfig(`Ingest target contains a symlink: ${child}`));
      }
      if (stats.isDirectory()) {
        const nested = await walk(child);
        if (nested.isErr()) {
          return nested;
        }
        continue;
      }
      paths.add(child);
      if (!child.endsWith('.md')) {
        continue;
      }
      const content = await readFile(toFs(targetAbs, child), 'utf8');
      const data = splitFrontmatter(content).data as { doc?: unknown } | undefined;
      const doc = documentDocSchema.safeParse(data?.doc);
      const ref = doc.success
        ? doc.data.sources?.find((source) => source.uri.startsWith(`${scheme}://`))
        : undefined;
      if (ref !== undefined) {
        owned.set(ref.uri, { uri: ref.uri, revision: ref.revision, path: child, content });
      }
    }
    return ok(undefined);
  }

  const walked = await walk('');
  return walked.isErr() ? err(walked.error) : ok({ owned, paths });
}

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
