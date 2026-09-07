import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, ClientPrefs, homeWindowMs, READER_FONT_OPTIONS } from './client-prefs';

const PREFS_KEY = 'mockingbird_client_prefs';
const TOKEN_KEY = 'mastodon_mock_token';
const HIDDEN_BASE = 'mockingbird_hidden_providers';

describe('ClientPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-accent');
  });

  function create(): ClientPrefs {
    const prefs = TestBed.inject(ClientPrefs);
    TestBed.tick(); // flush the apply/persist effect
    return prefs;
  }

  it('defaults to auto theme, blue accent, posting guards off, fixed blue checks', () => {
    const prefs = create();
    expect(prefs.themeMode()).toBe('auto');
    expect(prefs.accentId()).toBe('blue');
    expect(prefs.confirmBeforePost()).toBe(false);
    expect(prefs.delayedSend()).toBe(false);
    expect(prefs.verifiedMode()).toBe('fixed');
  });

  it('defaults to the hand-drawn illustrations and round-trips the choice', () => {
    const prefs = create();
    expect(prefs.artStyle()).toBe('hand');

    prefs.setArtStyle('ai');
    TestBed.tick();
    expect(document.documentElement.getAttribute('data-art')).toBe('ai');
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).artStyle).toBe('ai');

    // A stored choice must survive a reload, or the toggle looks broken.
    TestBed.resetTestingModule();
    expect(create().artStyle()).toBe('ai');
  });

  it('ignores a junk stored illustration set rather than drawing nothing', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ artStyle: 'crayon' }));
    expect(create().artStyle()).toBe('hand');
  });

  it('applies data-theme and data-accent to the document root', () => {
    const prefs = create();
    prefs.setThemeMode('dark');
    prefs.setAccent('purple');
    TestBed.tick();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-accent')).toBe('purple');
    expect(prefs.resolvedTheme()).toBe('dark');
  });

  it('persists changes to localStorage', () => {
    const prefs = create();
    prefs.setThemeMode('light');
    prefs.setDelayedSend(true);
    prefs.setVerifiedMode('everyone');
    TestBed.tick();

    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    expect(stored.themeMode).toBe('light');
    expect(stored.delayedSend).toBe(true);
    expect(stored.confirmBeforePost).toBe(false);
    expect(stored.verifiedMode).toBe('everyone');
  });

  it('persists custom terminology and preserves it while another preset is selected', () => {
    const prefs = create();
    prefs.setCustomTerminologyField('post', 'notelet');
    prefs.setCustomTerminologyField('posts', 'notelets');
    prefs.setPostNoun('custom');
    TestBed.tick();

    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    expect(stored.postNoun).toBe('custom');
    expect(stored.customTerminology.post).toBe('notelet');

    TestBed.resetTestingModule();
    const restored = create();
    expect(restored.postNoun()).toBe('custom');
    expect(restored.customTerminology().posts).toBe('notelets');
    restored.setPostNoun('toot');
    expect(restored.customTerminology().post).toBe('notelet');
  });

  it('restores persisted prefs on construction', () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        themeMode: 'dark',
        accentId: 'green',
        confirmBeforePost: true,
        verifiedMode: 'famous',
        readerFontSize: 21,
      }),
    );
    const prefs = create();

    expect(prefs.themeMode()).toBe('dark');
    expect(prefs.accentId()).toBe('green');
    expect(prefs.confirmBeforePost()).toBe(true);
    expect(prefs.delayedSend()).toBe(false);
    expect(prefs.verifiedMode()).toBe('famous');
    expect(prefs.readerFontSize()).toBe(21);
  });

  it('migrates the legacy combined undoSend pref onto both new halves', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ undoSend: true }));
    const prefs = create();

    expect(prefs.confirmBeforePost()).toBe(true);
    expect(prefs.delayedSend()).toBe(true);
  });

  it('ignores corrupt or unknown stored values', () => {
    localStorage.setItem(PREFS_KEY, '{not json');
    expect(create().themeMode()).toBe('auto');
  });

  it('rejects unknown accent ids and out-of-range reader font sizes', () => {
    const prefs = create();
    prefs.setAccent('hotdog-stand');
    expect(prefs.accentId()).toBe('blue');

    prefs.setReaderFontSize(99);
    expect(prefs.readerFontSize()).toBe(24);
    prefs.setReaderFontSize(1);
    expect(prefs.readerFontSize()).toBe(15);
  });

  it('ships at least the classic blue plus five alternative accents', () => {
    expect(ACCENT_PRESETS[0].id).toBe('blue');
    expect(ACCENT_PRESETS.length).toBeGreaterThanOrEqual(6);
  });

  it('offers named readable reader faces without collapsing them into generic families', () => {
    const labels = READER_FONT_OPTIONS.map((font) => font.label);
    expect(labels).toEqual([
      'Georgia',
      'Charter',
      'Palatino',
      'System Sans',
      'Helvetica Neue',
      'Inter',
      'Verdana',
      'Monospace',
    ]);
  });

  it('applies the literal Helvetica Neue and Inter local font stacks', () => {
    const prefs = create();

    prefs.setReaderFontFamily('helvetica-neue');
    TestBed.tick();
    expect(document.documentElement.style.getPropertyValue('--reader-font-family')).toContain(
      "'Helvetica Neue', Helvetica, Arial",
    );

    prefs.setReaderFontFamily('inter');
    TestBed.tick();
    expect(document.documentElement.style.getPropertyValue('--reader-font-family')).toContain(
      'Inter, -apple-system',
    );
  });

  // ---------------------------------------------------------------- feed size

  it('defaults feed size to 20 min / 500 max', () => {
    const prefs = create();
    expect(prefs.feedMin()).toBe(20);
    expect(prefs.feedMax()).toBe(500);
  });

  it('clamps feed min to the floor and never above the current max', () => {
    const prefs = create();
    prefs.setFeedMin(2); // below floor
    expect(prefs.feedMin()).toBe(5);

    prefs.setFeedMax(30);
    prefs.setFeedMin(100); // above max
    expect(prefs.feedMin()).toBe(30);
  });

  it('lowering the max below the current min pulls the min down too', () => {
    const prefs = create();
    prefs.setFeedMin(200);
    prefs.setFeedMax(50);
    expect(prefs.feedMax()).toBe(50);
    expect(prefs.feedMin()).toBe(50);
  });

  it('persists and restores feed size prefs', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ feedMin: 30, feedMax: 300 }));
    const prefs = create();
    expect(prefs.feedMin()).toBe(30);
    expect(prefs.feedMax()).toBe(300);
  });

  // ------------------------------------------------ hidden providers (scoped)

  /** Rebuild ClientPrefs from scratch, as an account switch's hard reload would. */
  function recreate(): ClientPrefs {
    TestBed.resetTestingModule();
    return create();
  }

  it('persists hidden providers to an account-scoped key, not the global blob', () => {
    localStorage.setItem(TOKEN_KEY, 'token-one');
    const prefs = create();
    prefs.toggleProvider('bluesky');
    TestBed.tick();

    // Not in the shared prefs blob anymore.
    const blob = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    expect(blob.hiddenProviders).toBeUndefined();
    // In a key scoped to this account's token.
    const scoped = Object.keys(localStorage).find(
      (k) => k.startsWith(HIDDEN_BASE + '_') && k !== HIDDEN_BASE,
    );
    expect(scoped).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(scoped!) ?? '[]')).toEqual(['bluesky']);
  });

  it("does not leak one account's hidden providers to another", () => {
    localStorage.setItem(TOKEN_KEY, 'token-one');
    const one = create();
    one.toggleProvider('bluesky');
    TestBed.tick();

    // Switch accounts (hard reload rebuilds ClientPrefs under the new token).
    localStorage.setItem(TOKEN_KEY, 'token-two');
    const two = recreate();
    expect(two.hiddenProviders()).toEqual([]);
    expect(two.isProviderVisible('bluesky')).toBe(true);

    // Switching back restores the first account's filter.
    localStorage.setItem(TOKEN_KEY, 'token-one');
    const oneAgain = recreate();
    expect(oneAgain.hiddenProviders()).toEqual(['bluesky']);
  });

  it('migrates a legacy blob hiddenProviders once, then strips it from the blob', () => {
    localStorage.setItem(TOKEN_KEY, 'token-one');
    localStorage.setItem(PREFS_KEY, JSON.stringify({ hiddenProviders: ['mastodon', 'rss'] }));
    const prefs = create();
    expect(prefs.hiddenProviders()).toEqual(['mastodon', 'rss']);

    // The legacy copy is removed from the shared blob so other accounts can't inherit it.
    const blob = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    expect(blob.hiddenProviders).toBeUndefined();

    // A different account loading afterward starts clean.
    localStorage.setItem(TOKEN_KEY, 'token-two');
    const other = recreate();
    expect(other.hiddenProviders()).toEqual([]);
  });

  it('persists thoughtful posting, off by default', () => {
    const prefs = create();
    expect(prefs.thoughtfulPosting()).toBe(false);
    prefs.setThoughtfulPosting(true);
    TestBed.tick();

    expect(recreate().thoughtfulPosting()).toBe(true);
  });

  // ------------------------------------------------- cached posting default
  //
  // A mirror of the server's `source.privacy`, so the composer can open on the
  // user's real default without spending a request to find out what it is.

  it('defaults to public with nothing cached', () => {
    expect(create().defaultVisibility()).toBe('public');
  });

  it('caches a visibility and survives a rebuild', () => {
    localStorage.setItem(TOKEN_KEY, 'token-one');
    const prefs = create();
    prefs.setDefaultVisibility('private');
    TestBed.tick();

    expect(recreate().defaultVisibility()).toBe('private');
  });

  it('ignores a value that is not a visibility rather than resetting the cache', () => {
    const prefs = create();
    prefs.setDefaultVisibility('unlisted');
    // A partial response shouldn't silently widen the user's default back to public.
    prefs.setDefaultVisibility(undefined);
    prefs.setDefaultVisibility('nonsense');
    prefs.setDefaultVisibility(null);
    expect(prefs.defaultVisibility()).toBe('unlisted');
  });

  it("does not leak one account's posting default to another", () => {
    localStorage.setItem(TOKEN_KEY, 'token-one');
    const one = create();
    one.setDefaultVisibility('direct');
    TestBed.tick();

    localStorage.setItem(TOKEN_KEY, 'token-two');
    expect(recreate().defaultVisibility()).toBe('public');
  });

  it('defaults the home window to the last 24 hours', () => {
    expect(TestBed.inject(ClientPrefs).homeWindow()).toBe('all');
    expect(homeWindowMs('today')).toBe(24 * 60 * 60 * 1000);
    expect(homeWindowMs('week')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(homeWindowMs('all')).toBeNull();
  });

  it('remembers a chosen home window across a reload', () => {
    TestBed.inject(ClientPrefs).setHomeWindow('week');
    // Persistence runs in an effect, so it needs a flush before the value is
    // in localStorage for the next instance to read.
    TestBed.tick();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(ClientPrefs).homeWindow()).toBe('week');
  });

  it('migrates the old persisted Today default to Everything', () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ homeWindow: 'today' }));
    expect(TestBed.inject(ClientPrefs).homeWindow()).toBe('all');
  });
});
