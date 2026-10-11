import type { Circle, Person, Readers, SharingGrant, SharingSnapshot } from './types.js';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function personByEmail(people: readonly Person[], email: string): Person | undefined {
  const needle = normalizeEmail(email);
  return people.find((person) => person.google.some((entry) => normalizeEmail(entry) === needle));
}

function grantExpired(grant: SharingGrant, now: Date): boolean {
  if (grant.expirationTime === undefined) {
    return false;
  }
  const expires = Date.parse(grant.expirationTime);
  return Number.isFinite(expires) && expires <= now.getTime();
}

function grantCounts(grant: SharingGrant, now: Date): boolean {
  if (grant.deleted === true || grant.view === 'metadata' || grantExpired(grant, now)) {
    return false;
  }
  if (grant.type === 'domain' || grant.type === 'anyone') {
    return grant.allowFileDiscovery === true;
  }
  return grant.type === 'user' || grant.type === 'group';
}

/**
 * People who can open a document at its origin. The connector account is
 * always a reader. Groups never count in v1.
 */
export function resolveReaders(input: {
  readonly people: readonly Person[];
  readonly domains: readonly string[];
  readonly operatorEmail: string;
  readonly snapshot: SharingSnapshot;
  readonly now?: Date;
}): Readers {
  const now = input.now ?? new Date();
  const operator = personByEmail(input.people, input.operatorEmail);
  const people = new Set<string>();
  if (operator !== undefined) {
    people.add(operator.id);
  }

  let others = 0;
  let external = 0;
  let groupUnresolved = 0;
  const domains = new Set(input.domains.map((domain) => domain.toLowerCase()));

  if (input.snapshot.sharing === 'partial') {
    return {
      people: [...people].sort(),
      others: 0,
      external: 0,
      groupUnresolved: 0,
      sharing: 'partial',
    };
  }

  for (const grant of input.snapshot.grants) {
    if (!grantCounts(grant, now)) {
      continue;
    }
    if (grant.type === 'group') {
      groupUnresolved += 1;
      continue;
    }
    if (grant.type === 'user') {
      const email = grant.emailAddress;
      if (email === undefined) {
        others += 1;
        continue;
      }
      const person = personByEmail(input.people, email);
      if (person !== undefined) {
        people.add(person.id);
        continue;
      }
      others += 1;
      const domain = email.split('@')[1]?.toLowerCase();
      if (domain === undefined || !domains.has(domain)) {
        external += 1;
      }
      continue;
    }
    others += 1;
    if (grant.type === 'anyone' || (grant.domain !== undefined && !domains.has(grant.domain.toLowerCase()))) {
      external += 1;
    }
  }

  return {
    people: [...people].sort(),
    others,
    external,
    groupUnresolved,
    sharing: 'full',
  };
}

/** Circles whose members are all readers. Promotions are ignored. */
export function eligibleCircles(circles: readonly Circle[], readers: Readers): readonly string[] {
  const readerSet = new Set(readers.people);
  return circles
    .filter((circle) => circle.members.every((member) => readerSet.has(member)))
    .map((circle) => circle.id);
}

export function findPersonByEmail(
  people: readonly Person[],
  email: string,
): Person | undefined {
  return personByEmail(people, email);
}
