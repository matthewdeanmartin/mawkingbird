import { describe, expect, it } from 'vitest';
import { Status } from '../models';
import { account, post, reply, who } from '../testing/forum-fixtures';
import { discussionKey, DiscussionSummary, summarize } from './discussion';
import {
  applyFacets,
  FACET_LIMIT,
  facetCounts,
  facetParams,
  hasFacets,
  languageOf,
  mostActive,
  NO_FACETS,
  toggleFacet,
} from './discussion-facets';

function summary(root: Status, ...replies: Status[]): DiscussionSummary {
  return summarize(
    {
      key: discussionKey(root),
      anchor: root,
      partial: false,
      posts: [root, ...replies],
      treeLoaded: true,
    },
    null,
    new Set(),
  );
}

const tagged = (id: string, author: string, tags: string[], extra: Partial<Status> = {}) =>
  post(id, author, { tags: tags.map((name) => ({ name, url: '' })), ...extra });

describe('discussion facets', () => {
  const rustOnRemote = tagged('1', 'a', ['rust'], {
    account: account('a', 'ua@remote.example'),
    language: 'en-GB',
  });
  const rustAndGo = tagged('2', 'b', ['Rust', 'go'], { language: 'de' });
  const plain = post('3', 'c', { language: 'en' });
  const summaries = [
    summary(rustOnRemote, reply('11', 'x', rustOnRemote)),
    summary(rustAndGo, reply('12', 'y', rustAndGo)),
    summary(plain, reply('13', 'x', plain, { tags: [{ name: 'go', url: '' }] })),
  ];
  const ids = (list: DiscussionSummary[]) => list.map((s) => s.discussion.anchor.id);

  it('counts each value once per discussion, most common first', () => {
    const counts = facetCounts(summaries);
    expect(counts.tag).toEqual([
      { value: 'go', count: 2 },
      { value: 'rust', count: 2 },
    ]);
    expect(counts.instance).toEqual([
      { value: 'home.example', count: 2 },
      { value: 'remote.example', count: 1 },
    ]);
    expect(counts.lang).toEqual([
      { value: 'en', count: 2 },
      { value: 'de', count: 1 },
    ]);
  });

  it('keeps the top twenty of a facet', () => {
    const many = Array.from({ length: 30 }, (_, n) =>
      summary(tagged(`${n + 1}`, 'a', [`t${n}`]), reply(`${n + 100}`, 'b', post('0', 'a'))),
    );
    expect(facetCounts(many).tag).toHaveLength(FACET_LIMIT);
  });

  it('ORs within a facet and ANDs across facets', () => {
    expect(ids(applyFacets(summaries, { ...NO_FACETS, tag: ['rust'] }))).toEqual(['1', '2']);
    expect(ids(applyFacets(summaries, { ...NO_FACETS, tag: ['rust', 'go'] }))).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(ids(applyFacets(summaries, { ...NO_FACETS, tag: ['go'], lang: ['en'] }))).toEqual(['3']);
    expect(applyFacets(summaries, NO_FACETS)).toHaveLength(3);
  });

  it('narrows to the discussions a person is in', () => {
    expect(ids(applyFacets(summaries, { ...NO_FACETS, person: [who('x')] }))).toEqual(['1', '3']);
  });

  it('reads the base language from the declared one', () => {
    expect(languageOf(summaries[0])).toBe('en');
    expect(languageOf(summary(post('9', 'a', { language: null })))).toBeNull();
  });

  it('toggles a value and turns choices into query parameters', () => {
    const on = toggleFacet(NO_FACETS, 'tag', 'rust');
    expect(on.tag).toEqual(['rust']);
    expect(hasFacets(on)).toBe(true);
    expect(facetParams(on)).toEqual({ tag: ['rust'], instance: null, lang: null, person: null });
    expect(toggleFacet(on, 'tag', 'rust').tag).toEqual([]);
    expect(hasFacets(NO_FACETS)).toBe(false);
  });

  it('ranks the most active people by discussions, then posts', () => {
    const active = mostActive(summaries);
    expect(active[0]).toMatchObject({ person: who('x'), discussions: 2, posts: 2 });
    expect(active.map((person) => person.person)).toHaveLength(5);
    expect(mostActive(summaries, 2)).toHaveLength(2);
  });
});
