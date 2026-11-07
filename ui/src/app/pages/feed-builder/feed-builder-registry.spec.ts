import { describe, expect, it } from 'vitest';
import { FOCUSED_TOOLS } from '../../focused-tools-all';
import { languageFolder } from '../../focused-tools';
import { HUB_COPY } from './copy/hub-copy';
import {
  FEED_BUILDER_HUB,
  FEED_BUILDER_HUBS,
  FEED_BUILDER_PAGES,
  feedBuilderHubAlternates,
  feedBuilderHubFor,
} from './feed-builder-registry';

/**
 * Keeps the communities hubs in step with the topic pages: a new language's
 * first topic page needs a hub (feed-builder-hubs.json) and its words
 * (copy/hub-copy.ts), or these fail. check-seo-build.mjs then checks the
 * built pages link to one another.
 */
describe('communities hubs', () => {
  const pageLanguages = [...new Set(FEED_BUILDER_PAGES.map((page) => page.lang))].sort();
  const hubLanguages = FEED_BUILDER_HUBS.map((hub) => hub.lang).sort();

  it('exist for exactly the languages that have topic pages', () => {
    expect(hubLanguages).toEqual(pageLanguages);
  });

  it('have words for every hub', () => {
    for (const hub of FEED_BUILDER_HUBS) expect(HUB_COPY[hub.lang], hub.lang).toBeTruthy();
    for (const hub of FEED_BUILDER_HUBS.filter((entry) => entry.lang !== 'en')) {
      const copy = HUB_COPY[hub.lang]!;
      expect(copy.title, hub.lang).not.toBe('');
      expect(copy.description, hub.lang).not.toBe('');
      expect(copy.allLanguages, hub.lang).not.toBe('');
    }
  });

  it('keep English at /communities and the others in their language folder', () => {
    expect(FEED_BUILDER_HUB).toBe('communities');
    for (const hub of FEED_BUILDER_HUBS.filter((entry) => entry.lang !== 'en'))
      expect(hub.path.startsWith(`${languageFolder(hub.lang)}/`), hub.path).toBe(true);
  });

  it('do not share an address with a topic page or a tool page', () => {
    const taken = new Set([
      ...FEED_BUILDER_PAGES.map((page) => page.path),
      ...FOCUSED_TOOLS.map((tool) => tool.path),
    ]);
    const paths = FEED_BUILDER_HUBS.map((hub) => hub.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(taken.has(path), path).toBe(false);
  });

  it('send each topic page to its own language hub, and are alternates of one another', () => {
    for (const page of FEED_BUILDER_PAGES)
      expect(feedBuilderHubFor(page.lang).lang).toBe(page.lang);
    expect(feedBuilderHubFor('ko').lang).toBe('en');
    expect(feedBuilderHubAlternates().length).toBe(FEED_BUILDER_HUBS.length);
  });
});
