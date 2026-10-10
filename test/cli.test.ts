import { describe, expect, it } from 'vitest';

import { parseArgv } from '../src/cli/parse.js';
import { dispatchCli } from '../src/cli/commands.js';
import { loadMachineConfig } from '../src/config/machine.js';

describe('CLI', () => {
  it('parses flags and rest tokens', () => {
    const parsed = parseArgv(['search', 'release', 'process', '--index', 'team', '--mode', 'lexical']);
    expect(parsed.command).toBe('search');
    expect(parsed.rest).toEqual(['release', 'process']);
    expect(parsed.flags.index).toBe('team');
  });

  it('init writes a machine config', async () => {
    await dispatchCli({ command: 'init', rest: [], flags: {} });
    const config = await loadMachineConfig();
    expect(config.isOk()).toBe(true);
    expect(config._unsafeUnwrap().schema).toBe('kanon/machine/v1');
  });
});
