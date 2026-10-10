import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { updateIndex } from '../src/retrieval/index-job.js';
import { loadCatalogue } from '../src/retrieval/catalogue.js';
import { copyFixture, writePilotConfig } from './helpers.js';
import { testRoot } from './setup.js';

describe('index update', () => {
  it('builds a catalogue that can be rebuilt after delete', async () => {
    const config = await writePilotConfig({
      alpha: await copyFixture('team-alpha', join(testRoot, 'idx-alpha')),
      beta: await copyFixture('team-beta', join(testRoot, 'idx-beta')),
      journal: await copyFixture('journal', join(testRoot, 'idx-journal')),
    });
    const first = await updateIndex(config, 'team');
    const catalogue = await loadCatalogue('team');
    expect(first.documents).toBeGreaterThanOrEqual(4);
    expect(catalogue?.entries.some((entry) => entry.identity === 'stable')).toBe(
      true,
    );

    const { indexDir } = await import('../src/env.js');
    await rm(indexDir('team'), { recursive: true, force: true });
    const second = await updateIndex(config, 'team');
    expect(second.documents).toBe(first.documents);
  });

  it('records a revoked source as absent after it is dropped', async () => {
    const config = await writePilotConfig({
      alpha: await copyFixture('team-alpha', join(testRoot, 'rev-alpha')),
      beta: await copyFixture('team-beta', join(testRoot, 'rev-beta')),
      journal: await copyFixture('journal', join(testRoot, 'rev-journal')),
    });
    await updateIndex(config, 'team');
    config.indexes[0] = { id: 'team', sources: [config.sources[0]!.id] };
    await updateIndex(config, 'team');
    const catalogue = await loadCatalogue('team');
    expect(
      catalogue?.entries.some((entry) => entry.sourceId === config.sources[1]?.id),
    ).toBe(false);
  });
});
