import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { FollowTrust } from '../../accounts/follow-trust';
import { Status } from '../../platform/api/models';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { Server } from '../../platform/http/server';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { Playback } from '../video-player/playback';
import { PlaylistPublisher } from './playlist-publisher';
import { RadioPlayer } from './radio-player';
import { RadioPlaylists } from './radio-playlists';

describe('PlaylistPublisher', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let lists: RadioPlaylists;
  let publisher: PlaylistPublisher;
  let player: RadioPlayer;
  let posted = 0;
  beforeEach(() => {
    localStorage.clear();
    posted = 0;
    api = {
      postStatus: vi.fn((text: string) =>
        of({ id: `p${++posted}`, url: `https://home.example/@me/p${posted}`, content: text }),
      ),
      editStatus: vi.fn((id: string) => of({ id })),
      deleteStatus: vi.fn((id: string) => of({ id })),
      verifyCredentials: vi.fn(() => of({ id: 'me' })),
      getAccountStatuses: vi.fn(() => of([])),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: api },
        { provide: Auth, useValue: { kind: signal('mastodon'), token: signal('test') } },
        { provide: Server, useValue: { baseUrl: signal('https://home.example') } },
        { provide: FollowTrust, useValue: { revision: signal(0) } },
        {
          provide: TrustedAccounts,
          useValue: { cwExpanded: () => false, sensitiveShown: () => false },
        },
        { provide: Playback, useValue: { register: () => () => undefined, started: vi.fn() } },
        { provide: AnonymousPublicApi, useValue: {} },
      ],
    });
    lists = TestBed.inject(RadioPlaylists);
    publisher = TestBed.inject(PlaylistPublisher);
    player = TestBed.inject(RadioPlayer);
  });

  function tracks(...names: string[]) {
    return names.flatMap((name) => lists.fromUrl(`https://audio.example/${name}.mp3`));
  }
  const row = () => lists.saved()[0];

  it('publishes a named root and chained one-track replies, unlisted under a public root', async () => {
    const id = lists.save('Sea songs', tracks('one', 'two'))!;
    // The root, its edit adding the player link, and two replies.
    expect(publisher.cost(publisher.plan(row()))).toBe(4);
    expect(await publisher.publish(id, 'public')).toBe(true);
    const calls = api['postStatus'].mock.calls;
    expect(calls[0][0]).toContain('Sea songs');
    expect(calls[0][1]).toEqual({ visibility: 'public' });
    expect(calls[1][0]).toBe('1. one\nhttps://audio.example/one.mp3');
    expect(calls[1][1]).toEqual({ inReplyToId: 'p1', visibility: 'unlisted' });
    expect(calls[2][1]).toEqual({ inReplyToId: 'p2', visibility: 'unlisted' });
    expect(new Set(calls.map((call) => call[2])).size).toBe(3);
    // Once posted, the root names the player that reads the thread.
    expect(api['editStatus']).toHaveBeenCalledWith(
      'p1',
      expect.stringContaining(
        `/playlists/shared?post=${encodeURIComponent('https://home.example/@me/p1')}`,
      ),
    );
    expect(row().published).toMatchObject({
      rootId: 'p1',
      url: 'https://home.example/@me/p1',
      editable: true,
      entries: [{ postId: 'p2' }, { postId: 'p3' }],
    });
    expect(publisher.cost(publisher.plan(row()))).toBe(0);
  });

  it('saves progress after each reply and resumes without reposting', async () => {
    const id = lists.save('Mix', tracks('a', 'b', 'c'))!;
    api['postStatus']
      .mockImplementationOnce(() => of({ id: 'root', url: 'https://home.example/@me/root' }))
      .mockImplementationOnce(() => of({ id: 'r1' }))
      .mockImplementationOnce(() => throwError(() => new Error('rate limited')));
    expect(await publisher.publish(id, 'unlisted')).toBe(false);
    expect(publisher.failed()).toBe(true);
    expect(row().published?.entries.map((entry) => entry.postId)).toEqual(['r1']);
    api['postStatus'].mockClear();
    expect(await publisher.publish(id, 'unlisted')).toBe(true);
    const calls = api['postStatus'].mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toEqual({ inReplyToId: 'r1', visibility: 'unlisted' });
  });

  it('plans renames as edits, removals as deletions and reorders as delete-and-repost', async () => {
    const id = lists.save('Mix', tracks('a', 'b', 'c'))!;
    await publisher.publish(id, 'public');
    const [a, b, c] = row().tracks;
    const renamed = publisher.plan({ ...row(), tracks: [{ ...a, title: 'Alpha' }, b, c] });
    expect(renamed.edit.map((item) => item.title)).toEqual(['Alpha']);
    expect(renamed.remove).toEqual([]);
    const removed = publisher.plan({ ...row(), tracks: [a, b] });
    expect(removed.remove.map((entry) => entry.postId)).toEqual(['p4']);
    expect(removed.editRoot).toBe(true);
    const reordered = publisher.plan({ ...row(), tracks: [a, c, b] });
    expect(reordered.remove).toHaveLength(2);
    expect(reordered.post.map((item) => item.index)).toEqual([1, 2]);
    lists.update(id, (saved) => ({ ...saved, tracks: [a, c] }));
    expect(await publisher.publish(id, 'public')).toBe(true);
    expect(api['deleteStatus'].mock.calls.map((call) => call[0])).toEqual(['p3', 'p4']);
    expect(api['postStatus'].mock.calls.at(-1)![1]).toEqual({
      inReplyToId: 'p2',
      visibility: 'unlisted',
    });
    expect(api['editStatus']).toHaveBeenCalledWith('p1', expect.stringContaining('Mix'));
    expect(row().published?.entries.map((entry) => entry.key)).toEqual([a.key, c.key]);
  });

  it('blocks private tracks and removals from threads it did not lay out', () => {
    lists.save('Mix', tracks('a', 'b'));
    const [a, b] = row().tracks;
    const hidden = { ...a, post: { ...a.post, visibility: 'private' } } as typeof a;
    expect(publisher.plan({ ...row(), tracks: [hidden] }).blocked).toBe('private');
    const foreign = {
      ...row(),
      published: {
        rootId: 'r',
        url: 'https://home.example/@me/r',
        visibility: 'public',
        name: 'Mix',
        description: '',
        editable: false,
        entries: [
          { key: a.key, postId: 'x', title: 'a' },
          { key: b.key, postId: 'x', title: 'b' },
        ],
      },
    };
    expect(publisher.plan({ ...foreign, tracks: [a] }).blocked).toBe('notEditable');
    expect(publisher.plan({ ...foreign, tracks: [a, b, ...tracks('c')] }).blocked).toBe('');
  });

  it('finds playlist threads in recent posts and adopts one linked to its replies', async () => {
    const root = {
      id: 'root',
      url: 'https://home.example/@me/root',
      content: '<p>Road trip</p>',
      account: { id: 'me', acct: 'me' },
      media_attachments: [],
      visibility: 'public',
      created_at: '2026-10-27T00:00:00Z',
    } as unknown as Status;
    const reply = (id: string, parent: string, n: number) =>
      ({
        ...root,
        id,
        url: `https://home.example/@me/${id}`,
        content: `<p>${n}. Song ${n}<br><a href="https://audio.example/${id}.mp3">https://audio.example/${id}.mp3</a></p>`,
        in_reply_to_id: parent,
        in_reply_to_account_id: 'me',
        created_at: `2026-10-27T00:00:0${n}Z`,
      }) as unknown as Status;
    api['getAccountStatuses'].mockReturnValue(
      of([reply('r2', 'r1', 2), reply('r1', 'root', 1), root]),
    );
    await publisher.find();
    expect(publisher.found()?.map((thread) => thread.recordings)).toEqual([2]);
    const id = await publisher.adopt(publisher.found()![0]);
    const saved = lists.saved().find((item) => item.id === id)!;
    expect(saved.name).toBe('Road trip');
    expect(saved.published).toMatchObject({ rootId: 'root', editable: true });
    expect(saved.published?.entries.map((entry) => entry.postId)).toEqual(['r1', 'r2']);
    expect(saved.tracks.map((track) => player.title(track))).toEqual(['Song 1', 'Song 2']);
    expect(publisher.found()).toEqual([]);
  });

  describe('crediting the original post', () => {
    function mastodonPost(id: string, extra: Partial<Status> = {}): Status {
      return {
        id,
        url: `https://sea.example/@singer/${id}`,
        uri: `https://sea.example/users/singer/statuses/${id}`,
        visibility: 'public',
        account: { id: 'singer', acct: 'singer@sea.example', display_name: 'Singer' },
        content: `<p>Song ${id}</p>`,
        spoiler_text: '',
        sensitive: false,
        media_attachments: [
          { id: `m${id}`, type: 'audio', url: `https://files.example/${id}.mp3` },
        ],
        ...extra,
      } as unknown as Status;
    }

    it('quotes the post a recording came from and never links its file', async () => {
      api['postStatus'].mockImplementation((text: string, options: { quotedStatusId?: string }) =>
        of({
          id: `p${++posted}`,
          url: `https://home.example/@me/p${posted}`,
          content: text,
          quote: options?.quotedStatusId ? { state: 'accepted', quoted_status: {} } : null,
        }),
      );
      const id = lists.create('Credits', player.tracks(mastodonPost('7')))!;
      expect(await publisher.publish(id, 'public')).toBe(true);
      const reply = api['postStatus'].mock.calls[1];
      expect(reply[0]).toBe('1. Song 7 · @singer@sea.example');
      expect(reply[1]).toMatchObject({ quotedStatusId: '7', inReplyToId: 'p1' });
      expect(reply[0]).not.toContain('files.example');
      expect(row().published?.entries[0]).toMatchObject({ postId: 'p2', quoted: true });
    });

    it('finds another server’s post on this server before quoting it', async () => {
      api['search'] = vi.fn(() => of({ accounts: [], hashtags: [], statuses: [{ id: 'local9' }] }));
      const far = mastodonPost('anonymous-mastodon:sea.example:9', {
        provider: 'anonymous-mastodon',
      } as Partial<Status>);
      const id = lists.create('Far', player.tracks(far))!;
      await publisher.publish(id, 'public');
      expect(api['search']).toHaveBeenCalledWith(
        'https://sea.example/users/singer/statuses/anonymous-mastodon:sea.example:9',
        'statuses',
        { resolve: true, limit: 1 },
      );
      expect(api['postStatus'].mock.calls[1][1]).toMatchObject({ quotedStatusId: 'local9' });
    });

    it('links the post instead when the server does not quote or the author does not allow it', async () => {
      // This server ignores the quote: the reply is edited to carry the post's link.
      const id = lists.create('Old server', player.tracks(mastodonPost('7')))!;
      await publisher.publish(id, 'public');
      expect(api['editStatus']).toHaveBeenCalledWith(
        'p2',
        '1. Song 7 · @singer@sea.example\nhttps://sea.example/@singer/7',
      );
      expect(row().published?.entries[0].quoted).toBeUndefined();

      api['postStatus'].mockClear();
      const denied = mastodonPost('8', { quote_approval: { current_user: 'denied' } });
      const other = lists.create('Denied', player.tracks(denied))!;
      await publisher.publish(other, 'public');
      const reply = api['postStatus'].mock.calls[1];
      expect(reply[1].quotedStatusId).toBeUndefined();
      expect(reply[0]).toBe('1. Song 8 · @singer@sea.example\nhttps://sea.example/@singer/8');
    });
  });
});
