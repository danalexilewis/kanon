import { lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export type LocalRemote = { readonly kind: 'local'; readonly path: string } | { readonly kind: 'other' };

/** Parse a `file://` URL or an absolute filesystem path. */
export function parseLocalRemote(remote: string): LocalRemote {
  if (remote.startsWith('file://')) {
    try {
      return { kind: 'local', path: fileURLToPath(remote) };
    } catch {
      return { kind: 'other' };
    }
  }
  if (remote.startsWith('/')) {
    return { kind: 'local', path: remote };
  }
  return { kind: 'other' };
}

export interface PathAudience {
  readonly ok: boolean;
  readonly tooWide: boolean;
  readonly unverified: boolean;
}

/** Owner-only: current uid, no group or other bits. */
export async function checkOwnerOnly(path: string, uid = process.getuid?.()): Promise<PathAudience> {
  if (uid === undefined) {
    return { ok: false, tooWide: false, unverified: true };
  }
  try {
    const stats = await lstat(path);
    if (stats.uid !== uid) {
      return { ok: false, tooWide: true, unverified: false };
    }
    if ((stats.mode & 0o077) !== 0) {
      return { ok: false, tooWide: true, unverified: false };
    }
    return { ok: true, tooWide: false, unverified: false };
  } catch {
    return { ok: false, tooWide: false, unverified: true };
  }
}
