import { chmod, mkdir } from 'node:fs/promises';

/** Create `path` (and parents) and set mode 0700 on that directory. */
export async function ensureOwnerOnlyDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}
