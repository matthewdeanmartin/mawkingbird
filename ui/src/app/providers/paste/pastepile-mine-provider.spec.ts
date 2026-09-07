import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PastepileKey } from './pastepile-key';
import { PastepileMineProvider } from './pastepile-mine-provider';
import { PasteRecentItem } from './paste-provider';

describe('PastepileMineProvider', () => {
  let provider: PastepileMineProvider;
  let keyStore: PastepileKey;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    provider = TestBed.inject(PastepileMineProvider);
    keyStore = TestBed.inject(PastepileKey);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('refuses without a key, and spends no request finding out', () => {
    const out: { error?: Error } = {};
    provider.recent().subscribe({ error: (err: Error) => (out.error = err) });

    http.expectNone(() => true);
    expect(out.error?.message).toContain('Pastepile API key');
    // Points at where the key is obtained, not just at the problem.
    expect(out.error?.message).toContain('Pastes page');
  });

  it('authenticates with the X-API-Key header, not a query parameter', () => {
    // Verified against the live API: `?key=` and `?api_key=` are ignored and
    // the request succeeds with an EMPTY list, which would read as "you have no
    // pastes" forever. Only the header actually scopes the result.
    keyStore.connect('pk_live_abc');
    let items: PasteRecentItem[] | undefined;
    provider.recent().subscribe((result) => (items = result));

    const request = http.expectOne((r) => r.url.includes('scope=mine'));
    expect(request.request.headers.get('X-API-Key')).toBe('pk_live_abc');
    expect(request.request.urlWithParams).not.toContain('pk_live_abc');
    request.flush({
      items: [
        {
          slug: 'abc',
          title: 'mine',
          language: 'plaintext',
          preview: 'p',
          created_at: '2026-07-30T00:00:00Z',
          url: 'https://www.pastepile.com/p/abc',
          raw_url: 'https://www.pastepile.com/raw/abc',
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items?.[0].slug).toBe('abc');
  });

  it('asks for the mine scope rather than the public feed', () => {
    keyStore.connect('pk_live_abc');
    provider.recent().subscribe();

    const request = http.expectOne((r) => r.url.includes('pastepile.com'));
    expect(request.request.url).toContain('scope=mine');
    request.flush({ items: [] });
  });

  it('tolerates a response with no items array', () => {
    keyStore.connect('pk_live_abc');
    let items: PasteRecentItem[] | undefined;
    provider.recent().subscribe((result) => (items = result));
    http.expectOne((r) => r.url.includes('pastepile.com')).flush({});

    expect(items).toEqual([]);
  });

  it('attributes statuses to a private account, not the public feed', () => {
    keyStore.connect('pk_live_abc');
    let items: PasteRecentItem[] = [];
    provider.recent().subscribe((result) => (items = result));
    http
      .expectOne((r) => r.url.includes('pastepile.com'))
      .flush({
        items: [
          {
            slug: 'abc',
            title: 'kernel <panic>',
            language: 'plaintext',
            preview: 'p',
            created_at: '2026-07-30T00:00:00Z',
            url: 'https://www.pastepile.com/p/abc',
            raw_url: 'https://www.pastepile.com/raw/abc',
          },
        ],
      });

    const status = provider.status(items[0]);
    expect(status.account.id).toBe('paste:pastepile-mine');
    // These are the user's own pastes, so the feed account is not a public one.
    expect(status.account.discoverable).toBe(false);
    // Titles are user input and must never reach the DOM as markup.
    expect(status.content).toContain('kernel &lt;panic&gt;');
  });

  it('points its provider ref back at Pastepile so edit keys still resolve', () => {
    keyStore.connect('pk_live_abc');
    let items: PasteRecentItem[] = [];
    provider.recent().subscribe((result) => (items = result));
    http
      .expectOne((r) => r.url.includes('pastepile.com'))
      .flush({
        items: [
          {
            slug: 'abc',
            title: null,
            language: 'plaintext',
            preview: 'p',
            created_at: '2026-07-30T00:00:00Z',
            url: 'https://www.pastepile.com/p/abc',
            raw_url: 'https://www.pastepile.com/raw/abc',
          },
        ],
      });

    // The paste lives at Pastepile; this feed is only a view of it.
    const ref = provider.status(items[0]).providerRef as { providerId: string };
    expect(ref.providerId).toBe('pastepile');
  });

  it('reports whether it has a key', () => {
    expect(provider.hasKey()).toBe(false);
    keyStore.connect('pk_live_abc');
    expect(provider.hasKey()).toBe(true);
  });
});
