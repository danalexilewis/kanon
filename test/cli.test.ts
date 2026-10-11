import { describe, expect, it, vi } from 'vitest';

import { parseArgv } from '../src/cli/parse.js';
import { dispatchCli } from '../src/cli/commands.js';
import { loadMachineConfig } from '../src/config/machine.js';

describe('CLI', () => {
  it('prints usage when no command is given', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await dispatchCli(parseArgv([]));
    await dispatchCli(parseArgv(['--help']));
    const text = write.mock.calls.map((call) => String(call[0])).join('');
    expect(text).toContain('kanon <command>');
    expect(text).toContain('source init [dir]');
    expect(text).toContain('search <query> --index <id>');
    write.mockRestore();
  });

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
