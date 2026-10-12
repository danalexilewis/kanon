import { describe, expect, it } from 'vitest';

import { folderMatches, matchGlob, selectQueuedUris } from '../src/review/select.js';

const items = [
  {
    uri: 'fake://root',
    externalId: 'root',
    docId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    title: 'Standup',
    relativeDir: '',
  },
  {
    uri: 'fake://one',
    externalId: 'one',
    docId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    title: 'Hard conversation',
    relativeDir: 'Meeting One',
  },
  {
    uri: 'fake://two',
    externalId: 'two',
    docId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    title: 'Planning',
    relativeDir: 'Meeting One/Notes',
  },
];

describe('review queue selectors', () => {
  it('matches folder paths and title globs', () => {
    expect(folderMatches('', '.')).toBe(true);
    expect(folderMatches('Meeting One', 'Meeting One')).toBe(true);
    expect(folderMatches('Meeting One/Notes', 'Meeting One')).toBe(true);
    expect(folderMatches('', 'Meeting One')).toBe(false);
    expect(matchGlob('Hard *', 'Hard conversation', true)).toBe(true);
    expect(matchGlob('plan*', 'Planning', true)).toBe(true);
    expect(matchGlob('Standup', 'Planning', true)).toBe(false);
  });

  it('unions tokens, folder and title', () => {
    expect(selectQueuedUris({ items, tokens: ['one'] })).toEqual(['fake://one']);
    expect(selectQueuedUris({ items, tokens: [], folder: 'Meeting One' })).toEqual([
      'fake://one',
      'fake://two',
    ]);
    expect(selectQueuedUris({ items, tokens: [], title: 'stand*' })).toEqual(['fake://root']);
    expect(selectQueuedUris({ items, tokens: ['root'], title: 'Hard *' }).sort()).toEqual([
      'fake://one',
      'fake://root',
    ]);
  });
});
