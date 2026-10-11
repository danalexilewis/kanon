import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { runGit } from '../src/sources/git.js';
import { testRoot } from './setup.js';

/** Run git with the sandboxed test identity; throw on failure. */
export async function git(repo: string, args: readonly string[]): Promise<string> {
  const result = await runGit(repo, args, { credentials: true });
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

export async function writeFiles(
  root: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, 'utf8');
  }
}

export async function commitFiles(
  repo: string,
  files: Readonly<Record<string, string>>,
  message: string,
): Promise<string> {
  await writeFiles(repo, files);
  await git(repo, ['add', '-A']);
  await git(repo, ['commit', '-m', message]);
  return git(repo, ['rev-parse', 'HEAD']);
}

export function sourceManifest(id: string, roots: readonly string[] = ['docs']): string {
  const rootLines = roots
    .map((root) => `  - path: ${root}\n    pattern: "**/*.md"`)
    .join('\n');
  return `schema: kanon/source/v1\nid: ${id}\nname: Test source\nroots:\n${rootLines}\n`;
}

export interface SourceRemote {
  readonly bare: string;
  readonly url: string;
  readonly clone: string;
}

/** A bare remote seeded with `kanon.yml` + files, and an operator clone of it. */
export async function createSourceRemote(
  name: string,
  sourceId: string,
  files: Readonly<Record<string, string>> = { 'docs/readme.md': '# Readme\n' },
): Promise<SourceRemote> {
  const seed = join(testRoot, `${name}-seed`);
  const bare = join(testRoot, `${name}.git`);
  const clone = join(testRoot, `${name}-clone`);
  await mkdir(seed, { recursive: true });
  await git(seed, ['init', '-b', 'main']);
  await commitFiles(seed, { 'kanon.yml': sourceManifest(sourceId), ...files }, 'seed');
  await mkdir(bare, { recursive: true });
  await git(bare, ['init', '--bare', '-b', 'main']);
  const url = `file://${bare}`;
  await git(seed, ['push', url, 'main:refs/heads/main']);
  await git(testRoot, ['clone', url, clone]);
  return { bare, url, clone };
}

/** Clone the remote again as a second working copy (another person or device). */
export async function cloneRemote(remote: SourceRemote, name: string): Promise<string> {
  const path = join(testRoot, name);
  await git(testRoot, ['clone', remote.url, path]);
  return path;
}

export async function remoteHead(remote: SourceRemote): Promise<string> {
  return git(remote.bare, ['rev-parse', 'refs/heads/main']);
}
