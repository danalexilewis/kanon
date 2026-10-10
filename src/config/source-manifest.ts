import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { err, ok, type Result } from 'neverthrow';
import { parse as parseYaml } from 'yaml';

import { invalidConfig } from '../errors.js';
import type { RailError } from '@eddy-works/never-rest';
import { resolveContainedPath } from './paths.js';
import {
  sourceManifestSchema,
  type SourceManifest,
  type SourceRoot,
} from './schemas.js';

export function parseSourceManifest(
  value: unknown,
): Result<SourceManifest, RailError<'invalid_config'>> {
  const parsed = sourceManifestSchema.safeParse(value);
  if (!parsed.success) {
    return err(invalidConfig(parsed.error.issues[0]?.message ?? 'Invalid kanon.yml'));
  }
  return ok(parsed.data);
}

export async function loadSourceManifest(
  repoRoot: string,
): Promise<Result<SourceManifest, RailError<'invalid_config'>>> {
  let text: string;
  try {
    text = await readFile(join(repoRoot, 'kanon.yml'), 'utf8');
  } catch {
    return err(invalidConfig('kanon.yml is missing'));
  }
  return parseSourceManifest(parseYaml(text));
}

export async function assertRootsContained(
  repoRoot: string,
  roots: readonly SourceRoot[],
): Promise<Result<void, RailError<'invalid_config'>>> {
  for (const root of roots) {
    const resolved = await resolveContainedPath(repoRoot, root.path);
    if (resolved.isErr()) {
      return err(resolved.error);
    }
  }
  return ok(undefined);
}
