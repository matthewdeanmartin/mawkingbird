import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { WatchPartyPrefs } from './watch-party-prefs';

describe('WatchPartyPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('defaults to the compact chat of replies and hashtag, updating live', () => {
    const prefs = TestBed.inject(WatchPartyPrefs);
    expect([prefs.view(), prefs.mode(), prefs.refresh()]).toEqual(['compact', 'both', 'stream']);
  });

  it('remembers choices across visits and ignores unknown stored values', () => {
    const prefs = TestBed.inject(WatchPartyPrefs);
    prefs.setView('cards');
    prefs.setMode('hashtag');
    prefs.setRefresh('poll60');
    TestBed.resetTestingModule();
    const again = TestBed.inject(WatchPartyPrefs);
    expect([again.view(), again.mode(), again.refresh()]).toEqual(['cards', 'hashtag', 'poll60']);

    localStorage.setItem(
      'mockingbird_watch_party',
      JSON.stringify({ view: 'huge', mode: 7, refresh: 'poll1' }),
    );
    TestBed.resetTestingModule();
    const cleaned = TestBed.inject(WatchPartyPrefs);
    expect([cleaned.view(), cleaned.mode(), cleaned.refresh()]).toEqual([
      'compact',
      'both',
      'stream',
    ]);
  });
});
