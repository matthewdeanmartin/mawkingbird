import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOGGER_CLIENT_ID, BloggerSession } from './blogger-session';

describe('BloggerSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    // The blog choice persists in localStorage now, so it has to be cleared or
    // it leaks a connected-looking state into the next test.
    localStorage.clear();
  });

  function session(clientId = 'test-client.apps.googleusercontent.com'): BloggerSession {
    TestBed.configureTestingModule({
      providers: [{ provide: BLOGGER_CLIENT_ID, useValue: clientId }],
    });
    return TestBed.inject(BloggerSession);
  }

  it('reports itself unconfigured when the build has no client id', () => {
    const blogger = session('');
    expect(blogger.configured).toBe(false);
  });

  it('refuses to start a flow it cannot finish', async () => {
    await expect(session('').connect()).rejects.toThrow(/not been configured/);
  });

  it('sends a PKCE authorization request with state and the blogger scope', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...location, assign, search: '' });

    await session().connect();

    const url = new URL(assign.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/blogger');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('state')).toBeTruthy();
    // Forces the Google account chooser, so a prior grant is never reused silently.
    expect(url.searchParams.get('prompt')).toBe('select_account');
    // The secret must never appear in a browser flow.
    expect(url.searchParams.get('client_secret')).toBeNull();
  });

  it('rejects a callback whose state does not match the one we issued', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...location, assign, search: '' });
    const blogger = session();
    await blogger.connect();

    await expect(
      blogger.finishAuthorization(new URLSearchParams({ code: 'c', state: 'forged' })),
    ).rejects.toThrow(/invalid or expired/);
    expect(blogger.connected()).toBe(false);
  });

  it('exchanges the code without a client secret and stores the token', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...location, assign, search: '' });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const blogger = session();
    await blogger.connect();
    const state = new URL(assign.mock.calls[0][0]).searchParams.get('state')!;
    await blogger.finishAuthorization(new URLSearchParams({ code: 'the-code', state }));

    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBeTruthy();
    expect(body.has('client_secret')).toBe(false);
    expect(blogger.accessToken()).toBe('tok');
    // Connected, but not yet publishable: no blog has been chosen.
    expect(blogger.connected()).toBe(true);
    expect(blogger.ready()).toBe(false);
  });

  it('is only ready to publish once a blog is chosen', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...location, assign, search: '' });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 }),
        ),
    );
    const blogger = session();
    await blogger.connect();
    const state = new URL(assign.mock.calls[0][0]).searchParams.get('state')!;
    await blogger.finishAuthorization(new URLSearchParams({ code: 'c', state }));

    blogger.chooseBlog('123', 'My Blog', 'https://my.blogspot.com/');
    expect(blogger.ready()).toBe(true);
    expect(blogger.blogId()).toBe('123');
    expect(blogger.blogName()).toBe('My Blog');
  });

  it('derives the RSS feed from the blog address, for blogspot and custom domains', () => {
    const blogger = session();
    blogger.adoptToken('tok', 3600);

    blogger.chooseBlog('1', 'Mine', 'https://mine.blogspot.com/');
    expect(blogger.feedUrl()).toBe('https://mine.blogspot.com/feeds/posts/default?alt=rss');

    // A custom domain with no trailing slash must not lose its last segment.
    blogger.chooseBlog('2', 'Custom', 'https://blog.example.com');
    expect(blogger.feedUrl()).toBe('https://blog.example.com/feeds/posts/default?alt=rss');
  });

  it('keeps the blog and profile feed after signing out of Google', () => {
    const blogger = session();
    blogger.adoptToken('tok', 3600);
    blogger.chooseBlog('1', 'Mine', 'https://mine.blogspot.com/');
    blogger.setIncludeInProfile(true);

    blogger.disconnect();

    // Signing out stops publishing, but the feed is public and needs no token —
    // emptying the profile would be a surprise, not a security improvement.
    expect(blogger.connected()).toBe(false);
    expect(blogger.ready()).toBe(false);
    expect(blogger.includeInProfile()).toBe(true);
    expect(blogger.feedUrl()).toBe('https://mine.blogspot.com/feeds/posts/default?alt=rss');
  });

  it('survives a reload with no Google session, so an anonymous browser still has the feed', () => {
    const first = session();
    first.adoptToken('tok', 3600);
    first.chooseBlog('1', 'Mine', 'https://mine.blogspot.com/');
    first.setIncludeInProfile(true);
    // A new tab: sessionStorage is gone, localStorage is not.
    sessionStorage.clear();
    TestBed.resetTestingModule();

    const reloaded = session();
    expect(reloaded.connected()).toBe(false);
    expect(reloaded.includeInProfile()).toBe(true);
    expect(reloaded.feedUrl()).toContain('/feeds/posts/default?alt=rss');
  });

  it('forget clears the blog as well as the session', () => {
    const blogger = session();
    blogger.adoptToken('tok', 3600);
    blogger.chooseBlog('1', 'Mine', 'https://mine.blogspot.com/');
    blogger.setIncludeInProfile(true);

    blogger.forget();

    expect(blogger.blogName()).toBeNull();
    expect(blogger.feedUrl()).toBeNull();
    expect(blogger.includeInProfile()).toBe(false);
  });

  it('does not switch the profile feed on by itself when changing blogs', () => {
    const blogger = session();
    blogger.adoptToken('tok', 3600);
    blogger.chooseBlog('1', 'First', 'https://first.blogspot.com/');
    expect(blogger.includeInProfile()).toBe(false);

    blogger.chooseBlog('2', 'Second', 'https://second.blogspot.com/');
    expect(blogger.includeInProfile()).toBe(false);
  });

  it("uses the user's own client id in preference to the build's", async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...location, assign, search: '' });
    const blogger = session('shipped.apps.googleusercontent.com');

    blogger.setOwnClientId('mine.apps.googleusercontent.com');
    await blogger.connect();

    const url = new URL(assign.mock.calls[0][0]);
    expect(url.searchParams.get('client_id')).toBe('mine.apps.googleusercontent.com');
  });

  it('falls back to the shipped client id when the override is cleared', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...location, assign, search: '' });
    const blogger = session('shipped.apps.googleusercontent.com');
    blogger.setOwnClientId('mine.apps.googleusercontent.com');

    blogger.setOwnClientId('   ');

    expect(blogger.ownClientId()).toBe('');
    await blogger.connect();
    expect(new URL(assign.mock.calls[0][0]).searchParams.get('client_id')).toBe(
      'shipped.apps.googleusercontent.com',
    );
  });

  it("is configured by the user's client id even when the build ships none", () => {
    const blogger = session('');
    expect(blogger.configured).toBe(false);
    expect(blogger.hasShippedClientId).toBe(false);

    blogger.setOwnClientId('mine.apps.googleusercontent.com');
    expect(blogger.configured).toBe(true);
  });

  it('drops a token minted by the previous client when the client id changes', () => {
    const blogger = session('shipped.apps.googleusercontent.com');
    blogger.adoptToken('tok', 3600);
    blogger.chooseBlog('1', 'Mine', 'https://mine.blogspot.com/');

    blogger.setOwnClientId('mine.apps.googleusercontent.com');

    // The old token was issued to a client that is no longer in use.
    expect(blogger.connected()).toBe(false);
    // The blog is the same blog either way, so it survives.
    expect(blogger.blogName()).toBe('Mine');
  });

  it('does not disturb an existing session when the client id is unchanged', () => {
    const blogger = session('shipped.apps.googleusercontent.com');
    blogger.setOwnClientId('mine.apps.googleusercontent.com');
    blogger.adoptToken('tok', 3600);

    blogger.setOwnClientId('mine.apps.googleusercontent.com');

    expect(blogger.connected()).toBe(true);
  });

  it('explains a redirect_uri_mismatch instead of echoing the raw code', async () => {
    await expect(
      session().finishAuthorization(new URLSearchParams({ error: 'redirect_uri_mismatch' })),
    ).rejects.toThrow(/authorized redirect URIs/);
  });

  it('treats an expired token as no token, and disconnects', () => {
    // A tab left open past the token's hour, as a returning user would have.
    sessionStorage.setItem(
      'mockingbird_blogger_token',
      JSON.stringify({ accessToken: 'old', expiresAt: Date.now() - 3_600_000 }),
    );
    const stale = session();
    expect(stale.accessToken()).toBeNull();
    expect(stale.connected()).toBe(false);
  });
});
