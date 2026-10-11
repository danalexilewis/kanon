import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  installSchedule,
  launchdPlist,
  LAUNCHD_LABEL,
  scheduleStatus,
  systemdUnits,
  uninstallSchedule,
  type CommandRunner,
  type ScheduleDeps,
  type TickCommand,
} from '../src/jobs/os-schedule.js';
import { testRoot } from './setup.js';

const COMMAND: TickCommand = {
  program: '/opt/node/bin/node',
  args: ['--import', 'file:///x/loader.mjs', '/repo/src/cli/main.ts', 'tick'],
  env: { PATH: '/usr/bin:/bin', KANON_HOME: '/Users/me/.config/kanon & co' },
};

function recordingRunner(): { run: CommandRunner; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    run: async (program, args) => {
      calls.push([program, ...args]);
      return { code: 0, stdout: '', stderr: '' };
    },
  };
}

function deps(platform: NodeJS.Platform, name: string, run: CommandRunner): ScheduleDeps {
  return {
    platform,
    homeDir: join(testRoot, name),
    uid: 501,
    run,
    command: COMMAND,
    logPath: join(testRoot, name, 'tick.log'),
  };
}

describe('OS schedule', () => {
  it('generates an hourly LaunchAgent with escaped values', () => {
    const plist = launchdPlist(COMMAND, '/tmp/tick.log');
    expect(plist).toContain(`<string>${LAUNCHD_LABEL}</string>`);
    expect(plist).toContain('<key>StartInterval</key><integer>3600</integer>');
    expect(plist).toContain('<string>/repo/src/cli/main.ts</string>');
    expect(plist).toContain('<string>tick</string>');
    expect(plist).toContain('kanon &amp; co');
  });

  it('generates a persistent hourly systemd timer', () => {
    const units = systemdUnits(COMMAND, '/tmp/tick.log');
    expect(units.timer).toContain('OnCalendar=hourly');
    expect(units.timer).toContain('Persistent=true');
    expect(units.service).toContain('ExecStart="/opt/node/bin/node" "--import"');
    expect(units.service).toContain('Type=oneshot');
  });

  it('installs, reports and uninstalls on macOS through launchctl', async () => {
    const runner = recordingRunner();
    const macos = deps('darwin', 'home-mac', runner.run);
    const report = (await installSchedule(macos))._unsafeUnwrap();
    expect(report.activated).toBe(true);
    const plistPath = join(macos.homeDir, 'Library/LaunchAgents', `${LAUNCHD_LABEL}.plist`);
    expect(await readFile(plistPath, 'utf8')).toContain('<string>tick</string>');
    expect(runner.calls).toContainEqual(['launchctl', 'bootstrap', 'gui/501', plistPath]);

    const status = (await scheduleStatus(macos))._unsafeUnwrap();
    expect(status).toMatchObject({ installed: true, active: true });

    await uninstallSchedule(macos);
    expect((await scheduleStatus(macos))._unsafeUnwrap().installed).toBe(false);
  });

  it('installs a systemd user timer on Linux and dry-runs without writing', async () => {
    const runner = recordingRunner();
    const linux = deps('linux', 'home-linux', runner.run);
    const dry = (await installSchedule(linux, { dryRun: true }))._unsafeUnwrap();
    expect(dry.files.map((file) => file.path.split('/').pop())).toEqual([
      'kanon-tick.service',
      'kanon-tick.timer',
    ]);
    expect(runner.calls).toEqual([]);

    await installSchedule(linux);
    expect(runner.calls).toContainEqual(['systemctl', '--user', 'enable', '--now', 'kanon-tick.timer']);
  });

  it('refuses unsupported platforms', async () => {
    const result = await installSchedule(deps('win32', 'home-win', recordingRunner().run));
    expect(result._unsafeUnwrapErr().code).toBe('invalid_config');
  });
});
