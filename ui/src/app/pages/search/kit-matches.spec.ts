import { describe, expect, it } from 'vitest';
import { STARTER_KITS } from '../../starter-collection';
import { kitMatchesFor } from './kit-matches';

/**
 * Until this existed, a starter kit was reachable only from the Find Friends
 * hub — so a reader who saw one and wanted it back had no way to ask for it by
 * name, and nobody searching a topic was told a hand-picked set of people for
 * it ships with the app.
 */
describe('kitMatchesFor', () => {
  it('finds a kit by a word in its title', () => {
    const universal = STARTER_KITS.find((k) => k.slug === 'starter')!;
    const word = universal.title.split(' ')[0];

    const matches = kitMatchesFor(word);

    expect(matches.map((m) => m.title)).toContain(universal.title);
  });

  it('finds a set by a word in its description, not just its name', () => {
    // The blurb is where the topic words live; a title-only match would miss
    // every reader who searched for what a kit is *about*.
    const universal = STARTER_KITS.find((k) => k.slug === 'starter')!;
    const fromBlurb = universal.blurb.split(/[\s,.—]+/).find((w) => w.length > 6)!;

    const matches = kitMatchesFor(fromBlurb);

    expect(matches.length).toBeGreaterThan(0);
  });

  it('carries a working in-app link and a real account count', () => {
    const universal = STARTER_KITS.find((k) => k.slug === 'starter')!;

    const [match] = kitMatchesFor(universal.title.split(' ')[0]);

    expect(match.link.startsWith('/collections')).toBe(true);
    expect(match.accountCount).toBeGreaterThan(0);
  });

  it('ignores the # and @ a reader may have typed', () => {
    const universal = STARTER_KITS.find((k) => k.slug === 'starter')!;
    const word = universal.title.split(' ')[0];

    expect(kitMatchesFor(`#${word}`).length).toBeGreaterThan(0);
  });

  it('stays quiet for a query too short to mean anything', () => {
    // One character matches most of the corpus, which is noise, not discovery.
    expect(kitMatchesFor('a')).toEqual([]);
    expect(kitMatchesFor('  ')).toEqual([]);
  });

  it('never floods the results with more than a few', () => {
    // 'a' is excluded by length, so use a common word that will hit widely.
    expect(kitMatchesFor('the', 3).length).toBeLessThanOrEqual(3);
  });

  it('matches translated titles in known languages and excludes foreign variants', () => {
    const matches = kitMatchesFor('Technologie', 20, new Set(['de']), 'de');
    expect(matches.map((match) => match.link)).toContain(
      '/collections/starter/catalog-de-technology',
    );
    expect(matches.map((match) => match.link)).not.toContain(
      '/collections/starter/catalog-fr-technology',
    );
    expect(matches.find((match) => match.link.endsWith('catalog-de-technology'))?.title).toBe(
      'Technologie · de',
    );
  });
});
