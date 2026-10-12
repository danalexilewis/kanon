import { describe, expect, it } from 'vitest';

import { parseMachineConfig } from '../src/config/machine.js';

const MANAGED = '44444444-4444-4444-8444-444444444444';
const LOCAL = '55555555-5555-4555-8555-555555555555';

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'kanon/machine/v1',
    sources: [
      {
        id: MANAGED,
        kind: 'managed',
        path: '/tmp/managed',
        remote: 'file:///tmp/managed.git',
        branch: 'main',
        access: 'write',
        refresh: 'daily',
      },
      { id: LOCAL, kind: 'local', path: '/tmp/journal', refresh: 'hourly' },
    ],
    indexes: [{ id: 'team', sources: [MANAGED], embed: false }],
    projects: [],
    grants: [],
    people: [{ id: 'operator', google: ['operator@example.test'] }],
    circles: [{ id: 'me', source: MANAGED, members: ['operator'], ceiling: 3, admit: 'auto' }],
    connectors: [{ id: 'team-drive', kind: 'google-drive', auth: 'oauth' }],
    ingest: [
      {
        id: 'policies',
        connector: 'team-drive',
        route: ['me'],
        folder: '1AbC',
        target: 'docs/policies',
        schedule: 'weekly',
        device: 'studio',
      },
    ],
    ...overrides,
  };
}

describe('scheduled job config', () => {
  it('accepts write sources, connectors and routed ingest jobs', () => {
    expect(parseMachineConfig(baseConfig()).isOk()).toBe(true);
  });

  it('keeps old configs without the new fields valid', () => {
    const parsed = parseMachineConfig({
      schema: 'kanon/machine/v1',
      sources: [{ id: LOCAL, kind: 'local', path: '/tmp/journal' }],
      indexes: [],
      projects: [],
      grants: [],
    });
    expect(parsed.isOk()).toBe(true);
  });

  it('rejects access: write on a local source', () => {
    const config = baseConfig({
      sources: [{ id: LOCAL, kind: 'local', path: '/tmp/journal', access: 'write' }],
      circles: [],
      ingest: [],
    });
    const parsed = parseMachineConfig(config);
    expect(parsed.isErr()).toBe(true);
    expect(parsed._unsafeUnwrapErr().message).toMatch(/managed/);
  });

  it('rejects access: write without a remote', () => {
    const config = baseConfig({
      sources: [{ id: MANAGED, kind: 'managed', path: '/tmp/m', access: 'write' }],
      circles: [],
      ingest: [],
    });
    expect(parseMachineConfig(config)._unsafeUnwrapErr().message).toMatch(/remote/);
  });

  it('rejects ingest[].source and asks for route', () => {
    const config = baseConfig();
    (config.ingest as Array<Record<string, unknown>>)[0]!.source = MANAGED;
    expect(parseMachineConfig(config)._unsafeUnwrapErr().message).toMatch(/use route instead of source/);
  });

  it('rejects a circle whose source is not a write remote', () => {
    const config = baseConfig({
      circles: [{ id: 'me', source: LOCAL, members: ['operator'], ceiling: 3, admit: 'auto' }],
      ingest: [],
    });
    expect(parseMachineConfig(config)._unsafeUnwrapErr().message).toMatch(/access: write/);
  });

  it('rejects unknown connectors, escaping targets and shared targets', () => {
    const unknown = baseConfig();
    (unknown.ingest as Array<Record<string, unknown>>)[0]!.connector = 'nope';
    expect(parseMachineConfig(unknown)._unsafeUnwrapErr().message).toMatch(/connector/);

    const escaping = baseConfig();
    (escaping.ingest as Array<Record<string, unknown>>)[0]!.target = '../outside';
    expect(parseMachineConfig(escaping)._unsafeUnwrapErr().message).toMatch(/target/);

    const absolute = baseConfig();
    (absolute.ingest as Array<Record<string, unknown>>)[0]!.target = '/etc';
    expect(parseMachineConfig(absolute).isErr()).toBe(true);

    const shared = baseConfig();
    const job = (shared.ingest as Array<Record<string, unknown>>)[0]!;
    (shared.ingest as Array<Record<string, unknown>>).push({
      ...job,
      id: 'second',
      target: './docs/policies/',
    });
    expect(parseMachineConfig(shared)._unsafeUnwrapErr().message).toMatch(/owned/);
  });

  it('rejects unknown keys on ingest jobs', () => {
    const config = baseConfig();
    (config.ingest as Array<Record<string, unknown>>)[0]!.command = 'rm -rf /';
    expect(parseMachineConfig(config).isErr()).toBe(true);
  });
});
