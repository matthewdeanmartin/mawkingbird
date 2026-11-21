import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlueskyAccountPrefs } from './bluesky-account-prefs';
import { BlueskyApi } from './bluesky-api';
import { BlueskyModerationState } from './bluesky-moderation-state';
import { BskyPreference } from './bluesky-preferences';
import { BlueskySession } from './bluesky-session';
import { BlueskyStarterPacks } from './bluesky-starter-packs';

const ME = 'did:plc:me';

describe('BlueskyAccountPrefs', () => {
  let prefs: BskyPreference[];
  let profile: Record<string, unknown>;
  let request: ReturnType<typeof vi.fn>;
  let putProfile: ReturnType<typeof vi.fn>;
  let getRecord: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prefs = [
      { $type: 'app.bsky.actor.defs#feedViewPref', feed: 'at://other-feed', hideReposts: true },
      { $type: 'app.bsky.actor.defs#mutedWordsPref', items: [] },
      { $type: 'app.bsky.actor.defs#interestsPref', tags: ['art'] },
    ];
    profile = {
      $type: 'app.bsky.actor.profile',
      displayName: 'Me',
      labels: { $type: 'com.atproto.label.defs#selfLabels', values: [{ val: 'graphic-media' }] },
    };
    request = vi.fn((nsid: string, body: { preferences?: BskyPreference[] }) => {
      if (nsid === 'app.bsky.actor.putPreferences') prefs = body.preferences!;
      return of({ uri: `at://${ME}/x/1`, cid: 'c' });
    });
    putProfile = vi.fn((record: Record<string, unknown>) => {
      profile = record;
      return of({});
    });
    getRecord = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 400, error: { error: 'RecordNotFound' } })),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: BlueskySession, useValue: { session: () => ({ did: ME }) } },
        {
          provide: BlueskyApi,
          useValue: {
            getPreferences: () => of({ preferences: prefs }),
            request,
            get: getRecord,
            getOwnProfileRecord: () => of({ uri: 'u', cid: 'pc', value: profile }),
            putProfile,
          },
        },
      ],
    });
  });

  it('loads interests, the recommendation opt-out (absent means no) and the bot label', async () => {
    expect(await TestBed.inject(BlueskyAccountPrefs).load()).toEqual({
      interests: ['art'],
      hiddenFromRecommendations: false,
      bot: false,
    });
    expect(TestBed.inject(BlueskyModerationState).readingPrefsLoaded()).toBe(true);
  });

  it('writes the Following feed preference without touching another feed’s', async () => {
    await TestBed.inject(BlueskyAccountPrefs).setHomeFeed({
      hideReplies: true,
      hideRepliesByUnfollowed: true,
      hideRepliesByLikeCount: 0,
      hideReposts: false,
      hideQuotePosts: false,
    });
    expect(prefs[0]).toEqual({
      $type: 'app.bsky.actor.defs#feedViewPref',
      feed: 'at://other-feed',
      hideReposts: true,
    });
    expect(prefs.at(-1)).toMatchObject({ feed: 'home', hideReplies: true });
    expect(TestBed.inject(BlueskyModerationState).homeFeedPrefs().hideReplies).toBe(true);
  });

  it('applies a new thread sort and default controls at once', async () => {
    const account = TestBed.inject(BlueskyAccountPrefs);
    await account.setThreadSort('oldest');
    await account.setPostDefaults({ replies: ['following'], quotes: false });
    const state = TestBed.inject(BlueskyModerationState);
    expect(state.threadSort()).toBe('oldest');
    expect(state.postDefaults()).toEqual({ replies: ['following'], quotes: false });
  });

  it('adds and removes the bot self-label, keeping other self-labels', async () => {
    const account = TestBed.inject(BlueskyAccountPrefs);
    await account.setBot(true);
    expect(profile['labels']).toEqual({
      $type: 'com.atproto.label.defs#selfLabels',
      values: [{ val: 'graphic-media' }, { val: 'bot' }],
    });
    expect(putProfile.mock.calls[0][1]).toBe('pc');
    await account.setBot(false);
    expect(profile['labels']).toEqual({
      $type: 'com.atproto.label.defs#selfLabels',
      values: [{ val: 'graphic-media' }],
    });
    expect(profile['displayName']).toBe('Me');
  });

  it('declares the recommendation opt-out as the account’s own record', async () => {
    await TestBed.inject(BlueskyAccountPrefs).setHiddenFromRecommendations(true);
    expect(request).toHaveBeenCalledWith('com.atproto.repo.putRecord', {
      repo: ME,
      collection: 'app.bsky.actor.contentVisibilityDeclaration',
      rkey: 'self',
      record: {
        $type: 'app.bsky.actor.contentVisibilityDeclaration',
        hideFromAlgorithmicRecommendations: true,
      },
    });
  });

  it('opts out of someone else’s starter pack by its list', async () => {
    await TestBed.inject(BlueskyStarterPacks).optOut('at://did:plc:maker/app.bsky.graph.list/l');
    expect(request.mock.calls[0][1]).toMatchObject({
      repo: ME,
      collection: 'app.bsky.graph.referencelistoptout',
      record: { subject: 'at://did:plc:maker/app.bsky.graph.list/l' },
    });
  });
});
