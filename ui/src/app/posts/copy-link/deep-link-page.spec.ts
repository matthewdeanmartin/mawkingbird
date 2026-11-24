import { signal } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import {
  anonymousStatusRouteRef,
  parseAnonymousStatusRouteRef,
} from '../../accounts/anonymous/anonymous-route-ref';
import { BlueskyApi } from '../../connections/bluesky/bluesky-api';
import { Api } from '../../platform/api/api';
import { Status } from '../../platform/api/models';
import { Server } from '../../platform/http/server';
import { authInterceptor } from '../../platform/http/auth.interceptor';
import { serverInterceptor } from '../../platform/http/server.interceptor';
import { Auth } from '../../platform/session/auth';
import { DeepLinkKind, DeepLinkPage } from './deep-link-page';

describe('DeepLinkPage', () => {
  const navigate = vi.fn().mockResolvedValue(true);
  const resolveStatusOnHome = vi.fn();
  const getStatus = vi.fn();
  const resolveHandle = vi.fn();
  let auth: { isAnonymous: boolean; lacksMastodonToken: boolean };

  beforeEach(() => {
    navigate.mockClear();
    resolveStatusOnHome.mockReset();
    getStatus.mockReset();
    resolveHandle.mockReset();
    auth = { isAnonymous: false, lacksMastodonToken: false };
  });

  async function open(
    kind: DeepLinkKind,
    params: Record<string, string>,
    query: Record<string, string> = {},
    data: Record<string, unknown> = {},
  ) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap(params),
              queryParamMap: convertToParamMap(query),
              data: { kind, ...data },
            },
          },
        },
        { provide: Router, useValue: { navigate } },
        { provide: Api, useValue: { resolveStatusOnHome } },
        { provide: AnonymousPublicApi, useValue: { getStatus } },
        { provide: BlueskyApi, useValue: { resolveHandle } },
        { provide: Server, useValue: { baseUrl: signal('https://home.example') } },
        { provide: Auth, useValue: auth },
      ],
    });
    const fixture = TestBed.createComponent(DeepLinkPage);
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const post = { server: 'far.example', acct: 'bob@far.example', id: '42' };

  it("opens a post from the reader's own server by its id", async () => {
    await open('mastodon-post', { ...post, server: 'home.example' });
    expect(navigate).toHaveBeenCalledWith(['/statuses', '42'], { replaceUrl: true });
    expect(resolveStatusOnHome).not.toHaveBeenCalled();
  });

  it('reopens the reader when the address came from the reader page', async () => {
    await open('mastodon-post', { ...post, server: 'home.example' }, { read: '1' });
    expect(navigate).toHaveBeenCalledWith(['/read', '42'], { replaceUrl: true });
  });

  it("asks the reader's server to resolve the issuing server's URL for the post", async () => {
    resolveStatusOnHome.mockReturnValue(of({ id: 'local-7' } as Status));
    await open('mastodon-post', post);
    expect(resolveStatusOnHome).toHaveBeenCalledWith('https://far.example/@bob@far.example/42');
    expect(navigate).toHaveBeenCalledWith(['/statuses', 'local-7'], { replaceUrl: true });
  });

  it('falls back to the canonical ActivityPub id when the page URL does not resolve', async () => {
    resolveStatusOnHome.mockImplementation((url: string) =>
      of(url === 'https://origin.example/notes/abc' ? ({ id: 'local-8' } as Status) : null),
    );
    getStatus.mockReturnValue(of({ uri: 'https://origin.example/notes/abc' } as Status));
    await open('mastodon-post', post);
    expect(navigate).toHaveBeenCalledWith(['/statuses', 'local-8'], { replaceUrl: true });
  });

  it('resolves a foreign numeric ID on the signed-in home server over authenticated HTTP', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([serverInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap(post), data: { kind: 'mastodon-post' } },
          },
        },
      ],
    });
    TestBed.inject(Server).setBaseUrl('https://home.example');
    TestBed.inject(Auth).setToken('reader-token');
    const http = TestBed.inject(HttpTestingController);
    const resolving = TestBed.createComponent(DeepLinkPage).componentInstance.ngOnInit();
    const search = http.expectOne((r) => r.url === 'https://home.example/api/v2/search');
    expect(search.request.method).toBe('GET');
    expect(search.request.headers.get('Authorization')).toBe('Bearer reader-token');
    expect(search.request.params.get('q')).toBe('https://far.example/@bob@far.example/42');
    expect(search.request.params.get('type')).toBe('statuses');
    expect(search.request.params.get('resolve')).toBe('true');
    search.flush({ accounts: [], hashtags: [], statuses: [{ id: '731' }] });
    await resolving;
    expect(navigate.mock.calls).toEqual([[['/statuses', '731'], { replaceUrl: true }]]);
    http.verify();
  });

  it('reads the post from its server for Anonymous', async () => {
    auth.isAnonymous = true;
    auth.lacksMastodonToken = true;
    await open('mastodon-post', post);
    const [[route]] = navigate.mock.calls;
    expect(route[0]).toBe('/statuses');
    expect(parseAnonymousStatusRouteRef(route[1])).toMatchObject({
      server: 'https://far.example',
      id: '42',
    });
  });

  it('offers the original when nothing here can resolve it', async () => {
    resolveStatusOnHome.mockReturnValue(throwError(() => new Error('nope')));
    getStatus.mockReturnValue(throwError(() => new Error('nope')));
    const el = await open('mastodon-post', post);
    expect(navigate).not.toHaveBeenCalled();
    expect(el.querySelector('a')?.getAttribute('href')).toBe(
      'https://far.example/@bob@far.example/42',
    );
  });

  it('opens a Lite link in Lite, once this server has the post', async () => {
    resolveStatusOnHome.mockReturnValue(of({ id: '99' }));
    await open('mastodon-post', post, {}, { lite: true });
    expect(navigate).toHaveBeenCalledWith(['/m/statuses', '99'], { replaceUrl: true });
  });

  it("finds a Lite queue's post from its server and id alone", async () => {
    getStatus.mockReturnValue(of({ uri: 'https://far.example/users/bob/statuses/42' }));
    resolveStatusOnHome.mockReturnValue(of({ id: '99' }));
    const ref = anonymousStatusRouteRef({ server: 'https://far.example', id: '42' });
    await open('post-ref', { ref }, {}, { lite: true });
    expect(resolveStatusOnHome).toHaveBeenCalledWith('https://far.example/users/bob/statuses/42');
    expect(navigate).toHaveBeenCalledWith(['/m/statuses', '99'], { replaceUrl: true });
  });

  it("shows the post where it lives when the reader's server cannot have it", async () => {
    resolveStatusOnHome.mockReturnValue(of(null));
    getStatus.mockReturnValue(of({ uri: 'https://far.example/users/bob/statuses/42' }));
    await open('mastodon-post', post, {}, { lite: true });
    const [[path, id]] = navigate.mock.calls[0];
    expect(path).toBe('/statuses');
    expect(parseAnonymousStatusRouteRef(id)?.server).toBe('https://far.example');
  });

  it('shows the public copy to a Bluesky reader with no Mastodon account', async () => {
    auth.lacksMastodonToken = true;
    await open('mastodon-post', post);
    const [[path, id]] = navigate.mock.calls[0];
    expect(path).toBe('/statuses');
    expect(parseAnonymousStatusRouteRef(id)?.id).toBe('42');
  });

  it('opens accounts by handle through the profile page', async () => {
    await open('account', { acct: 'bob@far.example' });
    expect(navigate).toHaveBeenCalledWith(['/accounts', '@bob@far.example'], { replaceUrl: true });
  });

  it('turns a Bluesky handle into a DID before opening the post', async () => {
    resolveHandle.mockReturnValue(of({ did: 'did:plc:abc' }));
    await open('bsky-post', { actor: 'alice.bsky.social', rkey: '3kx' });
    expect(navigate).toHaveBeenCalledWith(
      ['/statuses', 'bsky:at://did:plc:abc/app.bsky.feed.post/3kx'],
      { replaceUrl: true },
    );
  });

  it('keeps the original Bluesky link when handle resolution is unavailable', async () => {
    resolveHandle.mockReturnValue(throwError(() => new Error('AppView unavailable')));
    const el = await open('bsky-post', { actor: 'alice.bsky.social', rkey: '3kx' });
    expect(navigate).not.toHaveBeenCalled();
    expect(el.querySelector('a')?.getAttribute('href')).toBe(
      'https://bsky.app/profile/alice.bsky.social/post/3kx',
    );
  });

  it('opens tweets and Twitter accounts by their global ids', async () => {
    await open('twitter', { user: 'jack', id: '20' });
    expect(navigate).toHaveBeenCalledWith(['/statuses', 'twitter:20'], { replaceUrl: true });
  });
});
