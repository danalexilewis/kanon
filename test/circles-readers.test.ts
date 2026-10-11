import { describe, expect, it } from 'vitest';

import { eligibleCircles, resolveReaders } from '../src/circles/readers.js';
import type { Circle, Person, SharingSnapshot } from '../src/circles/types.js';

const PEOPLE: readonly Person[] = [
  { id: 'operator', google: ['operator@example.test'] },
  { id: 'cofounder', google: ['Cofounder@example.test'] },
  { id: 'lead', google: ['lead@example.test'] },
  { id: 'member', google: ['member@example.test'] },
];

const CIRCLES: readonly Circle[] = [
  { id: 'me', source: 's1', members: ['operator'], ceiling: 3, admit: 'auto' },
  { id: 'founders', source: 's2', members: ['operator', 'cofounder'], ceiling: 2, admit: 'auto' },
  { id: 'team', source: 's3', members: ['operator', 'cofounder', 'lead', 'member'], ceiling: 0, admit: 'review' },
];

function readers(snapshot: SharingSnapshot, now?: Date) {
  return resolveReaders({
    people: PEOPLE,
    domains: ['example.test'],
    operatorEmail: 'operator@example.test',
    snapshot,
    ...(now !== undefined ? { now } : {}),
  });
}

describe('resolveReaders', () => {
  it('always includes the operator and matches emails case-insensitively', () => {
    const result = readers({
      sharing: 'full',
      grants: [{ type: 'user', emailAddress: 'COFOUNDER@example.test' }],
    });
    expect(result).toEqual({
      people: ['cofounder', 'operator'],
      others: 0,
      external: 0,
      groupUnresolved: 0,
      sharing: 'full',
    });
  });

  it('ignores deleted, expired, metadata-only and link-only grants', () => {
    const now = new Date('2026-10-12T00:00:00.000Z');
    const result = readers(
      {
        sharing: 'full',
        grants: [
          { type: 'user', emailAddress: 'member@example.test', deleted: true },
          { type: 'user', emailAddress: 'lead@example.test', expirationTime: '2026-01-01T00:00:00.000Z' },
          { type: 'user', emailAddress: 'guest@example.test', view: 'metadata' },
          { type: 'anyone', allowFileDiscovery: false },
          { type: 'domain', domain: 'example.test', allowFileDiscovery: false },
        ],
      },
      now,
    );
    expect(result.people).toEqual(['operator']);
    expect(result.others).toBe(0);
    expect(result.external).toBe(0);
  });

  it('counts undeclared and external readers, and reports groups as unresolved', () => {
    const result = readers({
      sharing: 'full',
      grants: [
        { type: 'user', emailAddress: 'staff@example.test' },
        { type: 'user', emailAddress: 'guest@other.test' },
        { type: 'group', emailAddress: 'eng@example.test' },
        { type: 'anyone', allowFileDiscovery: true },
      ],
    });
    expect(result.people).toEqual(['operator']);
    expect(result.others).toBe(3);
    expect(result.external).toBe(2);
    expect(result.groupUnresolved).toBe(1);
  });

  it('treats unreadable sharing as partial with only the operator', () => {
    const result = readers({
      sharing: 'partial',
      grants: [{ type: 'user', emailAddress: 'member@example.test' }],
    });
    expect(result).toEqual({
      people: ['operator'],
      others: 0,
      external: 0,
      groupUnresolved: 0,
      sharing: 'partial',
    });
  });

  it('lists circles whose members are all readers', () => {
    const result = readers({
      sharing: 'full',
      grants: [{ type: 'user', emailAddress: 'cofounder@example.test' }],
    });
    expect(eligibleCircles(CIRCLES, result)).toEqual(['me', 'founders']);
  });
});
