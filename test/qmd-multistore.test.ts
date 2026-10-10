import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { updateIndex } from '../src/retrieval/index-job.js';
import { openIndexStore, collectionsForIndex, searchStore } from '../src/retrieval/qmd-adapter.js';
import type { SourceManifest } from '../src/config/schemas.js';
import { loadSourceManifest } from '../src/config/source-manifest.js';
import { copyFixture, writePilotConfig } from './helpers.js';
import { testRoot } from './setup.js';

describe('qmd multi-store spike', () => {
  it('opens two lexical stores in one process', async () => {
    const config = await writePilotConfig({
      alpha: await copyFixture('team-alpha', join(testRoot, 'ms-alpha')),
      beta: await copyFixture('team-beta', join(testRoot, 'ms-beta')),
      journal: await copyFixture('journal', join(testRoot, 'ms-journal')),
    });
    await updateIndex(config, 'team');
    await updateIndex(config, 'personal');

    const manifests = new Map<
      string,
      { readonly path: string; readonly manifest: SourceManifest }
    >();
    for (const source of config.sources) {
      const manifest = await loadSourceManifest(source.path);
      if (manifest.isOk()) {
        manifests.set(source.id, { path: source.path, manifest: manifest.value });
      }
    }

    const before = process.memoryUsage().rss;
    const team = await openIndexStore(
      'team',
      collectionsForIndex(config, 'team', manifests),
    );
    const personal = await openIndexStore(
      'personal',
      collectionsForIndex(config, 'personal', manifests),
    );
    expect(team.isOk()).toBe(true);
    expect(personal.isOk()).toBe(true);
    if (team.isOk() && personal.isOk()) {
      const teamHits = await searchStore(team.value, 'release', 'lexical', 3);
      const personalHits = await searchStore(
        personal.value,
        'garden',
        'lexical',
        3,
      );
      expect(teamHits.isOk()).toBe(true);
      expect(personalHits.isOk()).toBe(true);
      await team.value.close();
      await personal.value.close();
    }
    const after = process.memoryUsage().rss;
    expect(after).toBeGreaterThan(0);
    expect(before).toBeGreaterThan(0);
  });
});
