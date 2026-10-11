import { readFile, rm } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { dispatchCli } from '../src/cli/commands.js';
import {
  deviceNameFromHostname,
  initDevice,
  loadDevice,
  renameDevice,
} from '../src/config/device.js';
import { devicePath } from '../src/env.js';

describe('device identity', () => {
  it('derives a slug from a hostname', () => {
    expect(deviceNameFromHostname('Dans-MacBook-Pro.local')).toBe('dans-macbook-pro');
    expect(deviceNameFromHostname('***')).toBe('device');
  });

  it('is created once and survives repeated init calls', async () => {
    await rm(devicePath(), { force: true });
    await dispatchCli({ command: 'init', rest: [], flags: {} });
    const first = (await loadDevice())._unsafeUnwrap();
    const text = await readFile(devicePath(), 'utf8');

    await dispatchCli({ command: 'init', rest: [], flags: {} });
    const second = (await initDevice())._unsafeUnwrap();
    expect(second).toEqual(first);
    expect(await readFile(devicePath(), 'utf8')).toBe(text);
  });

  it('renames with a validated slug and keeps the id', async () => {
    const before = (await initDevice())._unsafeUnwrap();
    const renamed = (await renameDevice('work-laptop'))._unsafeUnwrap();
    expect(renamed.id).toBe(before.id);
    expect(renamed.name).toBe('work-laptop');
    expect((await renameDevice('Not Valid')).isErr()).toBe(true);
    expect((await loadDevice())._unsafeUnwrap().name).toBe('work-laptop');
  });
});
