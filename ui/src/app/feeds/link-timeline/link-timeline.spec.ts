import { HttpRequest, provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { post } from '../../testing/forum-fixtures';
import { LinkTimeline } from './link-timeline';

const URL_ = 'https://news.example/story';
const search = (q: string) => (r: HttpRequest<unknown>) =>
  r.url === '/api/v2/search' && r.params.get('q') === q && r.params.get('type') === 'statuses';
const noResults = { accounts: [], statuses: [], hashtags: [] };
/** A post that links to `url`, as search would return it. */
const linking = (id: string, author: string, url: string) =>
  post(id, author, { content: `<p>Read <a href="${url}">this</a></p>` });
const page = (maxId?: string) => (r: HttpRequest<unknown>) =>
  r.url === '/api/v1/timelines/link' &&
  r.params.get('url') === URL_ &&
  r.params.get('max_id') === (maxId ?? null);

describe('LinkTimeline', () => {
  let http: HttpTestingController;

  function setUp(url: string | null): ComponentFixture<LinkTimeline> {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { queryParamMap: of(convertToParamMap(url === null ? {} : { url })) },
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(LinkTimeline);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(async () => {
    // Status cards batch a follow-relationship lookup for their authors.
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.match((r) => r.url === '/api/v1/accounts/relationships').forEach((r) => r.flush([]));
    http.verify();
  });

  const text = (f: ComponentFixture<LinkTimeline>) =>
    (f.nativeElement as HTMLElement).textContent ?? '';

  it('lists posts sharing the link and pages back from the last one', () => {
    const f = setUp(URL_);
    http.expectOne(page()).flush([post('2', 'ann'), post('1', 'bo')]);
    f.detectChanges();

    expect(text(f)).toContain('Posts about this link');
    expect(text(f)).toContain('news.example');
    expect(f.nativeElement.querySelectorAll('app-status-card')).toHaveLength(2);

    const more = [...f.nativeElement.querySelectorAll('button')].find((b: HTMLButtonElement) =>
      b.textContent?.includes('Load more'),
    ) as HTMLButtonElement;
    more.click();
    http.expectOne(page('1')).flush([]);
    f.detectChanges();
    expect(text(f)).not.toContain('Load more');
  });

  function notTrending(): void {
    http
      .expectOne(page())
      .flush({ error: 'Record not found' }, { status: 404, statusText: 'Not Found' });
  }

  it('falls back to searching for the link when it is not trending', () => {
    const f = setUp(URL_);
    notTrending();
    http
      .expectOne(search(URL_))
      .flush({ ...noResults, statuses: [linking('9', 'cy', URL_), post('10', 'dd')] });
    f.detectChanges();

    // Search matches words loosely; a post that doesn't link the page is dropped.
    expect(f.nativeElement.querySelectorAll('app-status-card')).toHaveLength(1);
    expect(text(f)).toContain('posts found by searching for it');
    expect(text(f)).not.toContain("this one isn't");
    expect(text(f)).not.toContain('Load more');
  });

  it('searches again without the scheme when the full link finds nothing', () => {
    const f = setUp('https://www.news.example/story/?utm_source=x#top');
    http.expectOne((r) => r.url === '/api/v1/timelines/link').flush([]);
    http.expectOne(search('https://www.news.example/story/?utm_source=x#top')).flush(noResults);
    http.expectOne(search('news.example/story')).flush({
      ...noResults,
      statuses: [linking('8', 'di', 'https://news.example/story')],
    });
    f.detectChanges();

    expect(f.nativeElement.querySelectorAll('app-status-card')).toHaveLength(1);
  });

  it('explains a link nobody found and offers a search for the site', () => {
    const f = setUp(URL_);
    notTrending();
    http.expectOne(search(URL_)).flush(noResults);
    http.expectOne(search('news.example/story')).flush(noResults);
    f.detectChanges();

    expect(text(f)).toContain("this one isn't");
    expect(text(f)).toContain('Search posts mentioning news.example');
    const link = f.nativeElement.querySelector('a[href*="/search"]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/search?q=news.example&type=statuses');
    expect(f.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('treats a failing search as nothing found, not an error', () => {
    const f = setUp(URL_);
    notTrending();
    http.expectOne(search(URL_)).flush('nope', { status: 503, statusText: 'Unavailable' });
    http
      .expectOne(search('news.example/story'))
      .flush('nope', { status: 503, statusText: 'Unavailable' });
    f.detectChanges();

    expect(text(f)).toContain("this one isn't");
    expect(f.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('says so when the server has no link timelines at all', () => {
    const f = setUp(URL_);
    http.expectOne(page()).flush('Not Found', { status: 404, statusText: 'Not Found' });
    http.expectOne(search(URL_)).flush(noResults);
    http.expectOne(search('news.example/story')).flush(noResults);
    f.detectChanges();

    expect(text(f)).toContain('Mastodon 4.3 or newer');
  });

  it('shows an error for failures other than not trending', () => {
    const f = setUp(URL_);
    http.expectOne(page()).flush('boom', { status: 500, statusText: 'Server Error' });
    f.detectChanges();

    expect(text(f)).toContain('Could not load posts about this link');
  });

  it('makes no request without an http(s) link', () => {
    const f = setUp('javascript:alert(1)');
    f.detectChanges();

    expect(text(f)).toContain('No link was given');
  });
});
