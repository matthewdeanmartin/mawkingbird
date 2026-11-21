import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyApi } from './bluesky-api';
import { BlueskyFeeds } from './bluesky-feeds';
import { BlueskyPds } from './bluesky-pds';
import {
  BlueskyPreferences,
  BskyPreference,
  replacePreference,
  SAVED_FEEDS_PREF,
  savedFeedItems,
  withPinMoved,
  withPinned,
  withSaved,
  withoutSaved,
} from './bluesky-preferences';
import { BskySavedFeed } from './bluesky-types';

const item = (value: string, pinned: boolean, type = 'feed'): BskySavedFeed => ({
  id: value,
  type,
  value,
  pinned,
});
const values = (items: BskySavedFeed[]) => items.map((i) => `${i.value}${i.pinned ? '*' : ''}`);

describe('replacePreference', () => {
  const prefs: BskyPreference[] = [
    { $type: 'a', x: 1 },
    { $type: 'unknown.future#pref', keep: true },
    { $type: 'b', y: 1 },
  ];

  it('edits one entry in place and keeps every other entry, unknown ones included', () => {
    const next = replacePreference(prefs, 'a', (current) => ({ ...current, x: 2 }));
    expect(next).toEqual([
      { $type: 'a', x: 2 },
      { $type: 'unknown.future#pref', keep: true },
      { $type: 'b', y: 1 },
    ]);
  });

  it('adds a missing entry at the end and removes one on null', () => {
    expect(replacePreference(prefs, 'c', () => ({ $type: 'c' })).at(-1)).toEqual({ $type: 'c' });
    expect(replacePreference(prefs, 'b', () => null).map((p) => p.$type)).toEqual([
      'a',
      'unknown.future#pref',
    ]);
  });

  it('collapses duplicates of the edited type', () => {
    const next = replacePreference([...prefs, { $type: 'a', x: 9 }], 'a', (c) => c!);
    expect(next.filter((p) => p.$type === 'a')).toEqual([{ $type: 'a', x: 1 }]);
  });
});

describe('saved feed edits', () => {
  const items = [
    item('following', true, 'timeline'),
    item('f1', true),
    item('f2', true),
    item('f3', false),
  ];

  it('starts a new account with Following pinned', () => {
    expect(values(savedFeedItems(undefined))).toEqual(['following*']);
  });

  it('saves once, and removes', () => {
    expect(values(withSaved(items, 'f4', 'feed', false))).toEqual([
      'following*',
      'f1*',
      'f2*',
      'f3',
      'f4',
    ]);
    expect(withSaved(items, 'f1', 'feed', false)).toHaveLength(4);
    expect(values(withoutSaved(items, 'f2'))).toEqual(['following*', 'f1*', 'f3']);
  });

  it('pins after the last pinned item, and unpins to the end', () => {
    expect(values(withPinned(items, 'f3', true))).toEqual(['following*', 'f1*', 'f2*', 'f3*']);
    expect(values(withPinned(items, 'f1', false))).toEqual(['following*', 'f2*', 'f3', 'f1']);
  });

  it('moves a pinned item among the pinned ones only', () => {
    expect(values(withPinMoved(items, 'f2', -1))).toEqual(['following*', 'f2*', 'f1*', 'f3']);
    expect(values(withPinMoved(items, 'f2', 1))).toEqual(values(items));
    expect(values(withPinMoved(items, 'f3', -1))).toEqual(values(items));
  });
});

describe('BlueskyPreferences and BlueskyFeeds writes', () => {
  let prefs: BskyPreference[];
  let request: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prefs = [
      { $type: 'app.bsky.actor.defs#mutedWordsPref', items: [{ value: 'x' }] },
      {
        $type: SAVED_FEEDS_PREF,
        items: [item('following', true, 'timeline'), item('at://f1', false)],
      },
    ];
    request = vi.fn((nsid: string, body: { preferences?: BskyPreference[] }) => {
      if (nsid === 'app.bsky.actor.putPreferences') prefs = body.preferences!;
      return of({ uri: 'at://me/app.bsky.feed.like/1', cid: 'c' });
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: BlueskyPds, useValue: { resolve: () => of('') } },
        {
          provide: BlueskyApi,
          useValue: {
            getPreferences: () => of({ preferences: prefs }),
            request,
            getFeedGenerators: (uris: string[]) =>
              of({
                feeds: uris.map((uri) => ({
                  uri,
                  cid: 'cid',
                  displayName: uri,
                  creator: { handle: 'maker' },
                })),
              }),
            getList: vi.fn(),
            like: vi.fn(() => of({ uri: 'at://me/app.bsky.feed.like/1', cid: 'c' })),
            deleteRecord: vi.fn(() => of({})),
          },
        },
      ],
    });
  });

  it('pins a saved feed without touching other preferences', async () => {
    await TestBed.inject(BlueskyFeeds).setPinned('at://f1', true);
    expect(prefs[0]).toEqual({
      $type: 'app.bsky.actor.defs#mutedWordsPref',
      items: [{ value: 'x' }],
    });
    expect(values(prefs[1]['items'] as BskySavedFeed[])).toEqual(['following*', 'at://f1*']);
    expect(TestBed.inject(BlueskyFeeds).entries()?.[0]).toMatchObject({
      uri: 'at://f1',
      pinned: true,
    });
  });

  it('saves a new feed and reports it as saved', async () => {
    const feeds = TestBed.inject(BlueskyFeeds);
    await feeds.save('at://f2', 'feed');
    expect(feeds.savedUris().has('at://f2')).toBe(true);
  });

  it('re-reads before every write', async () => {
    const service = TestBed.inject(BlueskyPreferences);
    prefs = [...prefs, { $type: 'written.elsewhere#meanwhile' }];
    await service.edit('x', () => ({ $type: 'x' }));
    expect(prefs.map((p) => p.$type)).toContain('written.elsewhere#meanwhile');
  });

  it('likes and unlikes a feed by its record', async () => {
    const feeds = TestBed.inject(BlueskyFeeds);
    const likeUri = await feeds.setLiked({ uri: 'at://f1', cid: 'cid', likeUri: null }, true);
    expect(likeUri).toBe('at://me/app.bsky.feed.like/1');
    expect(await feeds.setLiked({ uri: 'at://f1', cid: 'cid', likeUri }, false)).toBeNull();
  });
});
