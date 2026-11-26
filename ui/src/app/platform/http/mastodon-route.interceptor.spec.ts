import { HttpClient, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { Auth } from '../session/auth';
import { mastodonRouteInterceptor } from './mastodon-route.interceptor';
import { signInRequest } from './sign-in-request';

type Kind = 'mastodon' | 'bluesky' | 'misskey' | 'anonymous';

function setup(kind: Kind, token: string | null = null) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: Auth,
        useValue: {
          token: signal(token),
          isBlueskyPrimary: kind === 'bluesky',
          isMisskeyPrimary: kind === 'misskey',
        },
      },
      provideHttpClient(withXhr(), withInterceptors([mastodonRouteInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return { http: TestBed.inject(HttpClient), mock: TestBed.inject(HttpTestingController) };
}

describe('mastodonRouteInterceptor', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it.each(['bluesky', 'misskey'] as const)(
    'refuses Mastodon routes for a %s-only identity without touching the network',
    (kind) => {
      const { http } = setup(kind);
      let status: number | undefined;
      http.get('/api/v1/trends/tags').subscribe({ error: (e) => (status = e.status) });
      http.get('/api/v2/instance').subscribe({ error: () => undefined });
      expect(status).toBe(0);
    },
  );

  it.each(['bluesky', 'misskey'] as const)(
    'lets a %s-only identity sign in to a Mastodon server',
    (kind) => {
      const { http, mock } = setup(kind);
      http.post('/api/v1/apps', {}, { context: signInRequest() }).subscribe();
      mock.expectOne('/api/v1/apps').flush({});
    },
  );

  it('leaves Misskey endpoints and other URLs alone', () => {
    const { http, mock } = setup('misskey');
    http.post('/api/notes/timeline', {}).subscribe();
    mock.expectOne('/api/notes/timeline').flush([]);
    http.get('https://bsky.social/xrpc/app.bsky.feed.getTimeline').subscribe();
    mock.expectOne('https://bsky.social/xrpc/app.bsky.feed.getTimeline').flush({});
  });

  it.each(['mastodon', 'anonymous'] as const)('lets a %s identity reach Mastodon', (kind) => {
    const { http, mock } = setup(kind);
    http.get('/api/v1/trends/tags').subscribe();
    mock.expectOne('/api/v1/trends/tags').flush([]);
  });
});
