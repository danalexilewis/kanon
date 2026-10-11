import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { reviewLedgerPath } from '../env.js';
import { documentState, reduceLedger, type LedgerState, type ReviewEntry } from './ledger.js';

export async function loadLedger(jobId: string): Promise<{ readonly state: LedgerState; readonly errors: readonly string[] }> {
  let raw: string;
  try {
    raw = await readFile(reviewLedgerPath(jobId), 'utf8');
  } catch {
    return { state: {}, errors: [] };
  }
  return reduceLedger(raw.split('\n'));
}

export async function appendLedger(jobId: string, entry: ReviewEntry): Promise<void> {
  const path = reviewLedgerPath(jobId);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', flag: 'a', mode: 0o600 });
  await chmod(path, 0o600);
}

export { documentState };
