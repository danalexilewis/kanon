export interface ParsedCli {
  readonly command: string;
  readonly rest: readonly string[];
  readonly flags: Record<string, string | boolean>;
}

export function parseArgv(argv: readonly string[]): ParsedCli {
  const rest: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let index = 0;
  const command = argv[0] ?? 'help';
  index = 1;
  while (index < argv.length) {
    const token = argv[index] ?? '';
    if (token.startsWith('--')) {
      const name = token.slice(2);
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[name] = next;
        index += 2;
        continue;
      }
      flags[name] = true;
      index += 1;
      continue;
    }
    rest.push(token);
    index += 1;
  }
  return { command, rest, flags };
}

export function flagString(
  flags: Record<string, string | boolean>,
  name: string,
): string | undefined {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}

export function flagBool(
  flags: Record<string, string | boolean>,
  name: string,
): boolean {
  return flags[name] === true || flags[name] === 'true';
}
