import { describe, expect, it } from 'vitest';

import { documentState, reduceLedger } from '../src/review/ledger.js';

const HASH = 'a'.repeat(64);

function line(value: Record<string, unknown>): string {
  return JSON.stringify({ schema: 'kanon/review/v1', ...value });
}

describe('reduceLedger', () => {
  it('folds queue, approval, revoke and exclude', () => {
    const { state, errors } = reduceLedger([
      line({
        kind: 'queue',
        uri: 'gdrive://doc-1',
        circle: 'team',
        by: 'operator@example.test',
        at: '2026-10-12T00:00:00.000Z',
      }),
      line({
        kind: 'approval',
        uri: 'gdrive://doc-1',
        circle: 'team',
        hash: HASH,
        basis: 'promotion',
        canShare: true,
        added: ['member'],
        note: 'ok',
        by: 'operator@example.test',
        at: '2026-10-12T00:01:00.000Z',
      }),
      line({
        kind: 'level',
        uri: 'gdrive://doc-1',
        level: 1,
        by: 'operator@example.test',
        at: '2026-10-12T00:02:00.000Z',
        note: 'leadership',
      }),
    ]);
    expect(errors).toEqual([]);
    const doc = documentState(state, 'gdrive://doc-1');
    expect(doc.queued.has('team')).toBe(false);
    expect(doc.finalLevel).toBe(1);
    expect(doc.approvals.team).toMatchObject({ basis: 'promotion', hash: HASH, by: 'operator@example.test' });
  });

  it('names the failing line', () => {
    const { errors } = reduceLedger(['not-json', line({ kind: 'queue', uri: 'gdrive://x', by: 'a', at: 't' })]);
    expect(errors[0]).toMatch(/line 1/);
  });

  it('keeps the higher model proposal and honours exclude then include', () => {
    const { state } = reduceLedger([
      line({
        kind: 'proposal',
        uri: 'gdrive://doc-2',
        proposedLevel: 1,
        by: 'scorer:cloud',
        at: '2026-10-12T00:00:00.000Z',
        reasons: ['pricing'],
      }),
      line({
        kind: 'proposal',
        uri: 'gdrive://doc-2',
        proposedLevel: 2,
        by: 'scorer:cloud',
        at: '2026-10-12T00:01:00.000Z',
      }),
      line({
        kind: 'exclude',
        uri: 'gdrive://doc-2',
        by: 'operator@example.test',
        at: '2026-10-12T00:02:00.000Z',
        note: 'hold',
      }),
      line({
        kind: 'include',
        uri: 'gdrive://doc-2',
        by: 'operator@example.test',
        at: '2026-10-12T00:03:00.000Z',
        note: 'back',
      }),
    ]);
    const doc = documentState(state, 'gdrive://doc-2');
    expect(doc.proposedLevel).toBe(2);
    expect(doc.excluded).toBe(false);
    expect(doc.proposals).toHaveLength(2);
  });
});
