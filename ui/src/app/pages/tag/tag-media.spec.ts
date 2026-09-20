import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { Event as RouterEvent, NavigationEnd, Scroll } from '@angular/router';
import { ViewportScroller } from '@angular/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { Status } from '../../models';
import { TagMedia } from './tag-media';

function status(id: string, media = false): Status {
  return {
    id,
    content: '',
    sensitive: false,
    account: { id: '1' },
    media_attachments: media
      ? [
          {
            id: 'image',
            type: 'image',
            url: 'https://example.com/cat.jpg',
            preview_url: 'https://example.com/thumb.jpg',
            description: 'A sleeping cat',
          },
        ]
      : [],
  } as Status;
}
describe('Tag media', () => {
  let fixture: ComponentFixture<TagMedia>;
  let http: HttpTestingController;
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let routerEvents: Subject<RouterEvent>;
  beforeEach(() => {
    localStorage.clear();
    query = new BehaviorSubject(convertToParamMap({ tab: 'media' }));
    routerEvents = new Subject<RouterEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: query },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'events', 'get').mockReturnValue(routerEvents);
  });
  afterEach(() => http.verify());
  function start(): void {
    fixture = TestBed.createComponent(TagMedia);
    fixture.componentRef.setInput('tag', 'cats');
    fixture.detectChanges();
  }

  it('continues after a full page without pictures, keeping the raw cursor', () => {
    const viewport = TestBed.inject(ViewportScroller);
    vi.spyOn(viewport, 'getScrollPosition').mockReturnValue([0, 700]);
    const restoreScroll = vi.spyOn(viewport, 'scrollToPosition').mockImplementation(() => undefined);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    start();
    const initial = http.expectOne((request) => request.url === '/api/v1/timelines/tag/cats');
    expect(initial.request.params.get('only_media')).toBe('true');
    initial.flush(Array.from({ length: 20 }, (_, n) => status(String(100 - n))));
    fixture.detectChanges();
    const more = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(more.textContent?.trim()).toBe('More');
    more.click();
    const next = http.expectOne((request) => request.params.get('max_id') === '81');
    next.flush([status('80', true)]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img').alt).toBe('A sleeping cat');
    expect(fixture.nativeElement.querySelector('.media-more')).toBeNull();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.nativeElement.querySelector('.media-tile').click();
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { tab: 'media', photo: '80.0' }, replaceUrl: false }),
    );
    query.next(convertToParamMap({ tab: 'media', photo: '80.0' }));
    query.next(convertToParamMap({ tab: 'media' }));
    routerEvents.next(
      new Scroll(new NavigationEnd(2, '/tags/cats?tab=media', '/tags/cats?tab=media'), null, null),
    );
    expect(restoreScroll).toHaveBeenCalledWith([0, 700]);
  });

  it('offers retry when the first request fails', () => {
    start();
    http
      .expectOne((request) => request.url === '/api/v1/timelines/tag/cats')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Couldn't load pictures");
    fixture.nativeElement.querySelector('button').click();
    http.expectOne((request) => request.url === '/api/v1/timelines/tag/cats').flush([]);
  });

  it('uses the public instance and native cursor for anonymous accounts', () => {
    TestBed.inject(Auth).enterAnonymous('https://public.example');
    start();
    http
      .expectOne(
        (request) =>
          request.url === 'https://public.example/api/v1/timelines/tag/cats' &&
          request.params.get('only_media') === 'true',
      )
      .flush(Array.from({ length: 20 }, (_, n) => status(String(100 - n))));
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    http
      .expectOne(
        (request) =>
          request.url === 'https://public.example/api/v1/timelines/tag/cats' &&
          request.params.get('max_id') === '81',
      )
      .flush([]);
  });

  it('does not let a slower previous tag overwrite the new tag', () => {
    start();
    const old = http.expectOne((request) => request.url === '/api/v1/timelines/tag/cats');
    fixture.componentRef.setInput('tag', 'dogs');
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/timelines/tag/dogs')
      .flush([status('new', true)]);
    old.flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.media-tile')).toHaveLength(1);
  });
});
