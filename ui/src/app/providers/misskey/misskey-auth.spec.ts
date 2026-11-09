import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MISSKEY_PERMISSIONS,
  MisskeyAuth,
  MisskeySignInError,
  MK_MIAUTH_PENDING_KEY,
} from './misskey-auth';
import { misskeyIdentities } from './misskey-identity-store';

const ORIGIN = 'https://misskey.io';

describe('MisskeyAuth', () => {
  let auth: MisskeyAuth;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(MisskeyAuth);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  /** Answer the NodeInfo discovery pair, letting the awaited chain advance between them. */
  async function answerNodeInfo(origin: string, software: string): Promise<void> {
    await Promise.resolve();
    http.expectOne(`${origin}/.well-known/nodeinfo`).flush({
      links: [
        { rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0', href: `${origin}/nodeinfo/2.0` },
        { rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1', href: `${origin}/nodeinfo/2.1` },
      ],
    });
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne(`${origin}/nodeinfo/2.1`).flush({ software: { name: software } });
  }

  async function settle<T>(promise: Promise<T>): Promise<T | MisskeySignInError> {
    return promise.catch((e: MisskeySignInError) => e);
  }

  it('accepts a Misskey server, from a bare host or a handle', async () => {
    const result = settle(auth.checkServer('@alice@misskey.io'));
    await answerNodeInfo(ORIGIN, 'misskey');
    expect(await result).toBe(ORIGIN);
  });

  it('rejects something that is not an address', async () => {
    const result = await settle(auth.checkServer('not a server'));
    expect((result as MisskeySignInError).problem).toBe('invalid-address');
  });

  it('points Mastodon servers at the Mastodon door', async () => {
    const result = settle(auth.checkServer('mastodon.social'));
    await answerNodeInfo('https://mastodon.social', 'mastodon');
    const error = (await result) as MisskeySignInError;
    expect(error.problem).toBe('mastodon');
    expect(error.software).toBe('mastodon');
  });

  it('names a Misskey fork as unsupported for now', async () => {
    const result = settle(auth.checkServer('sharkey.example'));
    await answerNodeInfo('https://sharkey.example', 'sharkey');
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne('https://sharkey.example/api/meta').flush({ name: 'Shark' });
    const error = (await result) as MisskeySignInError;
    expect(error.problem).toBe('fork');
    expect(error.software).toBe('sharkey');
  });

  it('reports an unreachable server', async () => {
    const result = settle(auth.checkServer('down.example'));
    await Promise.resolve();
    http.expectOne('https://down.example/.well-known/nodeinfo').error(new ProgressEvent('error'));
    expect(((await result) as MisskeySignInError).problem).toBe('unreachable');
  });

  it('builds a MiAuth URL with a callback to this app and read and write permissions', () => {
    const url = new URL(auth.begin(ORIGIN, true));
    expect(url.origin).toBe(ORIGIN);
    const session = url.pathname.replace('/miauth/', '');
    expect(session).toMatch(/^[0-9a-f-]{36}$/);
    expect(url.searchParams.get('callback')).toBe(new URL('login/misskey', document.baseURI).href);
    expect(url.searchParams.get('permission')).toBe(MISSKEY_PERMISSIONS.join(','));
    // M2: writing (notes, reactions, follows); never account settings or admin.
    expect(url.searchParams.get('permission')).toContain('write:notes');
    expect(url.searchParams.get('permission')).not.toContain('write:account');
    expect(url.searchParams.get('permission')).not.toContain('admin');
    expect(auth.pending(session)?.adding).toBe(true);
  });

  it('completes a pending session into a saved identity, once', async () => {
    const session = new URL(auth.begin(ORIGIN, false)).pathname.replace('/miauth/', '');
    const result = auth.complete(session);
    http.expectOne(`${ORIGIN}/api/miauth/${session}/check`).flush({
      ok: true,
      token: 'new-token',
      user: { id: 'u1', username: 'alice', name: 'Alice', host: null, avatarUrl: null },
    });
    expect(await result).toEqual({ key: `${ORIGIN}#u1`, adding: false });
    expect(misskeyIdentities()[0].credentials.token).toBe('new-token');
    expect(sessionStorage.getItem(MK_MIAUTH_PENDING_KEY)).toBeNull();
  });

  it('refuses a session this tab did not start', async () => {
    const error = await settle(auth.complete('someone-elses-session'));
    expect((error as MisskeySignInError).problem).toBe('session-missing');
  });

  it('reports a denied approval', async () => {
    const session = new URL(auth.begin(ORIGIN, false)).pathname.replace('/miauth/', '');
    const result = settle(auth.complete(session));
    http.expectOne(`${ORIGIN}/api/miauth/${session}/check`).flush({ ok: false });
    expect(((await result) as MisskeySignInError).problem).toBe('session-rejected');
    expect(misskeyIdentities()).toEqual([]);
  });
});
