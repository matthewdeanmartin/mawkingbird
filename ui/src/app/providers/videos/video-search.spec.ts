import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { Status } from '../../models';
import { VideoSearch, videoPostsOnly, withoutSiteOperators } from './video-search';

const post = (id: string, created: string, video = true): Status =>
  ({
    id,
    url: `https://a.example/@x/${id}`,
    created_at: created,
    content: video ? `<p><a href="https://youtu.be/aaaaaaaaaaa">clip</a></p>` : '<p>words</p>',
    media_attachments: [],
    card: null,
    reblog: null,
  }) as unknown as Status;

describe('video search helpers', () => {
  it('drops site: operators, which mean nothing to Mastodon', () => {
    expect(withoutSiteOperators('site:youtube.com cats')).toBe('cats');
    expect(withoutSiteOperators('cats -site:tiktok.com  dogs')).toBe('cats dogs');
    expect(withoutSiteOperators('site:youtube.com ')).toBe('');
  });

  it('keeps video posts once each, newest first', () => {
    const a = post('a', '2026-10-01T00:00:00Z');
    const b = post('b', '2026-10-02T00:00:00Z');
    const text = post('t', '2026-10-03T00:00:00Z', false);
    expect(
      videoPostsOnly([
        [a, text],
        [b, a],
      ]).map((s) => s.id),
    ).toEqual(['b', 'a']);
  });
});

describe('VideoSearch', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks post search and each word as a hashtag, and survives a failing source', async () => {
    TestBed.inject(Auth).kind.set('mastodon');
    TestBed.inject(Auth).token.set('t');
    const search = TestBed.inject(VideoSearch);
    expect(search.tagsFor('site:youtube.com tape machines')).toEqual(['tape', 'machines']);

    const result = firstValueFrom(search.posts('site:youtube.com tape machines'));
    http
      .expectOne((r) => r.url === '/api/v2/search' && r.params.get('q') === 'tape machines')
      .flush('nope', { status: 503, statusText: 'Unavailable' });
    http
      .expectOne((r) => r.url === '/api/v1/timelines/tag/tape')
      .flush([post('1', '2026-10-01T00:00:00Z'), post('2', '2026-10-02T00:00:00Z', false)]);
    http
      .expectOne((r) => r.url === '/api/v1/timelines/tag/machines')
      .flush([post('3', '2026-10-03T00:00:00Z')]);

    expect((await result).map((s) => s.id)).toEqual(['3', '1']);
  });

  it('searches nothing for a query that is only operators', async () => {
    const search = TestBed.inject(VideoSearch);
    expect(await firstValueFrom(search.posts('site:youtube.com'))).toEqual([]);
  });
});
