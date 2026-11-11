import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { CustomEmojis } from '../../publishing/custom-emojis';
import { Status } from '../../platform/api/models';
import { AnonymousCapabilities } from '../../accounts/anonymous/anonymous-capabilities';
import { MISSKEY_LIKE, StatusActions, withReaction } from '../status-actions';
import { MisskeyApi, MisskeyApiError } from './misskey-api';
import { MISSKEY_PERMISSIONS } from './misskey-auth';
import { saveMisskeyIdentity } from './misskey-identity-store';

const SERVER = 'https://misskey.design';
const api = (endpoint: string) => `${SERVER}/api/${endpoint}`;

const note = (extra: Partial<Status> = {}): Status =>
  ({
    id: 'mk:n1',
    provider: 'misskey',
    providerRef: { server: SERVER, noteId: 'n1' },
    favourited: false,
    favourites_count: 2,
    reblogged: false,
    reblogs_count: 0,
    reactions: [{ name: '👍', key: '👍', count: 2, url: null, me: false }],
    ...extra,
  }) as unknown as Status;

/** M2: writing to Misskey through the Misskey API, gated on a token that may write. */
describe('Misskey writing', () => {
  let http: HttpTestingController;

  function signIn(write: boolean): void {
    const key = saveMisskeyIdentity(
      { server: SERVER, userId: 'u1', username: 'me', name: null, avatarUrl: null },
      { token: 'tok', ...(write ? { permissions: [...MISSKEY_PERMISSIONS] } : {}) },
    );
    TestBed.inject(Auth).enterMisskey(key);
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  describe('capabilities', () => {
    it('lets a token from the read-only M1 sign-in do nothing', () => {
      signIn(false);
      const caps = TestBed.inject(AnonymousCapabilities);
      expect(caps.canWriteMisskey).toBe(false);
      expect(caps.canCompose).toBe(false);
      expect(caps.statusCaps('misskey')).toEqual({ reply: false, favourite: false, reblog: false });
    });

    it('lets a token with write permissions reply, react and renote', () => {
      signIn(true);
      const caps = TestBed.inject(AnonymousCapabilities);
      expect(caps.canWriteMisskey).toBe(true);
      expect(caps.canCompose).toBe(true);
      expect(caps.statusCaps('misskey')).toEqual({ reply: true, favourite: true, reblog: true });
    });
  });

  describe('StatusActions', () => {
    beforeEach(() => signIn(true));

    it('likes with the server default reaction (❤)', async () => {
      const result = firstValueFrom(TestBed.inject(StatusActions).toggleFavourite(note()));
      const req = http.expectOne(api('notes/reactions/create'));
      expect(req.request.body).toEqual({ noteId: 'n1', reaction: MISSKEY_LIKE, i: 'tok' });
      req.flush(null, { status: 204, statusText: 'No Content' });
      const updated = await result;
      expect(updated.favourited).toBe(true);
      expect(updated.favourites_count).toBe(3);
      expect(updated.reactions?.find((r) => r.me)?.name).toBe(MISSKEY_LIKE);
    });

    it('un-likes by removing the reader’s reaction, whatever it was', async () => {
      const liked = note({
        favourited: true,
        favourites_count: 3,
        reactions: [
          { name: '👍', key: '👍', count: 2, url: null, me: false },
          { name: '🎉', key: '🎉', count: 1, url: null, me: true },
        ],
      });
      const result = firstValueFrom(TestBed.inject(StatusActions).toggleFavourite(liked));
      http
        .expectOne(api('notes/reactions/delete'))
        .flush(null, { status: 204, statusText: 'No Content' });
      const updated = await result;
      expect(updated.favourited).toBe(false);
      expect(updated.favourites_count).toBe(2);
      expect(updated.reactions?.map((r) => r.name)).toEqual(['👍']);
    });

    it('changes a reaction by removing the old one first (one per person)', async () => {
      const mine = note({
        favourited: true,
        reactions: [{ name: '👍', key: '👍', count: 1, url: null, me: true }],
        favourites_count: 1,
      });
      const result = firstValueFrom(TestBed.inject(StatusActions).react(mine, ':blobcat:'));
      http
        .expectOne(api('notes/reactions/delete'))
        .flush(null, { status: 204, statusText: 'No Content' });
      const add = await vi.waitFor(() => http.expectOne(api('notes/reactions/create')));
      expect(add.request.body.reaction).toBe(':blobcat:');
      add.flush(null, { status: 204, statusText: 'No Content' });
      const updated = await result;
      expect(updated.reactions).toEqual([
        { name: ':blobcat:', key: ':blobcat:', count: 1, url: null, me: true },
      ]);
      expect(updated.favourites_count).toBe(1);
    });

    it('renotes and un-renotes', async () => {
      const actions = TestBed.inject(StatusActions);
      const renoted = firstValueFrom(actions.toggleReblog(note()));
      const create = http.expectOne(api('notes/create'));
      expect(create.request.body).toEqual({ renoteId: 'n1', i: 'tok' });
      create.flush({ createdNote: { id: 'rn' } });
      expect((await renoted).reblogged).toBe(true);

      const undone = firstValueFrom(
        actions.toggleReblog(note({ reblogged: true, reblogs_count: 1 })),
      );
      http.expectOne(api('notes/unrenote')).flush(null, { status: 204, statusText: 'No Content' });
      expect(await undone).toMatchObject({ reblogged: false, reblogs_count: 0 });
    });
  });

  describe('withReaction', () => {
    it('adds a new reaction chip and keeps counts sorted', () => {
      const updated = withReaction(note(), null, '🎉');
      expect(updated.reactions?.map((r) => [r.name, r.count, r.me])).toEqual([
        ['👍', 2, false],
        ['🎉', 1, true],
      ]);
    });
  });

  describe('MisskeyApi', () => {
    beforeEach(() => signIn(true));

    it('names a missing write permission', () => {
      let error: MisskeyApiError | null = null;
      TestBed.inject(MisskeyApi)
        .deleteNote('n1')
        .subscribe({ error: (e: MisskeyApiError) => (error = e) });
      http
        .expectOne(api('notes/delete'))
        .flush({ error: { code: 'PERMISSION_DENIED' } }, { status: 403, statusText: 'Forbidden' });
      expect(error!.needsWriteApproval).toBe(true);
    });

    it('uploads files to the Drive as multipart, straight to the server', () => {
      const file = new File(['x'], 'cat.png', { type: 'image/png' });
      TestBed.inject(MisskeyApi)
        .uploadFile(file, { comment: 'a cat', isSensitive: true })
        .subscribe();
      const req = http.expectOne(api('drive/files/create'));
      const form = req.request.body as FormData;
      expect(form.get('i')).toBe('tok');
      expect((form.get('file') as File).name).toBe('cat.png');
      expect(form.get('comment')).toBe('a cat');
      expect(form.get('isSensitive')).toBe('true');
      req.flush({ id: 'f1' });
    });

    it('follows, mutes and blocks by user id', () => {
      const misskey = TestBed.inject(MisskeyApi);
      misskey.follow('u9').subscribe();
      expect(http.expectOne(api('following/create')).request.body).toEqual({
        userId: 'u9',
        i: 'tok',
      });
      misskey.acceptFollowRequest('u9').subscribe();
      http.expectOne(api('following/requests/accept')).flush(null);
      misskey.mute('u9').subscribe();
      http.expectOne(api('mute/create')).flush(null);
      misskey.block('u9').subscribe();
      http.expectOne(api('blocking/create')).flush({});
    });
  });

  describe('CustomEmojis for a Misskey account', () => {
    it('lists the Misskey server’s emoji, not a Mastodon server’s', () => {
      signIn(true);
      const emojis = TestBed.inject(CustomEmojis);
      emojis.ensureLoaded();
      http.expectNone('/api/v1/custom_emojis');
      http.expectOne(api('emojis')).flush({
        emojis: [
          { name: 'blobcat', url: 'https://e/blobcat.webp', category: 'blob' },
          { name: 'nsfw', url: 'https://e/nsfw.webp', category: null, isSensitive: true },
        ],
      });
      expect(emojis.emojis().map((e) => e.shortcode)).toEqual(['blobcat']);
    });
  });
});
