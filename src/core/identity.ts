import { createHash } from 'node:crypto';

export function pathIdentity(relativePath: string): string {
  return relativePath.split('\\').join('/');
}

export function unstableDocId(sourceId: string, relativePath: string): string {
  const digest = createHash('sha256')
    .update(`${sourceId}:${pathIdentity(relativePath)}`)
    .digest('hex')
    .slice(0, 32);
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join('-');
}
