import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CorsProxy } from '../cors-proxy/cors-proxy';
import { ProxyConsent } from '../proxy-consent-store';
import { MataroaApi } from './mataroa-api';
import { MataroaSettings } from './mataroa-settings';

describe('MataroaApi', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: CorsProxy,
          useValue: {
            available: () => true,
            entry: () => ({ id: 'custom', label: 'My proxy', forwardsCustomHeaders: true }),
            proxyCredentialedRequest: () => ({
              url: 'https://proxy.example/fetch',
              headers: new HttpHeaders({ 'X-Proxy-Key': 'proxy-secret' }),
            }),
          },
        },
        { provide: ProxyConsent, useValue: { granted: () => true } },
      ],
    });
    TestBed.inject(MataroaSettings).connect('mataroa-secret', 'https://writer.mataroa.blog/');
    http = TestBed.inject(HttpTestingController);
  });

  it('publishes a titled Markdown post through the consented CORS proxy', () => {
    let resultUrl = '';
    TestBed.inject(MataroaApi)
      .createPost('A title', '## Markdown')
      .subscribe((result) => (resultUrl = result.url));

    const request = http.expectOne('https://proxy.example/fetch');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer mataroa-secret');
    expect(request.request.headers.get('X-Proxy-Key')).toBe('proxy-secret');
    expect(request.request.body).toMatchObject({
      title: 'A title',
      body: '## Markdown',
      published_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    request.flush({ ok: true, slug: 'a-title', url: 'https://writer.mataroa.blog/blog/a-title/' });

    expect(resultUrl).toBe('https://writer.mataroa.blog/blog/a-title/');
  });
});
