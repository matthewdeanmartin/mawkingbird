import { HttpParams, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../models';
import { BlueskyApi } from './bluesky-api';
import { BlueskyModeration } from './bluesky-moderation';
import {
  BlueskyModerationState,
  BSKY_MODERATION_DID,
  BskyMutedWord,
  matchMutedWord,
} from './bluesky-moderation-state';
import { BlueskySession } from './bluesky-session';

function post(content: string, ref: Record<string, unknown> = {}, author = 'did:plc:x'): Status {
  return {
    provider: 'bluesky',
    content,
    account: { id: `bsky:${author}` },
    providerRef: ref,
  } as unknown as Status;
}

const word = (value: string, extra: Partial<BskyMutedWord> = {}): BskyMutedWord => ({
  value,
  targets: ['content', 'tag'],
  ...extra,
});

/** Bluesky leaves muted words to each client; these are bsky.app's rules. */
describe('matchMutedWord', () => {
  it('matches whole words, phrases and tags, ignoring case', () => {
    expect(matchMutedWord(post('<p>Spoilers ahead</p>'), [word('spoilers')], 'me')).not.toBeNull();
    expect(matchMutedWord(post('<p>unspoilersome</p>'), [word('spoilers')], 'me')).toBeNull();
    expect(
      matchMutedWord(post('<p>the big game tonight</p>'), [word('big game')], 'me'),
    ).not.toBeNull();
    expect(
      matchMutedWord(post('<p>go <a>#Football</a>!</p>'), [word('football')], 'me'),
    ).not.toBeNull();
  });

  it('limits a tags-only word to hashtags', () => {
    const tagOnly = word('football', { targets: ['tag'] });
    expect(matchMutedWord(post('<p>football is on</p>'), [tagOnly], 'me')).toBeNull();
    expect(matchMutedWord(post('<p>#football is on</p>'), [tagOnly], 'me')).not.toBeNull();
  });

  it('skips expired words, followed authors when asked, and the viewer’s own posts', () => {
    const expired = word('spoilers', { expiresAt: '2000-01-01T00:00:00Z' });
    expect(matchMutedWord(post('<p>spoilers</p>'), [expired], 'me')).toBeNull();

    const notFollowing = word('spoilers', { actorTarget: 'exclude-following' });
    expect(
      matchMutedWord(post('<p>spoilers</p>', { authorFollowed: true }), [notFollowing], 'me'),
    ).toBeNull();
    expect(matchMutedWord(post('<p>spoilers</p>'), [notFollowing], 'me')).not.toBeNull();

    expect(
      matchMutedWord(post('<p>spoilers</p>', {}, 'did:plc:me'), [word('spoilers')], 'did:plc:me'),
    ).toBeNull();
  });

  it('never applies to other networks', () => {
    const mastodon = { ...post('<p>spoilers</p>'), provider: 'mastodon' } as Status;
    expect(matchMutedWord(mastodon, [word('spoilers')], 'me')).toBeNull();
  });
});

/**
 * Preferences are one list bsky.app shares; putPreferences replaces all of it.
 * A change here must re-read the list and keep every other item intact.
 */
describe('BlueskyModeration', () => {
  let prefs: { $type: string; [key: string]: unknown }[];
  let request: ReturnType<typeof vi.fn>;
  let get: ReturnType<typeof vi.fn>;
  let moderation: BlueskyModeration;
  let state: BlueskyModerationState;

  beforeEach(() => {
    prefs = [
      { $type: 'app.bsky.actor.defs#savedFeedsPrefV2', items: [{ id: 'f', value: 'feed' }] },
      {
        $type: 'app.bsky.actor.defs#mutedWordsPref',
        items: [{ value: 'old', targets: ['content'] }],
      },
    ];
    request = vi.fn((nsid: string, body: { preferences?: typeof prefs }) => {
      if (nsid === 'app.bsky.actor.putPreferences') prefs = body.preferences!;
      return of({});
    });
    get = vi.fn((nsid: string, params: HttpParams) => {
      if (nsid === 'app.bsky.labeler.getServices') {
        return of({
          views: params.getAll('dids')!.includes('did:plc:labeler')
            ? [{ creator: { did: 'did:plc:labeler', handle: 'mod.example', displayName: 'Mod' } }]
            : [],
        });
      }
      return of({ lists: [] });
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BlueskyApi,
          useValue: {
            getPreferences: () => of({ preferences: prefs }),
            request,
            get,
            resolveHandle: (handle: string) =>
              of({ did: handle === 'mod.example' ? 'did:plc:labeler' : 'did:plc:owner' }),
            deleteRecord: vi.fn(() => of({})),
          },
        },
        { provide: BlueskySession, useValue: { session: () => ({ did: 'did:plc:me' }) } },
      ],
    });
    moderation = TestBed.inject(BlueskyModeration);
    state = TestBed.inject(BlueskyModerationState);
  });

  it('loads muted words into the state the reader applies', async () => {
    await moderation.ensureLoaded();
    expect(state.mutedWords().map((w) => w.value)).toEqual(['old']);
    expect(state.viewerDid()).toBe('did:plc:me');
  });

  it('adds and removes a muted word without touching other preferences', async () => {
    await moderation.addMutedWord(word('#Spoilers'));

    const feeds = prefs.find((p) => p.$type === 'app.bsky.actor.defs#savedFeedsPrefV2');
    expect(feeds).toEqual({
      $type: 'app.bsky.actor.defs#savedFeedsPrefV2',
      items: [{ id: 'f', value: 'feed' }],
    });
    expect(state.mutedWords().map((w) => w.value)).toEqual(['old', 'Spoilers']);

    await moderation.removeMutedWord('old');
    expect(state.mutedWords().map((w) => w.value)).toEqual(['Spoilers']);
    expect(prefs.some((p) => p.$type === 'app.bsky.actor.defs#savedFeedsPrefV2')).toBe(true);
  });

  it('mutes a whole list in one write, with one rule, dropping repeats', async () => {
    const rule = { targets: ['tag'] as BskyMutedWord['targets'], actorTarget: 'all' as const };
    await moderation.addMutedWords(
      ['xyzzy', '#Plugh', 'XYZZY', '  ', 'OLD'].map((value) => ({ value, ...rule })),
    );
    expect(request).toHaveBeenCalledTimes(1);
    const muted = prefs.find((p) => p.$type === 'app.bsky.actor.defs#mutedWordsPref')!['items'];
    // 'OLD' replaced 'old' with the new rule; the second xyzzy is the one kept.
    expect(muted).toEqual([
      { value: 'Plugh', ...rule },
      { value: 'XYZZY', ...rule },
      { value: 'OLD', ...rule },
    ]);
    expect(state.mutedWords().length).toBe(3);
  });

  it('shows stored duplicates once, cleans them on the next write, and unmutes all copies', async () => {
    prefs[1]['items'] = [word('xyzzy'), word('#XYZZY'), word('keep')];
    await moderation.ensureLoaded();
    expect(state.mutedWords().map((w) => w.value)).toEqual(['#XYZZY', 'keep']);

    await moderation.removeMutedWord('#XYZZY');
    expect(state.mutedWords().map((w) => w.value)).toEqual(['keep']);
    expect(prefs[prefs.length - 1]['items']).toEqual([word('keep')]);
  });

  it('subscribes to a moderation service only when it is one', async () => {
    await moderation.addLabeler('@mod.example');
    expect(state.labelers()).toEqual(['did:plc:labeler']);

    await expect(moderation.addLabeler('someone.example')).rejects.toThrow(
      'not a Bluesky moderation service',
    );
    expect(state.labelers()).toEqual(['did:plc:labeler']);
  });

  it('turns a bsky.app list address into a mute or a block', async () => {
    await moderation.subscribeList('https://bsky.app/profile/owner.example/lists/3abc', 'mute');
    expect(request).toHaveBeenCalledWith('app.bsky.graph.muteActorList', {
      list: 'at://did:plc:owner/app.bsky.graph.list/3abc',
    });

    await moderation.subscribeList('at://did:plc:owner/app.bsky.graph.list/3abc', 'block');
    expect(request).toHaveBeenCalledWith(
      'com.atproto.repo.createRecord',
      expect.objectContaining({
        repo: 'did:plc:me',
        collection: 'app.bsky.graph.listblock',
        record: expect.objectContaining({ subject: 'at://did:plc:owner/app.bsky.graph.list/3abc' }),
      }),
    );

    await expect(moderation.subscribeList('https://example.com/x', 'mute')).rejects.toThrow(
      'not a Bluesky list address',
    );
  });

  it('mutes and unmutes a thread by its root', async () => {
    await moderation.setThreadMuted('at://root', true);
    await moderation.setThreadMuted('at://root', false);
    expect(request).toHaveBeenCalledWith('app.bsky.graph.muteThread', { root: 'at://root' });
    expect(request).toHaveBeenCalledWith('app.bsky.graph.unmuteThread', { root: 'at://root' });
  });
});

/** Labels from subscribed services only arrive when the AppView is asked for them. */
describe('BlueskyApi moderation-service header', () => {
  it('asks for subscribed services’ labels on reads, but not on proxied chat calls', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(BlueskyModerationState).labelers.set(['did:plc:labeler']);
    const api = TestBed.inject(BlueskyApi);
    const http = TestBed.inject(HttpTestingController);

    api.getProfile('someone.example').subscribe();
    const read = http.expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfile'));
    expect(read.request.headers.get('atproto-accept-labelers')).toBe(
      `${BSKY_MODERATION_DID}, did:plc:labeler`,
    );

    TestBed.inject(BlueskyModerationState).labelers.set([]);
    api.getProfile('someone.example').subscribe();
    const plain = http.expectOne((r) => r.url.endsWith('/xrpc/app.bsky.actor.getProfile'));
    expect(plain.request.headers.has('atproto-accept-labelers')).toBe(false);
  });
});
