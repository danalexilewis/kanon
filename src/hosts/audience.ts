import { err, ok, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import type { MachineCircle, MachineSource } from '../config/schemas.js';
import { audienceTooWide, audienceUnverified } from '../errors.js';
import { checkOwnerOnly, parseLocalRemote } from './local.js';

export type HostKind = 'local' | 'unverified';

export interface AudienceReaders {
  readonly readers: readonly string[];
}

export type AudienceError = RailError<'audience_too_wide' | 'audience_unverified'>;

export type HostAudience = (
  circle: MachineCircle,
  source: MachineSource,
) => Promise<Result<AudienceReaders, AudienceError>>;

export function hostFor(remote: string | undefined): HostKind {
  if (remote === undefined) {
    return 'unverified';
  }
  return parseLocalRemote(remote).kind === 'local' ? 'local' : 'unverified';
}

/**
 * Local remotes must be owner-only on the bare repo and the checkout.
 * Every other remote is unverified until a host probe exists.
 */
export async function checkAudience(
  circle: MachineCircle,
  source: MachineSource,
): Promise<Result<AudienceReaders, AudienceError>> {
  if (hostFor(source.remote) !== 'local') {
    return err(audienceUnverified(`Circle ${circle.id}: hosted remotes are unverified`));
  }
  const parsed = parseLocalRemote(source.remote ?? '');
  if (parsed.kind !== 'local') {
    return err(audienceUnverified(`Circle ${circle.id}: remote is unverified`));
  }
  const bare = await checkOwnerOnly(parsed.path);
  const checkout = await checkOwnerOnly(source.path);
  if (bare.unverified || checkout.unverified) {
    return err(audienceUnverified(`Circle ${circle.id}: could not stat the local repo`));
  }
  if (bare.tooWide || checkout.tooWide) {
    return err(audienceTooWide(`Circle ${circle.id}: local repo is readable by group or other`));
  }
  return ok({ readers: ['operator'] });
}
