import { err, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import { sourceBranch, type MachineSource } from '../config/schemas.js';
import { writeDenied } from '../errors.js';
import { gitIsRepo, gitLsRemote, gitProbeWrite } from './git.js';
import { remoteUrl } from './sync.js';

export interface AccessProbe {
  readonly sourceId: string;
  readonly read: boolean;
  readonly write: boolean;
  readonly remoteHead?: string;
  readonly detail?: string;
}

/** Probe push access for a managed source against its configured remote. */
export async function probeSourceWrite(
  source: MachineSource,
): Promise<Result<void, RailError<'write_denied'>>> {
  if (source.kind !== 'managed') {
    return err(writeDenied('Local sources are never pushed'));
  }
  if (!(await gitIsRepo(source.path))) {
    return err(writeDenied('Source path is not a git repository'));
  }
  return gitProbeWrite(source.path, remoteUrl(source), sourceBranch(source));
}

/** Report whether the operator's credentials can read and write the remote. */
export async function probeSourceAccess(source: MachineSource): Promise<AccessProbe> {
  if (source.kind !== 'managed') {
    return {
      sourceId: source.id,
      read: false,
      write: false,
      detail: 'Local sources have no remote',
    };
  }
  if (!(await gitIsRepo(source.path))) {
    return {
      sourceId: source.id,
      read: false,
      write: false,
      detail: 'Source path is not a git repository',
    };
  }
  const head = await gitLsRemote(source.path, remoteUrl(source), sourceBranch(source));
  if (head.isErr()) {
    return { sourceId: source.id, read: false, write: false, detail: head.error.message };
  }
  const write = await probeSourceWrite(source);
  return {
    sourceId: source.id,
    read: true,
    write: write.isOk(),
    remoteHead: head.value,
    ...(write.isErr() ? { detail: write.error.message } : {}),
  };
}
