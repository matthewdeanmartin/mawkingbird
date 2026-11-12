import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { parseAnonymousStatusRouteRef } from '../../accounts/anonymous/anonymous-route-ref';
import { BlueskyApi } from '../../connections/bluesky/bluesky-api';
import { Api } from '../../platform/api/api';
import { Status } from '../../platform/api/models';
import { Server } from '../../platform/http/server';
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

  async function open(kind: DeepLinkKind, params: Record<string, string>) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(params), data: { kind } } },
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

  it('opens tweets and Twitter accounts by their global ids', async () => {
    await open('twitter', { user: 'jack', id: '20' });
    expect(navigate).toHaveBeenCalledWith(['/statuses', 'twitter:20'], { replaceUrl: true });
  });
});
