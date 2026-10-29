import { describe, expect, it } from 'vitest';
import { APP_MODES } from '../app-mode';
import { FOCUSED_APPS, focusedAppFor, MODE_ENTRIES, MODE_NAV, suggestedMode } from './mode-nav';

describe('MODE_NAV', () => {
  it('leaves Home to the shell, as the fixed first slot of every mode', () => {
    for (const mode of APP_MODES) {
      expect(MODE_NAV[mode].map((item) => item.link)).not.toContain('/home');
    }
  });

  it('gives every icon one meaning across the whole menu', () => {
    // spec/top_level_menu.md rule 3: a bell must not mean Mastodon
    // notifications in one mode and "new upload" in another.
    const meaning = new Map<string, string>();
    const glyphs = [
      ...APP_MODES.flatMap((mode) => MODE_NAV[mode]),
      ...APP_MODES.map((mode) => MODE_ENTRIES[mode]),
    ];
    for (const { icon, labelKey } of glyphs) {
      expect(meaning.get(icon) ?? labelKey, `${labelKey} reuses ${meaning.get(icon)}`).toBe(
        labelKey,
      );
      meaning.set(icon, labelKey);
    }
  });

  it('keeps item ids unique within a mode', () => {
    for (const mode of APP_MODES) {
      const ids = MODE_NAV[mode].map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('marks exactly one RSS tab current, whether or not the kits are showing', () => {
    const active = (url: string) =>
      MODE_NAV.rss.filter((item) => item.active(url)).map((item) => item.id);
    expect(active('/rss')).toEqual(['reader']);
    expect(active('/rss?folder=News')).toEqual(['reader']);
    expect(active('/rss?view=kits')).toEqual(['kits']);
    expect(active('/rss?folder=News&view=kits')).toEqual(['kits']);
    expect(active('/rss?filter=starred')).toEqual(['readLater']);
    expect(active('/rss?folder=News&filter=starred')).toEqual(['readLater']);
    expect(active('/bookmarks?tab=read-later')).toEqual(['library']);
    expect(active('/bookmarks')).toEqual([]);
    expect(active('/settings/rss')).toEqual(['manage']);
  });

  it('marks exactly one Video tab current', () => {
    const active = (url: string) =>
      MODE_NAV.video.filter((item) => item.active(url)).map((item) => item.id);
    expect(active('/videos')).toEqual(['youtube']);
    expect(active('/videos?channel=UC123')).toEqual(['youtube']);
    expect(active('/videos/fedi')).toEqual(['fedi']);
    expect(active('/videos/queue')).toEqual(['queue']);
    expect(active('/videos/search?q=cats')).toEqual(['search']);
    expect(active('/bookmarks?view=video')).toEqual(['saved']);
    expect(active('/bookmarks?view=media')).toEqual([]);
  });

  it('keeps the mode navigation slots and promotes Playlist and Settings in Radio', () => {
    // Radio has dedicated Playlist, player, Studio, and Settings destinations.
    for (const mode of APP_MODES) expect(MODE_NAV[mode]).toHaveLength(mode === 'radio' ? 4 : 5);
    expect(MODE_NAV.radio.map((tab) => tab.id)).toEqual([
      'playlist',
      'player',
      'studio',
      'settings',
    ]);
    expect(MODE_NAV.mastodon[3].id).toBe('search');
    expect(MODE_NAV.video[3].id).toBe('search');
  });

  it('selects a single top-level destination for every Radio view', () => {
    const active = (url: string) =>
      MODE_NAV.radio.filter((tab) => tab.active(url)).map((tab) => tab.id);
    for (const view of ['search', 'publish', 'saved', 'mine', 'playlist']) {
      expect(active('/radio?view=' + view)).toEqual(['playlist']);
    }
    expect(active('/radio?view=radio')).toEqual(['player']);
    expect(active('/radio?view=settings')).toEqual(['settings']);
  });

  it('marks exactly one Forum tab current, whatever the sort or source', () => {
    const active = (url: string) =>
      MODE_NAV.forum.filter((item) => item.active(url)).map((item) => item.id);
    expect(active('/forum')).toEqual(['talk']);
    expect(active('/forum?sort=popular&source=tag:rust')).toEqual(['talk']);
    expect(active('/forum?filter=talk')).toEqual(['talk']);
    expect(active('/forum?filter=asked')).toEqual(['asked']);
    expect(active('/forum?source=list:7&filter=friends')).toEqual(['friends']);
    expect(active('/forum?filter=mine')).toEqual(['mine']);
    expect(active('/forum?filter=joined')).toEqual(['joined']);
    expect(active('/forums')).toEqual([]);
    expect(
      MODE_NAV.forum.filter((item) => item.requires === 'signedIn').map((item) => item.id),
    ).toEqual(['mine', 'joined']);
  });

  it('does not claim lookalike paths', () => {
    expect(MODE_NAV.radio.filter((tab) => tab.active('/radio')).map((tab) => tab.id)).toEqual([
      'playlist',
    ]);
    expect(
      MODE_NAV.radio.filter((tab) => tab.active('/radio/studio')).map((tab) => tab.id),
    ).toEqual(['studio']);
    expect(MODE_NAV.radio.some((tab) => tab.active('/radiofoo'))).toBe(false);
    expect(MODE_NAV.mastodon.find((item) => item.id === 'feeds')!.active('/feedsx')).toBe(false);
    expect(MODE_NAV.mastodon.find((item) => item.id === 'feeds')!.active('/feeds/lists')).toBe(
      true,
    );
  });
});

describe('suggestedMode', () => {
  it('offers RSS from Mastodon and Mastodon from everywhere else', () => {
    expect(suggestedMode('mastodon')).toBe('rss');
    expect(suggestedMode('rss')).toBe('mastodon');
    expect(suggestedMode('video')).toBe('mastodon');
  });
});

describe('FOCUSED_APPS', () => {
  it('claims its own pages and nothing that merely looks like them', () => {
    expect(focusedAppFor('/twitter-to-mastodon')?.id).toBe('twitter-import');
    expect(focusedAppFor('/twitter-to-mastodon/invite?x=1')?.id).toBe('twitter-import');
    expect(focusedAppFor('/twitter-to-mastodon-old')).toBeNull();
    expect(focusedAppFor('/home')).toBeNull();
  });

  it('marks exactly one Twitter importer tab current', () => {
    const [app] = FOCUSED_APPS;
    for (const url of ['/twitter-to-mastodon', '/twitter-to-mastodon/invite']) {
      expect(
        app.items.filter((item) => item.active(url)),
        url,
      ).toHaveLength(1);
    }
  });

  it('leaves Home to the shell and keeps every icon to one meaning', () => {
    const meaning = new Map<string, string>();
    const glyphs = [
      ...APP_MODES.flatMap((mode) => MODE_NAV[mode]),
      ...APP_MODES.map((mode) => MODE_ENTRIES[mode]),
      ...FOCUSED_APPS.flatMap((app) => app.items),
    ];
    for (const { icon, labelKey } of glyphs) {
      expect(meaning.get(icon) ?? labelKey, `${labelKey} reuses ${meaning.get(icon)}`).toBe(
        labelKey,
      );
      meaning.set(icon, labelKey);
    }
    for (const app of FOCUSED_APPS) {
      expect(app.items.map((item) => item.link)).not.toContain('/home');
    }
  });
});

describe('every focused app', () => {
  it('marks exactly one of its tabs current on each of its pages', () => {
    for (const app of FOCUSED_APPS) {
      for (const item of app.items) {
        expect(focusedAppFor(item.link)?.id, item.link).toBe(app.id);
        expect(
          app.items.filter((other) => other.active(item.link)),
          item.link,
        ).toHaveLength(1);
      }
    }
  });
});
