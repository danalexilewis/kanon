import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { saveMachineConfig } from '../src/config/machine.js';
import type { MachineConfig } from '../src/config/schemas.js';

const fixturesRoot = fileURLToPath(new URL('./fixtures', import.meta.url));

export const TEAM_ALPHA_ID = '11111111-1111-4111-8111-111111111111';
export const TEAM_BETA_ID = '22222222-2222-4222-8222-222222222222';
export const JOURNAL_ID = '33333333-3333-4333-8333-333333333333';
export const RELEASE_DOC_ID = '59e71e48-76c1-4c01-aab3-1d39a4fe8e64';

export async function copyFixture(
  name: 'team-alpha' | 'team-beta' | 'journal' | 'malicious',
  dest: string,
): Promise<string> {
  await cp(join(fixturesRoot, name), dest, { recursive: true });
  return dest;
}

export async function writePilotConfig(paths: {
  readonly alpha: string;
  readonly beta: string;
  readonly journal: string;
}): Promise<MachineConfig> {
  const config: MachineConfig = {
    schema: 'kanon/machine/v1',
    sources: [
      { id: TEAM_ALPHA_ID, kind: 'local', path: paths.alpha },
      { id: TEAM_BETA_ID, kind: 'local', path: paths.beta },
      { id: JOURNAL_ID, kind: 'local', path: paths.journal },
    ],
    indexes: [
      { id: 'team', sources: [TEAM_ALPHA_ID, TEAM_BETA_ID] },
      { id: 'personal', sources: [JOURNAL_ID] },
    ],
    projects: [
      { id: 'alpha-app', root: paths.alpha },
      { id: 'journal-app', root: paths.journal },
    ],
    grants: [
      { project: 'alpha-app', indexes: ['team'] },
      { project: 'journal-app', indexes: ['personal'] },
    ],
  };
  await saveMachineConfig(config);
  return config;
}
