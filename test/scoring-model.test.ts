import { ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { writeCredentials } from '../src/connectors/credentials.js';
import { runIngest } from '../src/jobs/ingest.js';
import { runTick } from '../src/jobs/tick.js';
import { MODEL_BODY_LIMIT, scoreWithModel } from '../src/scoring/model.js';
import { proposedLevel } from '../src/scoring/signals.js';
import { OPERATOR_PERSON, soloCircle } from './helpers.js';
import { createSourceRemote } from './git-helpers.js';

const KEY = 'sk-secret-key';

function scorer() {
  return {
    id: 'cloud',
    kind: 'openai-compatible' as const,
    endpoint: 'https://api.example.test/v1',
    model: 'example-model',
  };
}

describe('cloud model proposer', () => {
  it('sends the rubric, no emails, and a truncated body', async () => {
    await writeCredentials('cloud', { type: 'scorer', apiKey: KEY });
    const bodies: string[] = [];
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ level: 2, reasons: ['legal risk'] }) } }],
        }),
      );
    }) as typeof fetch;

    const result = await scoreWithModel({
      scorer: scorer(),
      items: [
        {
          uri: 'fake://1',
          title: 'Note',
          body: `${'x'.repeat(MODEL_BODY_LIMIT + 50)} operator@example.test`,
          readers: 2,
        },
      ],
      deps: { fetch: fetchImpl, rubric: 'Levels 0 team, 1 leadership, 2 founders, 3 me.', apiKey: KEY },
    });
    expect(result.isOk()).toBe(true);
    const sent = bodies[0] ?? '';
    expect(sent).toContain('Levels 0 team');
    expect(sent).not.toContain('operator@example.test');
    expect(sent).not.toContain('x'.repeat(MODEL_BODY_LIMIT + 1));
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('fails closed on a bad response or 401', async () => {
    await writeCredentials('cloud', { type: 'scorer', apiKey: KEY });
    const bad = await scoreWithModel({
      scorer: scorer(),
      items: [{ uri: 'fake://1', title: 'A', body: 'b', readers: 1 }],
      deps: {
        fetch: (async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"level":9}' } }] }))) as typeof fetch,
        apiKey: KEY,
      },
    });
    expect(bad._unsafeUnwrapErr().code).toBe('scorer_failed');

    const auth = await scoreWithModel({
      scorer: scorer(),
      items: [{ uri: 'fake://1', title: 'A', body: 'b', readers: 1 }],
      deps: { fetch: (async () => new Response('no', { status: 401 })) as typeof fetch, apiKey: KEY },
    });
    expect(auth._unsafeUnwrapErr().code).toBe('scorer_auth_required');
  });

  it('cannot push the level below the signals', () => {
    expect(proposedLevel({ signalLevel: 2, modelLevel: 0 })).toBe(2);
  });

  it('is never called from tick or ingest run', async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return new Response('{}');
    }) as typeof fetch;
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const id = 'f1000000-0000-4000-8000-000000000001';
      const remote = await createSourceRemote('model-ingest', id);
      await runIngest(
        {
          schema: 'kanon/machine/v1',
          sources: [{ id, kind: 'managed', path: remote.clone, remote: remote.url, access: 'write' }],
          indexes: [],
          projects: [],
          grants: [],
          people: [OPERATOR_PERSON],
          circles: [soloCircle(id)],
          connectors: [{ id: 'fake', kind: 'google-drive', auth: 'oauth' }],
          ingest: [{ id: 'job', connector: 'fake', route: ['me'], folder: 'root', target: 'docs/imported', schedule: 'off' }],
        },
        'job',
        {},
        { connectorFor: async () => ok({ kind: 'fake', scheme: 'fake', list: async () => ok([]), read: async () => ok('') }) },
      );
      await runTick(
        {
          schema: 'kanon/machine/v1',
          sources: [],
          indexes: [],
          projects: [],
          grants: [],
        },
        { force: true },
      );
    } finally {
      globalThis.fetch = original;
    }
    expect(called).toBe(0);
  });
});
