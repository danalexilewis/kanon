import { writeCredentials } from '../connectors/credentials.js';
import { credentialsExist } from '../connectors/credentials.js';
import { saveMachineConfig } from '../config/machine.js';
import type { MachineScorer } from '../config/schemas.js';
import { flagString, type ParsedCli } from './parse.js';
import { printJson, requireConfig, validatedConfig } from './shared.js';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function cmdScorerAdd(cli: ParsedCli): Promise<void> {
  const id = cli.rest[0];
  const kind = flagString(cli.flags, 'kind');
  const endpoint = flagString(cli.flags, 'endpoint');
  const model = flagString(cli.flags, 'model');
  if (id === undefined || kind !== 'openai-compatible' || endpoint === undefined || model === undefined) {
    throw new Error('scorer add <id> --kind openai-compatible --endpoint <url> --model <name> --api-key-stdin');
  }
  const apiKey = await readStdin();
  if (apiKey.length === 0) {
    throw new Error('Provide the API key on stdin');
  }
  const config = await requireConfig();
  const scorer: MachineScorer = { id, kind: 'openai-compatible', endpoint, model };
  const next = validatedConfig({
    ...config,
    scorers: [...(config.scorers ?? []).filter((entry) => entry.id !== id), scorer],
  });
  await writeCredentials(id, { type: 'scorer', apiKey });
  await saveMachineConfig(next);
  printJson({ scorer: id, stored: true });
}

async function cmdScorerList(): Promise<void> {
  const config = await requireConfig();
  const rows = [];
  for (const scorer of config.scorers ?? []) {
    rows.push({
      id: scorer.id,
      kind: scorer.kind,
      endpoint: scorer.endpoint,
      model: scorer.model,
      credentials: (await credentialsExist(scorer.id)) ? 'ready' : 'missing',
    });
  }
  printJson(rows);
}

export async function dispatchScorerCli(cli: ParsedCli): Promise<boolean> {
  if (cli.command !== 'scorer') {
    return false;
  }
  const sub = cli.rest[0];
  if (sub === 'add') {
    await cmdScorerAdd({ ...cli, rest: cli.rest.slice(1) });
    return true;
  }
  if (sub === 'list' || sub === undefined) {
    await cmdScorerList();
    return true;
  }
  throw new Error('scorer add|list');
}
