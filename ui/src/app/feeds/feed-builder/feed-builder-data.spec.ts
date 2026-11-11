import { describe, expect, it } from 'vitest';
import paths from './feed-builder-paths.json';
import { FEED_CHROME } from './feed-builder-chrome';
import {
  DATA_LOADERS,
  FeedPerson,
  collectionPage,
  loadPageData,
  shelves,
} from './feed-builder-data';
import {
  FEED_BUILDER_PAGES,
  feedBuilderAlternates,
  feedBuilderPageAt,
} from './feed-builder-registry';
import { loadTopicCopy } from './copy/topic-copy';
import { weeklyUses } from './tag-activity';

const person = (acct: string, shelf: FeedPerson['shelf'], rank: number): FeedPerson => ({
  acct,
  id: '1',
  url: `https://x.social/@${acct}`,
  displayName: acct,
  avatar: '',
  bio: '',
  shelf,
  rank,
  fame: [],
  elsewhere: [],
});

describe('Feed Builder registry and data', () => {
  it('has a data loader, copy and shared words for every routed page', async () => {
    for (const { topic, lang } of FEED_BUILDER_PAGES) {
      expect(DATA_LOADERS[`${topic}.${lang}`], `${topic}/${lang} loader`).toBeDefined();
      expect(FEED_CHROME[lang], `${lang} shared words`).toBeDefined();
      const copy = await loadTopicCopy(topic, lang);
      expect(copy.description.length, `${topic}/${lang} description`).toBeLessThanOrEqual(160);
      const data = await loadPageData(topic, lang);
      expect(data.lang).toBe(lang);
      expect(data.status).toBe('reviewed');
    }
    expect(Object.keys(DATA_LOADERS).length).toBe(FEED_BUILDER_PAGES.length);
  });

  it('keeps every path unique, ASCII and in its language folder', () => {
    const all = FEED_BUILDER_PAGES.map((page) => page.path);
    expect(new Set(all).size).toBe(all.length);
    for (const { lang, path } of FEED_BUILDER_PAGES) {
      expect(path).toMatch(/^[a-z0-9/-]+$/);
      if (lang === 'en') expect(path).not.toContain('/');
      else expect(path.startsWith(`${lang}/`)).toBe(true);
    }
  });

  it('lists every language version of a topic as alternates', () => {
    const alternates = feedBuilderAlternates('science-fiction');
    expect(alternates.map((a) => a.lang).sort()).toEqual(
      Object.keys(paths['science-fiction']).sort(),
    );
    expect(feedBuilderPageAt('it/fantascienza-su-mastodon')?.lang).toBe('it');
    expect(feedBuilderPageAt('nope')).toBeUndefined();
  });

  it('groups people by shelf in shelf order, ranked, and drops empty shelves', () => {
    const grouped = shelves([
      person('c2', 'community', 2),
      person('n1', 'notable', 1),
      person('c1', 'community', 1),
    ]);
    expect(grouped.map((g) => g.shelf)).toEqual(['notable', 'community']);
    expect(grouped[1].people.map((p) => p.acct)).toEqual(['c1', 'c2']);
  });

  it('describes the page as a collection of the people it shows', async () => {
    const data = await loadPageData('science-fiction', 'ja');
    const page = collectionPage(data, { title: 'T', description: 'D' }, 'https://x/');
    const list = (page as { mainEntity: { itemListElement: unknown[] } }).mainEntity;
    expect(list.itemListElement.length).toBe(data.people.length);
    expect((page as { inLanguage: string }).inLanguage).toBe('ja');
  });

  it('counts a week of tag uses from Mastodon history', () => {
    const day = (uses: string) => ({ day: '0', uses, accounts: '1' });
    expect(weeklyUses([day('3'), day('4'), day('x')])).toBe(7);
    expect(weeklyUses(Array.from({ length: 9 }, () => day('1')))).toBe(7);
    expect(weeklyUses(undefined)).toBe(0);
  });
});
