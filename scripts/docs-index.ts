import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStore } from '@tobilu/qmd';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dbPath = resolve(repoRoot, '.qmd/docs.sqlite');
const configPath = resolve(repoRoot, 'qmd.docs.yml');

async function openDocsStore() {
  await mkdir(dirname(dbPath), { recursive: true });
  return createStore({ dbPath, configPath });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const store = await openDocsStore();
  if (argv[0] === '--update') {
    const result = await store.update();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    await store.close();
    return;
  }
  if (argv[0] === '--search') {
    const hybrid = argv.includes('--hybrid');
    const query = argv.filter((token) => token !== '--search' && token !== '--hybrid').join(' ');
    const results = hybrid
      ? await store.search({ query, limit: 8, rerank: false })
      : await store.searchLex(query, { limit: 8 });
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    await store.close();
    return;
  }
  if (argv[0] === '--get') {
    const file = argv[1];
    if (file === undefined) {
      throw new Error('docs:get <path-or-docid>');
    }
    const doc = await store.get(file, { includeBody: true });
    process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
    await store.close();
    return;
  }
  await store.close();
  throw new Error('Usage: docs-index --update | --search <q> | --get <file>');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
