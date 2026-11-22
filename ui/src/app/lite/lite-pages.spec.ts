import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../platform/session/auth';
import { LiteHome, LiteNotifications, LiteSearch, LiteThread } from './lite-pages';
import { LiteShell } from './lite-shell';

function status(id: string, text = `post ${id}`) {
  return {
    id,
    created_at: '2026-11-21T10:00:00.000Z',
    content: `<p>${text}</p>`,
    visibility: 'public',
    url: `https://example.social/@a/${id}`,
    uri: `https://example.social/statuses/${id}`,
    account: {
      id: 'a1',
      username: 'alice',
      acct: 'alice',
      display_name: 'Alice',
      avatar: '',
      url: 'https://example.social/@alice',
      followers_count: 1,
      following_count: 1,
      statuses_count: 1,
      emojis: [],
      fields: [],
    },
    media_attachments: [],
    mentions: [],
    tags: [],
    emojis: [],
    reblogs_count: 0,
    favourites_count: 0,
    replies_count: 0,
    spoiler_text: '',
    sensitive: false,
  };
}

describe('Lite pages', () => {
  let httpMock: HttpTestingController;
  const params = new BehaviorSubject(convertToParamMap({}));
  const query = new BehaviorSubject(convertToParamMap({}));

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: params,
            queryParamMap: query,
            snapshot: { paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}) },
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).setToken('lite-reader');
  });

  afterEach(() => {
    httpMock.match(() => true);
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  function render<T>(component: Type<T>): ComponentFixture<T> {
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return fixture;
  }

  it('Home makes one request per page and loads more only when asked', () => {
    const f = render(LiteHome);
    const first = httpMock.expectOne((r) => r.url === '/api/v1/timelines/home');
    expect(first.request.params.get('limit')).toBe('20');
    first.flush([status('2'), status('1')]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('app-status-card')).toHaveLength(2);
    httpMock.expectNone((r) => r.url === '/api/v1/timelines/home');

    (el.querySelector('button.more') as HTMLButtonElement).click();
    const second = httpMock.expectOne((r) => r.url === '/api/v1/timelines/home');
    expect(second.request.params.get('max_id')).toBe('1');
    second.flush([]);
    f.detectChanges();
    expect(el.textContent).toContain("That's everything");
  });

  it('Notifications show one line per event and the post underneath', () => {
    const f = render(LiteNotifications);
    httpMock
      .expectOne((r) => r.url === '/api/v1/notifications')
      .flush([
        {
          id: 'n1',
          type: 'favourite',
          created_at: '2026-11-21T10:00:00.000Z',
          account: status('x').account,
          status: status('9'),
        },
      ]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Alice favourited your post');
    expect(el.querySelectorAll('app-status-card')).toHaveLength(1);
  });

  it('A thread loads the post and its context, nothing else', () => {
    params.next(convertToParamMap({ id: '9' }));
    const f = render(LiteThread);
    httpMock.expectOne('/api/v1/statuses/9').flush(status('9'));
    httpMock
      .expectOne('/api/v1/statuses/9/context')
      .flush({ ancestors: [status('8')], descendants: [status('10')] });
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelectorAll('app-status-card')).toHaveLength(3);
  });

  it('Search runs the query in the address and links people into Lite', () => {
    query.next(convertToParamMap({ q: 'birds' }));
    const f = render(LiteSearch);
    const req = httpMock.expectOne((r) => r.url === '/api/v2/search');
    expect(req.request.params.get('q')).toBe('birds');
    req.flush({ accounts: [status('x').account], hashtags: [{ name: 'birds' }], statuses: [] });
    f.detectChanges();
    const links = [...(f.nativeElement as HTMLElement).querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toContain('/m/accounts/a1');
    expect(links).toContain('/m/tags/birds');
  });

  it('The shell says Lite is Mastodon-only for other accounts', () => {
    TestBed.inject(Auth).kind.set(null);
    const f = render(LiteShell);
    expect((f.nativeElement as HTMLElement).textContent).toContain('signed-in Mastodon account');
  });
});
