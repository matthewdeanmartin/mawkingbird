import { HttpRequest, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { post } from '../../testing/forum-fixtures';
import { LinkTimeline } from './link-timeline';

const URL_ = 'https://news.example/story';
const page = (maxId?: string) => (r: HttpRequest<unknown>) =>
  r.url === '/api/v1/timelines/link' &&
  r.params.get('url') === URL_ &&
  r.params.get('max_id') === (maxId ?? null);

describe('LinkTimeline', () => {
  let http: HttpTestingController;

  function setUp(url: string | null): ComponentFixture<LinkTimeline> {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
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

  it('explains a link the server is not trending instead of showing an error', () => {
    const f = setUp(URL_);
    http
      .expectOne(page())
      .flush({ error: 'Record not found' }, { status: 404, statusText: 'Not Found' });
    f.detectChanges();

    expect(text(f)).toContain("this one isn't");
    expect(f.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('says so when the server has no link timelines at all', () => {
    const f = setUp(URL_);
    http.expectOne(page()).flush('Not Found', { status: 404, statusText: 'Not Found' });
    f.detectChanges();

    expect(text(f)).toContain('Mastodon 4.3 or newer');
  });

  it('makes no request without an http(s) link', () => {
    const f = setUp('javascript:alert(1)');
    f.detectChanges();

    expect(text(f)).toContain('No link was given');
  });
});
