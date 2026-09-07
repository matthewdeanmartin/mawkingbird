import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BloggerApi } from './blogger-api';
import { BloggerSession } from './blogger-session';

/** A minimal stand-in for the OAuth session, so these tests are about the API. */
function sessionStub(token: string | null) {
  return { accessToken: () => token, disconnect: vi.fn() };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('BloggerApi', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Each test builds its own module (one session stub per test), so the
    // previous one has to be torn down first.
    TestBed.resetTestingModule();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  function apiWith(session: ReturnType<typeof sessionStub>): BloggerApi {
    TestBed.configureTestingModule({ providers: [{ provide: BloggerSession, useValue: session }] });
    return TestBed.inject(BloggerApi);
  }

  it('lists blogs from users/self, trimmed to what the picker needs', async () => {
    // Shape taken from a real blogger#blogList response.
    fetchMock.mockResolvedValue(
      jsonResponse({
        kind: 'blogger#blogList',
        items: [
          { kind: 'blogger#blog', id: '2399953', name: 'Official Blogger Blog', url: 'http://b/' },
        ],
      }),
    );
    const blogs = await apiWith(sessionStub('tok')).listBlogs();

    expect(blogs).toEqual([{ id: '2399953', name: 'Official Blogger Blog', url: 'http://b/' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://www.googleapis.com/blogger/v3/users/self/blogs');
    // Sent direct, with the bearer token — no CORS proxy in the URL.
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(url).not.toContain('proxy');
  });

  it('treats a blog list with no items as empty rather than throwing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ kind: 'blogger#blogList' }));
    await expect(apiWith(sessionStub('tok')).listBlogs()).resolves.toEqual([]);
  });

  it('publishes a post to the chosen blog', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: '99', title: 'Hi', url: 'http://b/p.html' }));
    const post = await apiWith(sessionStub('tok')).createPost({
      blogId: '123',
      title: 'Hi',
      content: '<p>Body</p>',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://www.googleapis.com/blogger/v3/blogs/123/posts');
    // No isDraft param at all when publishing live.
    expect(url).not.toContain('isDraft');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      kind: 'blogger#post',
      title: 'Hi',
      content: '<p>Body</p>',
    });
    expect(post.url).toBe('http://b/p.html');
  });

  it('passes isDraft=true so a draft does not go live', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: '99', title: 'Hi' }));
    await apiWith(sessionStub('tok')).createPost({
      blogId: '123',
      title: 'Hi',
      content: '<p>Body</p>',
      isDraft: true,
    });
    expect(fetchMock.mock.calls[0][0]).toContain('isDraft=true');
  });

  it('refuses to call anything without a token', async () => {
    const session = sessionStub(null);
    await expect(apiWith(session).listBlogs()).rejects.toThrow(/Connect Blogger/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops the session on 401 — the token is gone, so stop claiming a link', async () => {
    const revoked = sessionStub('tok');
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'Invalid Credentials' } }, 401));
    await expect(apiWith(revoked).listBlogs()).rejects.toThrow(/Invalid Credentials/);
    expect(revoked.disconnect).toHaveBeenCalled();
  });

  it('keeps the session on 403 — the token is fine, the permission is not', async () => {
    // Signing in again would not fix a scope or blog-permission problem, so
    // tearing down a working connection would only lose the user their place.
    const forbidden = sessionStub('tok');
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'Insufficient Permission' } }, 403),
    );
    await expect(apiWith(forbidden).listBlogs()).rejects.toThrow(/Insufficient Permission/);
    expect(forbidden.disconnect).not.toHaveBeenCalled();
  });
});
