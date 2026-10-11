import { spawn } from 'node:child_process';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { err, ok, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import { jobLogsDir } from '../env.js';
import { invalidConfig } from '../errors.js';

export const LAUNCHD_LABEL = 'works.eddy.kanon.tick';
export const SYSTEMD_UNIT = 'kanon-tick';
export const TICK_INTERVAL_SECONDS = 3600;

export interface TickCommand {
  readonly program: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type CommandRunner = (
  program: string,
  args: readonly string[],
) => Promise<CommandResult>;

export interface ScheduleDeps {
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
  readonly uid: number;
  readonly run: CommandRunner;
  readonly command: TickCommand;
  readonly logPath: string;
}

export interface ScheduleFile {
  readonly path: string;
  readonly content: string;
}

export interface ScheduleReport {
  readonly platform: NodeJS.Platform;
  readonly files: readonly ScheduleFile[];
  readonly activated: boolean;
  readonly detail?: string;
}

export interface ScheduleStatus {
  readonly platform: NodeJS.Platform;
  readonly installed: boolean;
  readonly active: boolean;
  readonly files: readonly string[];
}

const CARRIED_ENV = ['PATH', 'HOME', 'KANON_HOME', 'KANON_CACHE'] as const;

/**
 * The exact node binary, loader flags (e.g. tsx) and entry script of this
 * process, so the scheduled tick works from both `dist` and `pnpm kanon`.
 */
export function currentTickCommand(): TickCommand {
  const env: Record<string, string> = {};
  for (const name of CARRIED_ENV) {
    const value = process.env[name];
    if (value !== undefined && value.length > 0) {
      env[name] = value;
    }
  }
  return {
    program: process.execPath,
    args: [...process.execArgv, resolve(process.argv[1] ?? ''), 'tick'],
    env,
  };
}

export function defaultLogPath(): string {
  return join(jobLogsDir(), 'tick.log');
}

export function runCommand(program: string, args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(program, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => {
      resolvePromise({ code: 127, stdout: '', stderr: error.message });
    });
    child.on('close', (code) => {
      resolvePromise({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8').trim(),
        stderr: Buffer.concat(stderr).toString('utf8').trim(),
      });
    });
  });
}

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function launchdPlist(command: TickCommand, logPath: string): string {
  const args = [command.program, ...command.args]
    .map((arg) => `    <string>${xml(arg)}</string>`)
    .join('\n');
  const env = Object.entries(command.env)
    .map(([key, value]) => `    <key>${xml(key)}</key><string>${xml(value)}</string>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${env}
  </dict>
  <key>StartInterval</key><integer>${TICK_INTERVAL_SECONDS}</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>Nice</key><integer>10</integer>
  <key>StandardOutPath</key><string>${xml(logPath)}</string>
  <key>StandardErrorPath</key><string>${xml(logPath)}</string>
</dict>
</plist>
`;
}

function systemdQuote(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/%/g, '%%')
    .replace(/\$/g, '$$$$');
  return `"${escaped}"`;
}

export function systemdUnits(
  command: TickCommand,
  logPath: string,
): { readonly service: string; readonly timer: string } {
  const exec = [command.program, ...command.args].map(systemdQuote).join(' ');
  const env = Object.entries(command.env)
    .map(([key, value]) => `Environment=${systemdQuote(`${key}=${value}`)}`)
    .join('\n');
  return {
    service: `[Unit]
Description=Kanon scheduled jobs tick

[Service]
Type=oneshot
ExecStart=${exec}
${env}
Nice=10
StandardOutput=append:${logPath}
StandardError=append:${logPath}
`,
    timer: `[Unit]
Description=Run the Kanon tick hourly

[Timer]
OnCalendar=hourly
Persistent=true
RandomizedDelaySec=120

[Install]
WantedBy=timers.target
`,
  };
}

function launchdPath(deps: ScheduleDeps): string {
  return join(deps.homeDir, 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`);
}

function systemdDir(deps: ScheduleDeps): string {
  return join(deps.homeDir, '.config', 'systemd', 'user');
}

export function scheduleFiles(
  deps: ScheduleDeps,
): Result<readonly ScheduleFile[], RailError<'invalid_config'>> {
  if (deps.platform === 'darwin') {
    return ok([{ path: launchdPath(deps), content: launchdPlist(deps.command, deps.logPath) }]);
  }
  if (deps.platform === 'linux') {
    const units = systemdUnits(deps.command, deps.logPath);
    return ok([
      { path: join(systemdDir(deps), `${SYSTEMD_UNIT}.service`), content: units.service },
      { path: join(systemdDir(deps), `${SYSTEMD_UNIT}.timer`), content: units.timer },
    ]);
  }
  return err(invalidConfig(`Scheduling is not supported on ${deps.platform}; run kanon tick from your own scheduler`));
}

/** Write the OS scheduler entry and load it. Re-running replaces it. */
export async function installSchedule(
  deps: ScheduleDeps,
  options: { readonly dryRun?: boolean } = {},
): Promise<Result<ScheduleReport, RailError<'invalid_config'>>> {
  const files = scheduleFiles(deps);
  if (files.isErr()) {
    return err(files.error);
  }
  if (options.dryRun === true) {
    return ok({ platform: deps.platform, files: files.value, activated: false });
  }
  await mkdir(dirname(deps.logPath), { recursive: true });
  for (const file of files.value) {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.content, 'utf8');
  }

  let activation: CommandResult;
  if (deps.platform === 'darwin') {
    await deps.run('launchctl', ['bootout', `gui/${deps.uid}/${LAUNCHD_LABEL}`]);
    activation = await deps.run('launchctl', ['bootstrap', `gui/${deps.uid}`, launchdPath(deps)]);
  } else {
    await deps.run('systemctl', ['--user', 'daemon-reload']);
    activation = await deps.run('systemctl', ['--user', 'enable', '--now', `${SYSTEMD_UNIT}.timer`]);
  }
  return ok({
    platform: deps.platform,
    files: files.value,
    activated: activation.code === 0,
    ...(activation.code !== 0 ? { detail: activation.stderr || activation.stdout } : {}),
  });
}

export async function uninstallSchedule(
  deps: ScheduleDeps,
): Promise<Result<ScheduleStatus, RailError<'invalid_config'>>> {
  const files = scheduleFiles(deps);
  if (files.isErr()) {
    return err(files.error);
  }
  if (deps.platform === 'darwin') {
    await deps.run('launchctl', ['bootout', `gui/${deps.uid}/${LAUNCHD_LABEL}`]);
  } else {
    await deps.run('systemctl', ['--user', 'disable', '--now', `${SYSTEMD_UNIT}.timer`]);
  }
  for (const file of files.value) {
    await rm(file.path, { force: true });
  }
  if (deps.platform === 'linux') {
    await deps.run('systemctl', ['--user', 'daemon-reload']);
  }
  return ok({ platform: deps.platform, installed: false, active: false, files: [] });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function scheduleStatus(
  deps: ScheduleDeps,
): Promise<Result<ScheduleStatus, RailError<'invalid_config'>>> {
  const files = scheduleFiles(deps);
  if (files.isErr()) {
    return err(files.error);
  }
  const present: string[] = [];
  for (const file of files.value) {
    if (await exists(file.path)) {
      present.push(file.path);
    }
  }
  const check =
    deps.platform === 'darwin'
      ? await deps.run('launchctl', ['print', `gui/${deps.uid}/${LAUNCHD_LABEL}`])
      : await deps.run('systemctl', ['--user', 'is-active', `${SYSTEMD_UNIT}.timer`]);
  return ok({
    platform: deps.platform,
    installed: present.length === files.value.length,
    active: check.code === 0,
    files: present,
  });
}
