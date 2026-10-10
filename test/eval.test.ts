import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { knowledgeClient } from '../src/cli/client.js';
import { OPERATOR } from '../src/core/principal.js';
import { updateIndex } from '../src/retrieval/index-job.js';
import { copyFixture, writePilotConfig } from './helpers.js';
import { testRoot } from './setup.js';

interface EvalQuestion {
  readonly id: string;
  readonly query: string;
  readonly index: string;
  readonly expectDocId?: string;
  readonly expectPath?: string;
}

describe('retrieval eval baseline', () => {
  it('records lexical recall on the fixture questions', async () => {
    const config = await writePilotConfig({
      alpha: await copyFixture('team-alpha', join(testRoot, 'ev-alpha')),
      beta: await copyFixture('team-beta', join(testRoot, 'ev-beta')),
      journal: await copyFixture('journal', join(testRoot, 'ev-journal')),
    });
    await updateIndex(config, 'team');
    await updateIndex(config, 'personal');
    const questions = JSON.parse(
      await readFile(
        fileURLToPath(new URL('./eval/questions.json', import.meta.url)),
        'utf8',
      ),
    ) as EvalQuestion[];
    const client = knowledgeClient({ config, principal: OPERATOR });
    let hits = 0;
    for (const question of questions) {
      const result = await client.search({
        query: {
          query: question.query,
          index: question.index,
          mode: 'lexical',
          limit: 5,
        },
      });
      const list = result.isOk() ? result.value.hits : [];
      const found = list.some((hit) => {
        if (question.expectDocId !== undefined) {
          return hit.docId === question.expectDocId;
        }
        return hit.path === question.expectPath;
      });
      if (found) {
        hits += 1;
      }
    }
    // First lexical baseline on this 20-question fixture: record, don't invent a
    // marketing threshold. 10/20 is the floor; 12/20 was observed 2026-10-11.
    expect(hits).toBeGreaterThanOrEqual(10);
    expect(questions.length).toBe(20);
  });
});
