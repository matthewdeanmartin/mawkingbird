import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { WatchPartyPrefs } from './watch-party-prefs';

describe('WatchPartyPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('defaults to the compact chat with live updates', () => {
    const prefs = TestBed.inject(WatchPartyPrefs);
    expect([prefs.view(), prefs.refresh()]).toEqual(['compact', 'stream']);
  });

  it('remembers choices across visits and ignores unknown stored values', () => {
    const prefs = TestBed.inject(WatchPartyPrefs);
    prefs.setView('cards');
    prefs.setRefresh('poll60');
    TestBed.resetTestingModule();
    const again = TestBed.inject(WatchPartyPrefs);
    expect([again.view(), again.refresh()]).toEqual(['cards', 'poll60']);

    localStorage.setItem(
      'mockingbird_watch_party',
      JSON.stringify({ view: 'huge', refresh: 'poll1' }),
    );
    TestBed.resetTestingModule();
    const cleaned = TestBed.inject(WatchPartyPrefs);
    expect([cleaned.view(), cleaned.refresh()]).toEqual(['compact', 'stream']);
  });

  it('no longer stores which conversation to show: Watch picks it per visit', () => {
    // A mode saved by an older version is ignored, and dropped on the next save.
    localStorage.setItem(
      'mockingbird_watch_party',
      JSON.stringify({ view: 'cards', mode: 'hashtag', refresh: 'manual' }),
    );
    const prefs = TestBed.inject(WatchPartyPrefs);
    expect(prefs.view()).toBe('cards');
    prefs.setRefresh('poll5');
    expect(JSON.parse(localStorage.getItem('mockingbird_watch_party')!)).toEqual({
      view: 'cards',
      refresh: 'poll5',
    });
  });
});
