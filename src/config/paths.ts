import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

import { err, ok, type Result } from 'neverthrow';

import { invalidConfig } from '../errors.js';
import type { RailError } from '@eddy-works/never-rest';

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/** Resolve a repo-relative root and reject escapes and absolute paths. */
export async function resolveContainedPath(
  repoRoot: string,
  declared: string,
): Promise<Result<string, RailError<'invalid_config'>>> {
  if (isAbsolute(declared) || declared.split(/[\\/]/).includes('..')) {
    return err(invalidConfig('Root path must stay inside the source repository'));
  }

  const absoluteRepo = resolve(repoRoot);
  const joined = normalize(join(absoluteRepo, declared));
  if (!isInside(absoluteRepo, joined)) {
    return err(invalidConfig('Root path must stay inside the source repository'));
  }

  try {
    const stats = await lstat(joined);
    const resolved = stats.isSymbolicLink() ? await realpath(joined) : joined;
    if (!isInside(absoluteRepo, resolved)) {
      return err(invalidConfig('Root path must stay inside the source repository'));
    }
    return ok(resolved);
  } catch {
    return ok(joined);
  }
}
