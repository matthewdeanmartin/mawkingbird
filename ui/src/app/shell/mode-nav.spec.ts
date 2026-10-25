import { describe, expect, it } from 'vitest';
import { APP_MODES } from '../app-mode';
import { MODE_ENTRIES, MODE_NAV, suggestedMode } from './mode-nav';

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

  it('gives every mode five tabs, and puts Search in the same slot wherever there is one', () => {
    // The owner asked for symmetry: Home, five tabs, the switcher.
    for (const mode of APP_MODES) expect(MODE_NAV[mode]).toHaveLength(mode === 'radio' ? 2 : 5);
    expect(MODE_NAV.radio.map((tab) => tab.id)).toEqual(['player', 'studio']);
    expect(MODE_NAV.mastodon[3].id).toBe('search');
    expect(MODE_NAV.video[3].id).toBe('search');
  });

  it('does not claim lookalike paths', () => {
    expect(MODE_NAV.radio.filter((tab) => tab.active('/radio')).map((tab) => tab.id)).toEqual([
      'player',
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
