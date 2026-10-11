import { err, ok, type Result } from 'neverthrow';

import type { RailError } from '@eddy-works/never-rest';
import { eligibleCircles, findPersonByEmail, resolveReaders } from '../circles/readers.js';
import type { Circle, Person, Readers, SharingSnapshot } from '../circles/types.js';
import {
  circleAdmit,
  configCircles,
  configDomains,
  configPeople,
  type MachineConfig,
} from '../config/schemas.js';
import type { Connector, ConnectorError, ConnectorItem } from '../connectors/types.js';
import { invalidConfig } from '../errors.js';

export function toDomainPeople(config: MachineConfig): readonly Person[] {
  return configPeople(config).map((person) => ({
    id: person.id,
    google: person.google,
    ...(person.github !== undefined ? { github: person.github } : {}),
  }));
}

export function toDomainCircles(config: MachineConfig): readonly Circle[] {
  return configCircles(config).map((circle) => ({
    id: circle.id,
    source: circle.source,
    members: circle.members,
    ceiling: circle.ceiling,
    admit: circleAdmit(circle),
  }));
}

export async function connectorAccount(
  connector: Connector,
  fallback = 'operator@example.test',
): Promise<Result<string, ConnectorError>> {
  if (connector.account === undefined) {
    return ok(fallback);
  }
  return connector.account();
}

export function requireOperatorPerson(
  config: MachineConfig,
  email: string,
): Result<Person, RailError<'invalid_config'>> {
  const person = findPersonByEmail(toDomainPeople(config), email);
  if (person === undefined) {
    return err(invalidConfig('Connector account is not a declared person'));
  }
  return ok(person);
}

export async function itemSharing(
  connector: Connector,
  item: ConnectorItem,
): Promise<SharingSnapshot> {
  if (connector.sharing === undefined) {
    return { grants: [], sharing: 'full' };
  }
  const snapshot = await connector.sharing(item);
  if (snapshot.isErr()) {
    return { grants: [], sharing: 'partial' };
  }
  return snapshot.value;
}

export async function itemCanShare(connector: Connector, item: ConnectorItem): Promise<boolean> {
  if (connector.canShare === undefined) {
    return false;
  }
  const result = await connector.canShare(item);
  return result.isOk() && result.value;
}

export function readersFor(
  config: MachineConfig,
  operatorEmail: string,
  snapshot: SharingSnapshot,
): Readers {
  return resolveReaders({
    people: toDomainPeople(config),
    domains: configDomains(config),
    operatorEmail,
    snapshot,
  });
}

export function eligibleOnRoute(
  config: MachineConfig,
  route: readonly string[],
  readers: Readers,
): readonly string[] {
  const circles = toDomainCircles(config).filter((circle) => route.includes(circle.id));
  return eligibleCircles(circles, readers);
}
