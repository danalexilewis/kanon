#!/usr/bin/env node
import { dispatchCli } from './commands.js';
import { parseArgv } from './parse.js';

async function main(): Promise<void> {
  await dispatchCli(parseArgv(process.argv.slice(2)));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
