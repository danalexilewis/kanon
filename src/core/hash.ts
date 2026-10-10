import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export function sha256Bytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function sha256File(path: string): Promise<string> {
  const bytes = await readFile(path);
  return sha256Bytes(bytes);
}
