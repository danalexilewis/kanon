import { describe, expect, it } from 'vitest';

import { proposedLevel, scoreSignals } from '../src/scoring/signals.js';
import type { Readers } from '../src/circles/types.js';

const SOLO: Readers = {
  people: ['operator'],
  others: 0,
  external: 0,
  groupUnresolved: 0,
  sharing: 'full',
};

describe('scoreSignals', () => {
  it('raises a one-to-one note to level 2', () => {
    const score = scoreSignals({
      title: 'Catch up',
      body: 'Notes from a walk.\n',
      readers: { ...SOLO, people: ['operator', 'cofounder'] },
      operatorId: 'operator',
    });
    expect(score.level).toBe(2);
    expect(score.hits.map((hit) => hit.name)).toContain('one_to_one');
  });

  it('raises an external reader to level 1', () => {
    const score = scoreSignals({
      title: 'Status',
      body: 'Weekly status.\n',
      readers: { ...SOLO, external: 1, others: 1 },
      operatorId: 'operator',
    });
    expect(score.level).toBe(1);
    expect(score.hits[0]).toMatchObject({ name: 'external_reader', count: 1 });
  });

  it('needs two body hits for a category, and one title hit', () => {
    const bodyOnly = scoreSignals({
      title: 'Notes',
      body: 'The budget looks tight.\n',
      readers: SOLO,
      operatorId: 'operator',
    });
    expect(bodyOnly.level).toBe(0);

    const twoHits = scoreSignals({
      title: 'Notes',
      body: 'The budget and revenue look tight.\n',
      readers: SOLO,
      operatorId: 'operator',
    });
    expect(twoHits.level).toBe(1);
    expect(twoHits.hits[0]?.terms).toEqual(['budget', 'revenue']);

    const titled = scoreSignals({
      title: 'Health check-in',
      body: 'A short note.\n',
      readers: SOLO,
      operatorId: 'operator',
    });
    expect(titled.level).toBe(3);
  });

  it('records terms and counts, never excerpts', () => {
    const score = scoreSignals({
      title: 'Legal',
      body: 'lawsuit lawsuit settlement\n',
      readers: SOLO,
      operatorId: 'operator',
    });
    expect(JSON.stringify(score)).not.toContain('lawsuit lawsuit');
    expect(score.hits.find((hit) => hit.name === 'legal')?.count).toBe(3);
  });

  it('lets a human final win and never lets the model lower signals', () => {
    expect(proposedLevel({ signalLevel: 2, modelLevel: 0 })).toBe(2);
    expect(proposedLevel({ signalLevel: 1, modelLevel: 3 })).toBe(3);
    expect(proposedLevel({ signalLevel: 2, modelLevel: 3, finalLevel: 0 })).toBe(0);
  });
});
