import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../platform/session/auth';
import { NATIVE_ANALYTICS } from '../../platform/session/platform-login';
import { anonymousStatusRouteRef } from '../../accounts/anonymous/anonymous-route-ref';
import { PostAnalytics } from './post-analytics';

const ME = { id: 'me', username: 'me', acct: 'me', display_name: 'Me', followers_count: 1000 };
const THEM = { id: 'them', username: 'zoe', acct: 'zoe@far.example', display_name: 'Zoe' };

function raw(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    created_at: '2026-11-01T00:00:00Z',
    content: '<p>hi</p>',
    account: ME,
    media_attachments: [],
    mentions: [],
    tags: [],
    emojis: [],
    reblog: null,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    visibility: 'public',
    ...extra,
  };
}

describe('PostAnalytics', () => {
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(() => {
    localStorage.clear();
    params = new BehaviorSubject(convertToParamMap({ id: '2' }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function render() {
    const fixture = TestBed.createComponent(PostAnalytics);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const tileValue = (root: HTMLElement, label: string) =>
    [...root.querySelectorAll('.tile')]
      .find((t) => t.querySelector('.tile-label')?.textContent?.trim() === label)
      ?.querySelector('.tile-value')
      ?.textContent?.trim();

  it('counts the whole thread with two calls and looks up boosters only on request', () => {
    const { fixture, root } = render();
    http.expectOne('/api/v1/statuses/2').flush(
      raw('2', {
        favourites_count: 3,
        reblogs_count: 1,
        in_reply_to_id: '1',
        in_reply_to_account_id: 'me',
      }),
    );
    http.expectOne('/api/v1/statuses/2/context').flush({
      ancestors: [raw('1', { reblogs_count: 1, created_at: '2026-10-31T23:00:00Z' })],
      descendants: [
        raw('x', { account: THEM, in_reply_to_id: '2', in_reply_to_account_id: 'me' }),
        raw('3', {
          in_reply_to_id: '2',
          in_reply_to_account_id: 'me',
          created_at: '2026-11-01T01:00:00Z',
        }),
      ],
    });
    fixture.detectChanges();

    expect(tileValue(root, 'Thread posts')).toBe('3');
    expect(tileValue(root, 'Boosts')).toBe('2');
    expect(tileValue(root, 'Replies')).toContain('1 visible here');
    // 1000 followers + 2 boosts × 268.
    expect(tileValue(root, 'Could have reached')).toBe('1,536');
    expect(http.match((req) => req.url.includes('/reblogged_by'))).toHaveLength(0);

    const button = [...root.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Look up boosters'),
    )!;
    expect(button.textContent).toContain('(2 API calls)');
    button.click();
    http.expectOne('/api/v1/statuses/2/reblogged_by?limit=80').flush([
      {
        id: 'b1',
        username: 'big',
        acct: 'big@x.example',
        display_name: 'Big',
        followers_count: 900,
      },
    ]);
    http
      .expectOne('/api/v1/statuses/1/reblogged_by?limit=80')
      .flush([
        { id: 'b2', username: 'small', acct: 'small', display_name: 'Small', followers_count: 9 },
      ]);
    fixture.detectChanges();

    expect(tileValue(root, 'Could have reached')).toBe('1,909');
    const names = [...root.querySelectorAll('.booster-name')].map((n) => n.textContent?.trim());
    expect(names).toEqual(['Big', 'Small']);
  });

  it('reads an anonymous public post from its own server', () => {
    params.next(
      convertToParamMap({
        id: anonymousStatusRouteRef({ server: 'https://far.example', id: '77' }),
      }),
    );
    const { fixture, root } = render();
    http.expectOne('https://far.example/api/v1/statuses/77').flush(raw('77'));
    http
      .expectOne('https://far.example/api/v1/statuses/77/context')
      .flush({ ancestors: [], descendants: [] });
    fixture.detectChanges();
    expect(root.textContent).toContain('Nobody has boosted this thread.');
  });

  it('says which posts it covers instead of failing on another network', () => {
    params.next(convertToParamMap({ id: 'bsky:at://did:plc:x/app.bsky.feed.post/1' }));
    const { root } = render();
    http.expectNone(() => true);
    expect(root.textContent).toContain('covers Mastodon posts for now');
  });

  it('names a missing post', () => {
    const { fixture, root } = render();
    http.expectOne('/api/v1/statuses/2').flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('not on the server');
  });
});

describe('PostAnalytics in the native app', () => {
  it('looks boosters up from the archive on open', async () => {
    const boosters = vi
      .fn()
      .mockResolvedValue([
        { id: 'b', username: 'b', acct: 'b', display_name: 'B', followers_count: 5 },
      ]);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id: '9' })) },
        },
        { provide: NATIVE_ANALYTICS, useValue: { boosters } },
      ],
    });
    TestBed.inject(Auth).token.set('native-mastodon:a');
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PostAnalytics);
    fixture.detectChanges();
    http.expectOne('/api/v1/statuses/9').flush(raw('9', { reblogs_count: 1 }));
    http.expectOne('/api/v1/statuses/9/context').flush({ ancestors: [], descendants: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    expect(boosters).toHaveBeenCalledWith('native-mastodon:a', '9');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.booster-name')?.textContent,
    ).toContain('B');
  });
});
