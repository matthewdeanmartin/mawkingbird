import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CorsProxySettings } from '../cors-proxy/cors-proxy-settings';
import { PasteFeedSubscriptions } from './paste-feed-subscriptions';
import { PastepileProvider } from './pastepile-provider';

describe('PastepileProvider', () => {
  let provider: PastepileProvider;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    provider = TestBed.inject(PastepileProvider);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('creates a paste and preserves the one-shot edit key', () => {
    let result: { editKey: string; rawUrl: string } | undefined;
    provider
      .create({
        title: 'Example',
        content: 'hello',
        language: 'plaintext',
        expiry: '10m',
        visibility: 'public',
      })
      .subscribe((created) => (result = created));

    const request = http.expectOne('https://www.pastepile.com/api/public/pastes');
    expect(request.request.body.visibility).toBe('public');
    request.flush({
      slug: 'abc',
      url: 'https://pastepile.com/p/abc',
      raw_url: 'https://pastepile.com/raw/abc',
      edit_key: 'edit-secret',
    });

    expect(result).toEqual({
      slug: 'abc',
      url: 'https://pastepile.com/p/abc',
      rawUrl: 'https://pastepile.com/raw/abc',
      editKey: 'edit-secret',
    });
  });

  it('updates and deletes with the edit key', () => {
    provider
      .update('abc', 'secret', { title: 'Changed', content: 'new', language: 'python' })
      .subscribe();
    const update = http.expectOne('https://www.pastepile.com/api/public/pastes/abc');
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body.edit_key).toBe('secret');
    update.flush({ ok: true });

    provider.delete('abc', 'secret').subscribe();
    const remove = http.expectOne('https://www.pastepile.com/api/public/pastes/abc');
    expect(remove.request.method).toBe('DELETE');
    expect(remove.request.headers.get('X-Edit-Key')).toBe('secret');
    remove.flush({ ok: true });
  });

  it('adapts recent pastes to shared read-only statuses', () => {
    let providerId: string | undefined;
    provider.recent().subscribe((items) => (providerId = provider.status(items[0]).provider));
    http.expectOne('https://www.pastepile.com/api/public/pastes?limit=50').flush({
      items: [
        {
          slug: 'abc',
          title: 'Title',
          language: 'python',
          preview: '<unsafe>',
          created_at: '2026-07-24T01:00:00Z',
          url: 'https://pastepile.com/p/abc',
          raw_url: 'https://pastepile.com/raw/abc',
        },
      ],
    });

    expect(providerId).toBe('paste');
  });

  /**
   * The apex host 308s to `www` and the redirect carries no CORS header, so a
   * browser refuses to follow it — which is what "Pastepile broke CORS" really
   * was. Addressing `www` directly is the fix, and these lock it in.
   */
  describe('the www host', () => {
    it('never addresses the apex host, which would 308 without CORS', () => {
      provider.recent().subscribe();
      const request = http.expectOne((r) => r.url.includes('pastepile.com'));

      expect(request.request.url.startsWith('https://www.pastepile.com/')).toBe(true);
      request.flush({ items: [] });
    });

    it('creates against the www host too, so the preflight is not redirected', () => {
      // The OPTIONS preflight 308s as well, which is why writes broke and not
      // just reads.
      provider
        .create({
          title: 't',
          content: 'c',
          language: 'plaintext',
          expiry: '10m',
          visibility: 'public',
        })
        .subscribe({ error: () => undefined });

      const request = http.expectOne((r) => r.method === 'POST');
      expect(request.request.url).toBe('https://www.pastepile.com/api/public/pastes');
      request.flush({ slug: 'a', url: 'u', raw_url: 'r', edit_key: 'k' });
    });

    it('points the feed account at www, so its avatar costs no redirect hop', () => {
      let account: { avatar: string; url: string } | undefined;
      provider.recent().subscribe((items) => {
        const status = provider.status(items[0]);
        account = { avatar: status.account.avatar, url: status.account.url };
      });
      http
        .expectOne((r) => r.url.includes('pastepile.com'))
        .flush({
          items: [
            {
              slug: 'abc',
              title: null,
              language: 'plaintext',
              preview: 'p',
              created_at: '2026-07-24T01:00:00Z',
              url: 'https://www.pastepile.com/p/abc',
              raw_url: 'https://www.pastepile.com/raw/abc',
            },
          ],
        });

      expect(account?.avatar.startsWith('https://www.pastepile.com/')).toBe(true);
      expect(account?.url.startsWith('https://www.pastepile.com/')).toBe(true);
    });
  });

  describe('CORS proxy opt-in', () => {
    it('fetches directly when the feed has not been opted in', () => {
      // Pastepile is CORS-clean at the www host, so the default must stay
      // direct — the proxy is there for the day that changes, not routine use.
      provider.recent().subscribe();
      const request = http.expectOne((r) => r.url.includes('pastepile.com'));

      expect(request.request.url).toContain('www.pastepile.com');
      request.flush({ items: [] });
    });

    it('routes through the configured proxy once the feed is opted in', () => {
      TestBed.inject(CorsProxySettings).select('custom', {
        template: 'https://proxy.test/raw?url={url}',
        encodeTarget: true,
      });
      TestBed.inject(PasteFeedSubscriptions).follow('pastepile', 'url', 'Pastepile');
      TestBed.inject(PasteFeedSubscriptions).setUseProxy('pastepile', true);

      provider.recent().subscribe();

      const request = http.expectOne((r) => r.url.startsWith('https://proxy.test/'));
      // The real endpoint travels as an encoded parameter, not as the host.
      expect(request.request.urlWithParams).toContain(
        encodeURIComponent('https://www.pastepile.com/api/public/pastes'),
      );
      request.flush({ items: [] });
    });

    it('stays direct when a proxy exists but the feed was not opted in', () => {
      // Configuring a proxy must never silently re-route traffic: the opt-in is
      // per feed and deliberate.
      TestBed.inject(CorsProxySettings).select('custom', {
        template: 'https://proxy.test/raw?url={url}',
        encodeTarget: true,
      });

      provider.recent().subscribe();

      const request = http.expectOne((r) => r.url.includes('pastepile.com'));
      expect(request.request.url).toContain('www.pastepile.com');
      request.flush({ items: [] });
    });

    it('tolerates a response with no items array', () => {
      // A proxy that returns an error page instead of JSON must not crash the
      // whole home timeline with "cannot read properties of undefined".
      let items: unknown[] | undefined;
      provider.recent().subscribe((result) => (items = result));
      http.expectOne((r) => r.url.includes('pastepile.com')).flush({});

      expect(items).toEqual([]);
    });
  });
});
