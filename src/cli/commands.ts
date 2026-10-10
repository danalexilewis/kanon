import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { randomUUID } from 'node:crypto';

import { loadAppContext } from '../app/handlers.js';
import {
  initMachineConfig,
  loadMachineConfig,
  saveMachineConfig,
} from '../config/machine.js';
import { emptyMachineConfig, type MachineConfig } from '../config/schemas.js';
import {
  assertRootsContained,
  loadSourceManifest,
  parseSourceManifest,
} from '../config/source-manifest.js';
import { configPath } from '../env.js';
import { OPERATOR } from '../core/principal.js';
import { updateIndex } from '../retrieval/index-job.js';
import { syncSources } from '../sources/sync.js';
import { knowledgeClient } from './client.js';
import { flagBool, flagString, type ParsedCli } from './parse.js';

const SOURCE_TEMPLATE = `schema: kanon/source/v1
id: ${'SOURCE_ID'}
name: ${'SOURCE_NAME'}
roots:
  - path: docs
    pattern: "**/*.md"
exclude:
  - history/**
`;

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function requireConfig(): Promise<MachineConfig> {
  const loaded = await loadMachineConfig();
  if (loaded.isErr()) {
    throw new Error(loaded.error.message);
  }
  return loaded.value;
}

async function cmdInit(): Promise<void> {
  const config = await initMachineConfig();
  printJson({ home: configPath(), sources: config.sources.length });
}

async function cmdSourceInit(cli: ParsedCli): Promise<void> {
  const dir = resolve(cli.rest[0] ?? '.');
  const id = randomUUID();
  const name = flagString(cli.flags, 'name') ?? 'Knowledge source';
  await mkdir(resolve(dir, 'docs'), { recursive: true });
  await writeFile(
    resolve(dir, 'kanon.yml'),
    SOURCE_TEMPLATE.replace('SOURCE_ID', id).replace('SOURCE_NAME', name),
    'utf8',
  );
  await writeFile(
    resolve(dir, 'docs/readme.md'),
    '# Notes\n\nWrite Markdown here.\n',
    'utf8',
  );
  printJson({ path: dir, id });
}

async function cmdSourceAdd(cli: ParsedCli): Promise<void> {
  const path = resolve(flagString(cli.flags, 'path') ?? '');
  const kind = flagString(cli.flags, 'kind') ?? 'local';
  if (kind !== 'local' && kind !== 'managed') {
    throw new Error('kind must be local or managed');
  }
  const manifest = await loadSourceManifest(path);
  if (manifest.isErr()) {
    throw new Error(manifest.error.message);
  }
  const contained = await assertRootsContained(path, manifest.value.roots);
  if (contained.isErr()) {
    throw new Error(contained.error.message);
  }
  const config = await requireConfig();
  if (config.sources.some((source) => source.id === manifest.value.id)) {
    throw new Error('Source id is already registered');
  }
  config.sources.push({
    id: manifest.value.id,
    kind,
    path,
    remote: flagString(cli.flags, 'remote'),
    branch: flagString(cli.flags, 'branch'),
  });
  await saveMachineConfig(config);
  printJson({ id: manifest.value.id, kind, path });
}

async function cmdSourceList(): Promise<void> {
  const config = await requireConfig();
  printJson(config.sources);
}

async function cmdSourceRemove(cli: ParsedCli): Promise<void> {
  const id = cli.rest[0];
  if (id === undefined) {
    throw new Error('source remove requires an id');
  }
  const config = await requireConfig();
  const next: MachineConfig = {
    ...config,
    sources: config.sources.filter((source) => source.id !== id),
    indexes: config.indexes.map((index) => ({
      ...index,
      sources: index.sources.filter((sourceId) => sourceId !== id),
    })),
  };
  await saveMachineConfig(next);
  printJson({ removed: id });
}

async function cmdIndexCreate(cli: ParsedCli): Promise<void> {
  const id = cli.rest[0];
  const sourceId = flagString(cli.flags, 'source');
  if (id === undefined || sourceId === undefined) {
    throw new Error('index create <id> --source <uuid>');
  }
  const config = await requireConfig();
  if (config.indexes.some((index) => index.id === id)) {
    throw new Error('Index id already exists');
  }
  config.indexes.push({ id, sources: [sourceId] });
  await saveMachineConfig(config);
  printJson({ id, sources: [sourceId] });
}

async function cmdIndexList(): Promise<void> {
  printJson((await requireConfig()).indexes);
}

async function cmdIndexUpdate(cli: ParsedCli): Promise<void> {
  const config = await requireConfig();
  const ids = cli.rest[0] === undefined ? config.indexes.map((index) => index.id) : [cli.rest[0]];
  const reports = [];
  for (const id of ids) {
    reports.push(await updateIndex(config, id, { embed: flagBool(cli.flags, 'embed') }));
  }
  printJson(reports);
}

async function cmdProjectAdd(cli: ParsedCli): Promise<void> {
  const id = cli.rest[0];
  const root = resolve(flagString(cli.flags, 'root') ?? '.');
  if (id === undefined) {
    throw new Error('project add <id> --root <path>');
  }
  const config = await requireConfig();
  config.projects.push({ id, root });
  await saveMachineConfig(config);
  printJson({ id, root });
}

async function cmdGrant(cli: ParsedCli): Promise<void> {
  const project = cli.rest[0];
  const index = flagString(cli.flags, 'index');
  if (project === undefined || index === undefined) {
    throw new Error('grant <project> --index <id>');
  }
  const config = await requireConfig();
  const existing = config.grants.find((grant) => grant.project === project);
  if (existing === undefined) {
    config.grants.push({ project, indexes: [index] });
  } else if (!existing.indexes.includes(index)) {
    existing.indexes.push(index);
  }
  await saveMachineConfig(config);
  printJson({ project, indexes: config.grants.find((grant) => grant.project === project)?.indexes });
}

async function cmdRevoke(cli: ParsedCli): Promise<void> {
  const project = cli.rest[0];
  const index = flagString(cli.flags, 'index');
  if (project === undefined || index === undefined) {
    throw new Error('revoke <project> --index <id>');
  }
  const config = await requireConfig();
  const existing = config.grants.find((grant) => grant.project === project);
  if (existing !== undefined) {
    existing.indexes = existing.indexes.filter((id) => id !== index);
  }
  await saveMachineConfig(config);
  printJson({ project, revoked: index });
}

async function cmdDoctor(): Promise<void> {
  const config = await loadMachineConfig();
  if (config.isErr()) {
    printJson({ ok: false, error: config.error.message });
    return;
  }
  const issues: string[] = [];
  for (const source of config.value.sources) {
    const manifest = await loadSourceManifest(source.path);
    if (manifest.isErr()) {
      issues.push(`${source.id}: ${manifest.error.message}`);
      continue;
    }
    const contained = await assertRootsContained(source.path, manifest.value.roots);
    if (contained.isErr()) {
      issues.push(`${source.id}: ${contained.error.message}`);
    }
  }
  printJson({ ok: issues.length === 0, issues });
}

async function cmdSync(): Promise<void> {
  const config = await requireConfig();
  printJson(await syncSources(config.sources));
}

async function cmdSearch(cli: ParsedCli): Promise<void> {
  const query = cli.rest.join(' ');
  const index = flagString(cli.flags, 'index');
  if (query.length === 0 || index === undefined) {
    throw new Error('search <query> --index <id>');
  }
  const context = await loadAppContext(OPERATOR);
  const client = knowledgeClient(context);
  const result = await client.search({
    query: {
      query,
      index,
      mode: (flagString(cli.flags, 'mode') ?? 'lexical') as
        | 'lexical'
        | 'semantic'
        | 'hybrid',
      limit: Number(flagString(cli.flags, 'limit') ?? 10),
    },
  });
  if (result.isErr()) {
    printJson(result.error);
    process.exitCode = 1;
    return;
  }
  printJson(result.value);
}

async function cmdGet(cli: ParsedCli): Promise<void> {
  const uri = cli.rest[0];
  const index = flagString(cli.flags, 'index');
  if (uri === undefined || index === undefined) {
    throw new Error('get <uri> --index <id>');
  }
  const context = await loadAppContext(OPERATOR);
  const client = knowledgeClient(context);
  const result = await client.get({ query: { uri, index } });
  if (result.isErr()) {
    printJson(result.error);
    process.exitCode = 1;
    return;
  }
  printJson(result.value);
}

async function cmdStatus(): Promise<void> {
  const context = await loadAppContext(OPERATOR);
  const result = await knowledgeClient(context).status({});
  printJson(result.isOk() ? result.value : result.error);
}

export async function dispatchCli(cli: ParsedCli): Promise<void> {
  if (cli.command === 'init') {
    return cmdInit();
  }
  if (cli.command === 'source' && cli.rest[0] === 'init') {
    return cmdSourceInit({ ...cli, rest: cli.rest.slice(1) });
  }
  if (cli.command === 'source' && cli.rest[0] === 'add') {
    return cmdSourceAdd({ ...cli, rest: cli.rest.slice(1) });
  }
  if (cli.command === 'source' && cli.rest[0] === 'list') {
    return cmdSourceList();
  }
  if (cli.command === 'source' && cli.rest[0] === 'remove') {
    return cmdSourceRemove({ ...cli, rest: cli.rest.slice(1) });
  }
  if (cli.command === 'index' && cli.rest[0] === 'create') {
    return cmdIndexCreate({ ...cli, rest: cli.rest.slice(1) });
  }
  if (cli.command === 'index' && cli.rest[0] === 'list') {
    return cmdIndexList();
  }
  if (cli.command === 'index' && cli.rest[0] === 'update') {
    return cmdIndexUpdate({ ...cli, rest: cli.rest.slice(1) });
  }
  if (cli.command === 'project' && cli.rest[0] === 'add') {
    return cmdProjectAdd({ ...cli, rest: cli.rest.slice(1) });
  }
  if (cli.command === 'grant') {
    return cmdGrant(cli);
  }
  if (cli.command === 'revoke') {
    return cmdRevoke(cli);
  }
  if (cli.command === 'doctor') {
    return cmdDoctor();
  }
  if (cli.command === 'sync') {
    return cmdSync();
  }
  if (cli.command === 'search') {
    return cmdSearch(cli);
  }
  if (cli.command === 'get') {
    return cmdGet(cli);
  }
  if (cli.command === 'status') {
    return cmdStatus();
  }
  if (cli.command === 'mcp-config') {
    const project = cli.rest[0];
    if (project === undefined) {
      throw new Error('mcp-config <project>');
    }
    printJson({
      mcpServers: {
        kanon: {
          command: 'pnpm',
          args: ['kanon', 'mcp', '--project', project],
        },
      },
    });
    return;
  }
  if (cli.command === 'mcp') {
    const { startMcpServer } = await import('../mcp/serve.js');
    const project = flagString(cli.flags, 'project');
    if (project === undefined) {
      throw new Error('mcp --project <id>');
    }
    await startMcpServer(project);
    return;
  }
  process.stdout.write(`kanon ${cli.command}: unknown command\n`);
  process.exitCode = 1;
}

export { emptyMachineConfig, parseSourceManifest };
