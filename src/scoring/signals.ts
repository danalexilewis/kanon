import { createHash } from 'node:crypto';

import type { Readers, SensitivityLevel } from '../circles/types.js';

export type SignalName = 'one_to_one' | 'external_reader' | 'money' | 'legal' | 'people' | 'health';

export interface SignalHit {
  readonly name: SignalName;
  readonly level: SensitivityLevel;
  readonly terms: readonly string[];
  readonly count: number;
}

export interface SignalScore {
  readonly level: SensitivityLevel;
  readonly hits: readonly SignalHit[];
}

const CATEGORIES: ReadonlyArray<{
  readonly name: Extract<SignalName, 'money' | 'legal' | 'people' | 'health'>;
  readonly level: SensitivityLevel;
  readonly terms: readonly string[];
}> = [
  {
    name: 'money',
    level: 1,
    terms: ['pricing', 'invoice', 'fundraising', 'valuation', 'equity', 'salary', 'budget', 'revenue', 'profit'],
  },
  {
    name: 'legal',
    level: 2,
    terms: ['lawsuit', 'litigation', 'nda', 'liability', 'counsel', 'settlement', 'subpoena'],
  },
  {
    name: 'people',
    level: 2,
    terms: ['performance', 'resignation', 'redundancy', 'restructuring', 'conflict', 'firing', 'severance'],
  },
  {
    name: 'health',
    level: 3,
    terms: ['health', 'medical', 'illness', 'grievance', 'discipline', 'diagnosis'],
  },
];

function countTerms(text: string, terms: readonly string[]): { readonly terms: readonly string[]; readonly count: number } {
  const haystack = text.toLowerCase();
  const matched: string[] = [];
  let count = 0;
  for (const term of terms) {
    const re = new RegExp(`\\b${term}\\b`, 'g');
    const hits = haystack.match(re)?.length ?? 0;
    if (hits > 0) {
      matched.push(term);
      count += hits;
    }
  }
  return { terms: matched, count };
}

/**
 * Deterministic local signals. Evidence is term names and counts, never
 * excerpts.
 */
export function scoreSignals(input: {
  readonly title: string;
  readonly body: string;
  readonly readers: Readers;
  readonly operatorId: string;
}): SignalScore {
  const hits: SignalHit[] = [];
  const otherReaders = input.readers.people.filter((id) => id !== input.operatorId);
  if (otherReaders.length === 1 && input.readers.others === 0 && input.readers.external === 0) {
    hits.push({ name: 'one_to_one', level: 2, terms: [], count: 1 });
  }
  if (input.readers.external > 0) {
    hits.push({ name: 'external_reader', level: 1, terms: [], count: input.readers.external });
  }

  const title = input.title;
  const body = input.body;
  for (const category of CATEGORIES) {
    const inTitle = countTerms(title, category.terms);
    const inBody = countTerms(body, category.terms);
    const titleHit = inTitle.count >= 1;
    const bodyHit = inBody.count >= 2;
    if (!titleHit && !bodyHit) {
      continue;
    }
    const terms = [...new Set([...inTitle.terms, ...inBody.terms])];
    hits.push({
      name: category.name,
      level: category.level,
      terms,
      count: inTitle.count + inBody.count,
    });
  }

  const level = hits.reduce<SensitivityLevel>((max, hit) => (hit.level > max ? hit.level : max), 0);
  return { level, hits };
}

/** Human final wins; otherwise the higher of signals and a model proposal. */
export function proposedLevel(input: {
  readonly signalLevel: SensitivityLevel;
  readonly modelLevel?: SensitivityLevel;
  readonly finalLevel?: SensitivityLevel;
}): SensitivityLevel {
  if (input.finalLevel !== undefined) {
    return input.finalLevel;
  }
  const model = input.modelLevel ?? 0;
  return input.signalLevel > model ? input.signalLevel : model;
}

/** SHA-256 of the exported Markdown body. Approvals attach to this hash. */
export function contentHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}
