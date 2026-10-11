import { describe, expect, it } from 'vitest';

import { placeDocument } from '../src/circles/placement.js';
import type {
  ApprovalRecord,
  Circle,
  PlacementInput,
  ReviewState,
  SensitivityLevel,
} from '../src/circles/types.js';

const PEOPLE = ['operator', 'cofounder', 'lead', 'member'] as const;

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

function subset(random: () => number, items: readonly string[]): string[] {
  return items.filter(() => random() < 0.5);
}

function randomReview(random: () => number, hash: string): ReviewState {
  const approvals: Record<string, ApprovalRecord> = {};
  for (const circle of ['team', 'leadership', 'founders', 'me']) {
    if (random() < 0.3) {
      approvals[circle] = {
        circle,
        hash: random() < 0.7 ? hash : 'other',
        basis: random() < 0.5 ? 'sharing' : 'promotion',
        canShare: random() < 0.5,
        added: [],
        by: 'operator@example.test',
        note: 'test',
      };
    }
  }
  return {
    queued: new Set(),
    excluded: random() < 0.1,
    approvals,
    ...(random() < 0.2 ? { finalLevel: pick(random, [0, 1, 2, 3] as const) } : {}),
  };
}

function circles(): readonly Circle[] {
  return [
    { id: 'team', source: 's-team', members: [...PEOPLE], ceiling: 0, admit: 'review' },
    { id: 'leadership', source: 's-lead', members: ['operator', 'cofounder', 'lead'], ceiling: 1, admit: 'review' },
    { id: 'founders', source: 's-founders', members: ['operator', 'cofounder'], ceiling: 2, admit: 'auto' },
    { id: 'me', source: 's-me', members: ['operator'], ceiling: 3, admit: 'auto' },
  ];
}

function audienceOk(input: PlacementInput, circle: Circle): boolean {
  const readers = new Set(input.readers.people);
  if (circle.members.every((member) => readers.has(member))) {
    return true;
  }
  const approval = input.review.approvals[circle.id];
  return (
    approval !== undefined &&
    approval.hash === input.contentHash &&
    approval.basis === 'promotion' &&
    input.canShare
  );
}

function admissionOk(input: PlacementInput, circle: Circle): boolean {
  if (circle.admit === 'auto') {
    return true;
  }
  const approval = input.review.approvals[circle.id];
  return approval !== undefined && approval.hash === input.contentHash;
}

describe('placement invariant', () => {
  it('never places a circle that breaks audience, ceiling or admission', () => {
    const random = mulberry32(20261012);
    const defined = circles();
    const route = defined.map((circle) => circle.id);

    for (let i = 0; i < 400; i += 1) {
      const hash = `h${i}`;
      const input: PlacementInput = {
        route,
        circles: defined,
        readers: {
          people: ['operator', ...subset(random, PEOPLE.slice(1))],
          others: 0,
          external: 0,
          groupUnresolved: 0,
          sharing: 'full',
        },
        level: pick(random, [0, 1, 2, 3] as const) as SensitivityLevel,
        review: randomReview(random, hash),
        contentHash: hash,
        canShare: random() < 0.5,
      };
      const placed = placeDocument(input);
      if (placed.held) {
        if (input.review.excluded) {
          expect(placed.reason).toBe('excluded');
        }
        continue;
      }
      const circle = defined.find((entry) => entry.id === placed.circle);
      expect(circle).toBeDefined();
      expect(input.level).toBeLessThanOrEqual(circle!.ceiling);
      expect(audienceOk(input, circle!)).toBe(true);
      expect(admissionOk(input, circle!)).toBe(true);
    }
  });
});
