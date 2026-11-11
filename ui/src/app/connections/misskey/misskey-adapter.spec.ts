import { describe, expect, it } from 'vitest';
import {
  adaptMisskeyNote,
  adaptMisskeyNotification,
  adaptMisskeyUser,
  adaptReactions,
  isPureRenote,
  mastodonVisibility,
  misskeyNoteId,
} from './misskey-adapter';
import { MkNote, MkUserLite } from './misskey-types';

const SERVER = 'https://misskey.io';

function user(overrides: Partial<MkUserLite> = {}): MkUserLite {
  return {
    id: 'u1',
    name: 'Alice',
    username: 'alice',
    host: null,
    avatarUrl: 'https://misskey.io/avatar.webp',
    ...overrides,
  };
}

function note(overrides: Partial<MkNote> = {}): MkNote {
  return {
    id: 'n1',
    createdAt: '2026-11-09T10:00:00.000Z',
    text: 'こんにちは',
    cw: null,
    user: user(),
    userId: 'u1',
    visibility: 'public',
    renoteCount: 2,
    repliesCount: 3,
    reactions: {},
    ...overrides,
  };
}

describe('adaptMisskeyNote', () => {
  it('namespaces ids and tags the provider', () => {
    const status = adaptMisskeyNote(note(), SERVER);
    expect(status.id).toBe('mk:n1');
    expect(status.provider).toBe('misskey');
    expect(status.providerRef).toEqual({ server: SERVER, noteId: 'n1' });
    expect(misskeyNoteId(status.id)).toBe('n1');
    expect(misskeyNoteId('bsky:x')).toBeNull();
  });

  it('links to the note on the reader server and keeps the remote uri', () => {
    const local = adaptMisskeyNote(note(), SERVER);
    expect(local.url).toBe('https://misskey.io/notes/n1');
    expect(local.uri).toBe('https://misskey.io/notes/n1');
    const remote = adaptMisskeyNote(note({ uri: 'https://other.example/notes/9' }), SERVER);
    expect(remote.url).toBe('https://misskey.io/notes/n1');
    expect(remote.uri).toBe('https://other.example/notes/9');
  });

  it('renders MFM text and carries no language (detection decides)', () => {
    const status = adaptMisskeyNote(note({ text: '**太字**' }), SERVER);
    expect(status.content).toBe('<p><strong>太字</strong></p>');
    expect(status.language).toBeNull();
  });

  it('maps a CW to a spoiler and marks the post sensitive', () => {
    const status = adaptMisskeyNote(note({ cw: 'ネタバレ' }), SERVER);
    expect(status.spoiler_text).toBe('ネタバレ');
    expect(status.sensitive).toBe(true);
  });

  it('marks the post sensitive when any file is', () => {
    const status = adaptMisskeyNote(
      note({
        files: [
          {
            id: 'f1',
            name: 'cat.jpg',
            type: 'image/jpeg',
            isSensitive: true,
            url: 'https://s3.example/cat.jpg',
            thumbnailUrl: 'https://s3.example/cat-thumb.webp',
            comment: 'a cat',
            properties: { width: 400, height: 200 },
          },
        ],
      }),
      SERVER,
    );
    expect(status.sensitive).toBe(true);
    expect(status.media_attachments).toEqual([
      {
        id: 'mk:f1',
        type: 'image',
        url: 'https://s3.example/cat.jpg',
        preview_url: 'https://s3.example/cat-thumb.webp',
        description: 'a cat',
        meta: { original: { width: 400, height: 200, aspect: 2 } },
      },
    ]);
  });

  it('turns a bare renote into a reblog wrapper', () => {
    const inner = note({ id: 'n0', text: 'original', user: user({ id: 'u2', username: 'bob' }) });
    const renote = note({ id: 'n2', text: null, renote: inner, renoteId: 'n0' });
    expect(isPureRenote(renote)).toBe(true);
    const status = adaptMisskeyNote(renote, SERVER);
    expect(status.id).toBe('mk:n2');
    expect(status.reblog?.id).toBe('mk:n0');
    expect(status.reblog?.account.username).toBe('bob');
    expect(status.quote).toBeNull();
  });

  it('turns a renote with text into a quote', () => {
    const inner = note({ id: 'n0', text: 'original' });
    const quote = note({ id: 'n3', text: 'look', renote: inner, renoteId: 'n0' });
    expect(isPureRenote(quote)).toBe(false);
    const status = adaptMisskeyNote(quote, SERVER);
    expect(status.reblog).toBeNull();
    expect(status.quote?.state).toBe('accepted');
    expect(status.quote?.quoted_status?.id).toBe('mk:n0');
  });

  it('maps visibility to the nearest Mastodon word', () => {
    expect(mastodonVisibility('public')).toBe('public');
    expect(mastodonVisibility('home')).toBe('unlisted');
    expect(mastodonVisibility('followers')).toBe('private');
    expect(mastodonVisibility('specified')).toBe('direct');
  });

  it('adapts polls with own votes', () => {
    const status = adaptMisskeyNote(
      note({
        poll: {
          multiple: false,
          expiresAt: null,
          choices: [
            { text: 'いぬ', votes: 1, isVoted: false },
            { text: 'ねこ', votes: 3, isVoted: true },
          ],
        },
      }),
      SERVER,
    );
    expect(status.poll?.options).toEqual([
      { title: 'いぬ', votes_count: 1 },
      { title: 'ねこ', votes_count: 3 },
    ]);
    expect(status.poll?.votes_count).toBe(4);
    expect(status.poll?.voted).toBe(true);
    expect(status.poll?.own_votes).toEqual([1]);
    expect(status.poll?.expired).toBe(false);
  });

  it('collects author and note custom emoji for the emoji pipe', () => {
    const status = adaptMisskeyNote(
      note({
        user: user({ emojis: { verified: 'https://e/verified.png' } }),
        emojis: { blobcat: 'https://e/blobcat.png' },
      }),
      SERVER,
    );
    expect(status.emojis?.map((e) => e.shortcode).sort()).toEqual(['blobcat', 'verified']);
  });

  it('points reply ids at the namespaced parent', () => {
    const status = adaptMisskeyNote(note({ replyId: 'p1' }), SERVER);
    expect(status.in_reply_to_id).toBe('mk:p1');
  });
});

describe('adaptReactions', () => {
  it('sorts by count, resolves custom emoji, and marks the reader own', () => {
    const reactions = adaptReactions(
      note({
        reactions: { '👍': 2, ':blobcat@.:': 5, ':party@other.example:': 1, '❤': 0 },
        reactionEmojis: { 'party@other.example': 'https://other.example/party.png' },
        myReaction: ':blobcat@.:',
      }),
      SERVER,
    );
    expect(reactions).toEqual([
      // `key` is what to send to react with it: absent for another server's emoji.
      {
        name: ':blobcat:',
        key: ':blobcat:',
        count: 5,
        url: 'https://misskey.io/emoji/blobcat.webp',
        me: true,
      },
      { name: '👍', key: '👍', count: 2, url: null, me: false },
      { name: ':party:', count: 1, url: 'https://other.example/party.png', me: false },
    ]);
  });

  it('sums reactions into the favourite count and sets favourited', () => {
    const status = adaptMisskeyNote(
      note({ reactions: { '👍': 2, '🎉': 1 }, myReaction: '👍' }),
      SERVER,
    );
    expect(status.favourites_count).toBe(3);
    expect(status.favourited).toBe(true);
    expect(status.reactions?.length).toBe(2);
  });

  it('omits the reactions field when there are none', () => {
    expect(adaptMisskeyNote(note(), SERVER).reactions).toBeUndefined();
  });
});

describe('adaptMisskeyUser', () => {
  it('builds a full acct and a profile url on the reader server', () => {
    const local = adaptMisskeyUser(user(), SERVER);
    expect(local.id).toBe('mk:u1');
    expect(local.acct).toBe('alice@misskey.io');
    expect(local.url).toBe('https://misskey.io/@alice');
    const remote = adaptMisskeyUser(user({ username: 'bob', host: 'other.example' }), SERVER);
    expect(remote.acct).toBe('bob@other.example');
    expect(remote.url).toBe('https://misskey.io/@bob@other.example');
  });

  it('falls back to the username for a missing display name', () => {
    expect(adaptMisskeyUser(user({ name: null }), SERVER).display_name).toBe('alice');
  });

  it('escapes profile field values', () => {
    const account = adaptMisskeyUser(
      { ...user(), fields: [{ name: 'site', value: '<b>x</b>' }] },
      SERVER,
    );
    expect(account.fields[0].value).toBe('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('adaptMisskeyNotification', () => {
  const ai = user({ id: 'u9', username: 'ai' });
  const mine = note({ id: 'n1' });

  it('maps social types onto the types the notifications page renders', () => {
    const at = '2026-11-09T10:00:00.000Z';
    const map = (type: string, extra: object = {}) =>
      adaptMisskeyNotification({ id: 'x', createdAt: at, type, user: ai, ...extra }, SERVER)?.type;
    expect(map('reaction', { note: mine, reaction: '👍' })).toBe('favourite');
    expect(map('renote', { note: note({ id: 'rn', text: null, renote: mine }) })).toBe('reblog');
    expect(map('reply', { note: mine })).toBe('mention');
    expect(map('quote', { note: mine })).toBe('mention');
    expect(map('follow')).toBe('follow');
    expect(map('receiveFollowRequest')).toBe('follow_request');
  });

  it('points a renote notification at the reader’s own note, not the renote', () => {
    const adapted = adaptMisskeyNotification(
      {
        id: 'x1',
        createdAt: '2026-11-09T10:00:00.000Z',
        type: 'renote',
        user: ai,
        note: note({ id: 'rn', text: null, renote: mine }),
      },
      SERVER,
    );
    expect(adapted?.status?.id).toBe('mk:n1');
    expect(adapted?.id).toBe('mk:x1');
    expect(adapted?.account.id).toBe('mk:u9');
  });

  it('drops types it does not show, and notifications without an actor', () => {
    const at = '2026-11-09T10:00:00.000Z';
    expect(
      adaptMisskeyNotification({ id: 'a', createdAt: at, type: 'achievementEarned' }, SERVER),
    ).toBeNull();
    expect(adaptMisskeyNotification({ id: 'b', createdAt: at, type: 'follow' }, SERVER)).toBeNull();
  });
});
