import { describe, expect, it } from 'vitest';

import { placeDocument } from '../src/circles/placement.js';
import type { Circle, PlacementInput, ReviewState } from '../src/circles/types.js';

const CIRCLES: readonly Circle[] = [
  { id: 'team', source: 's-team', members: ['operator', 'cofounder', 'lead', 'member'], ceiling: 0, admit: 'review' },
  { id: 'founders', source: 's-founders', members: ['operator', 'cofounder'], ceiling: 2, admit: 'auto' },
  { id: 'me', source: 's-me', members: ['operator'], ceiling: 3, admit: 'auto' },
];

const ROUTE = ['team', 'founders', 'me'] as const;
const HASH = 'abc';

function review(partial: Partial<ReviewState> = {}): ReviewState {
  return {
    queued: new Set(),
    excluded: false,
    approvals: {},
    ...partial,
  };
}

function place(overrides: Partial<PlacementInput> = {}) {
  return placeDocument({
    route: ROUTE,
    circles: CIRCLES,
    readers: { people: ['operator'], others: 0, external: 0, groupUnresolved: 0, sharing: 'full' },
    level: 0,
    review: review(),
    contentHash: HASH,
    canShare: false,
    ...overrides,
  });
}

describe('placeDocument', () => {
  it.each([
    {
      name: 'widest sharing circle when admit is auto',
      overrides: {
        readers: {
          people: ['operator', 'cofounder'],
          others: 0,
          external: 0,
          groupUnresolved: 0,
          sharing: 'full' as const,
        },
        level: 1 as const,
      },
      expected: { circle: 'founders', held: false, basis: 'sharing' },
    },
    {
      name: 'skips a review circle without approval',
      overrides: {
        readers: {
          people: ['operator', 'cofounder', 'lead', 'member'],
          others: 0,
          external: 0,
          groupUnresolved: 0,
          sharing: 'full' as const,
        },
      },
      expected: { circle: 'founders', held: false, basis: 'sharing' },
    },
    {
      name: 'uses a promotion when canShare is still true',
      overrides: {
        level: 0 as const,
        canShare: true,
        review: review({
          approvals: {
            team: {
              circle: 'team',
              hash: HASH,
              basis: 'promotion',
              canShare: true,
              added: ['member'],
              by: 'operator@example.test',
              note: 'ok',
            },
          },
        }),
      },
      expected: { circle: 'team', held: false, basis: 'promotion' },
    },
    {
      name: 'ignores a promotion when canShare is false',
      overrides: {
        canShare: false,
        review: review({
          approvals: {
            team: {
              circle: 'team',
              hash: HASH,
              basis: 'promotion',
              canShare: true,
              added: ['member'],
              by: 'operator@example.test',
              note: 'ok',
            },
          },
        }),
      },
      expected: { circle: 'me', held: false, basis: 'sharing' },
    },
    {
      name: 'ignores an approval for a different content hash',
      overrides: {
        canShare: true,
        review: review({
          approvals: {
            team: {
              circle: 'team',
              hash: 'old',
              basis: 'promotion',
              canShare: true,
              added: [],
              by: 'operator@example.test',
              note: 'stale',
            },
          },
        }),
      },
      expected: { circle: 'me', held: false, basis: 'sharing' },
    },
    {
      name: 'holds an excluded document',
      overrides: { review: review({ excluded: true }) },
      expected: { held: true, reason: 'excluded' },
    },
    {
      name: 'skips a circle whose ceiling is below the level',
      overrides: {
        level: 3 as const,
        readers: {
          people: ['operator', 'cofounder'],
          others: 0,
          external: 0,
          groupUnresolved: 0,
          sharing: 'full' as const,
        },
      },
      expected: { circle: 'me', held: false, basis: 'sharing' },
    },
  ])('$name', ({ overrides, expected }) => {
    expect(place(overrides)).toMatchObject(expected);
  });
});
