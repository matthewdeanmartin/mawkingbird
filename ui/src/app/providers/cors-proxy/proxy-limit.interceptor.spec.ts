import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { proxyLimitInterceptor } from './proxy-limit.interceptor';
import { CorsProxySettings } from './cors-proxy-settings';
import { ProxyActivity, PROXY_PAUSED_KEY, PROXY_PROMPT_KEY } from './proxy-activity';
import { SupporterStatus } from '../account/supporter-status';
import { signal } from '@angular/core';

describe('proxyLimitInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let activity: ProxyActivity;
  const url = 'https://cors.mawkingbird.com/?route=feeds&url=https://example.org/feed';
  beforeEach(() => {
    localStorage.removeItem(PROXY_PAUSED_KEY);
    sessionStorage.removeItem(PROXY_PROMPT_KEY);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([proxyLimitInterceptor])),
        provideHttpClientTesting(),
        {
          provide: CorsProxySettings,
          useValue: { resolve: () => ({ pattern: 'https://cors.mawkingbird.com/?url={url}' }) },
        },
        { provide: SupporterStatus, useValue: { isSupporter: signal(false) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    activity = TestBed.inject(ProxyActivity);
  });
  afterEach(() => {
    http.verify();
    localStorage.removeItem(PROXY_PAUSED_KEY);
    sessionStorage.removeItem(PROXY_PROMPT_KEY);
  });
  it('distinguishes the free proxy limit from an upstream publisher limit', () => {
    client.get(url).subscribe({ error: () => undefined });
    http
      .expectOne(url)
      .flush('', { status: 429, statusText: 'Limited', headers: { 'X-Proxy-Source': 'upstream' } });
    expect(activity.notice()).toBe(false);
    client.get(url).subscribe({ error: () => undefined });
    http.expectOne(url).flush('', {
      status: 429,
      statusText: 'Limited',
      headers: { 'X-Proxy-Source': 'proxy', 'Retry-After': '60' },
    });
    expect(activity.prompt()).toBe(true);
    client.get(url).subscribe({ error: () => undefined });
    http.expectNone(url);
  });
  it('recognizes proxy refusals inside successful batch envelopes', () => {
    client.post(url, {}).subscribe();
    http.expectOne(url).flush({ results: [{ status: 429, source: 'proxy' }] });
    expect(activity.prompt()).toBe(true);
  });
  it('blocks queued proxy work after disabling while permitting direct and account requests', () => {
    activity.setPaused(true);
    client.get(url).subscribe({ error: () => undefined });
    http.expectNone(url);
    client.get('https://example.org/direct').subscribe();
    http.expectOne('https://example.org/direct').flush('');
    const catalogue = 'https://cors.mawkingbird.com/plus/catalogue';
    client.get(catalogue).subscribe();
    http.expectOne(catalogue).flush({});
  });
});
