import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../auth';
import { authInterceptor } from '../auth.interceptor';
import { Server } from '../server';
import { serverInterceptor } from '../server.interceptor';
import { FeedAggregator } from './feed-aggregator';
import { ProviderRegistry } from './provider-registry';

/** Regression boundary for session mode -> Home aggregator -> server/token interceptors. */
describe('authenticated Home feed', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([serverInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: ProviderRegistry, useValue: { linked: () => [] } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests the selected instance Home timeline with the active bearer token', async () => {
    TestBed.inject(Server).setBaseUrl('https://social.example');
    TestBed.inject(Auth).setToken('home-token');
    const aggregator = TestBed.inject(FeedAggregator);

    aggregator.reset();
    const page = firstValueFrom(aggregator.nextPage());

    const request = http.expectOne('https://social.example/api/v1/timelines/home?limit=20');
    expect(request.request.headers.get('Authorization')).toBe('Bearer home-token');
    request.flush([]);
    expect(await page).toEqual([]);
  });

  it('does not call the authenticated Home endpoint in Anonymous mode', async () => {
    TestBed.inject(Auth).enterAnonymous('https://social.example');
    const aggregator = TestBed.inject(FeedAggregator);

    aggregator.reset();

    expect(await firstValueFrom(aggregator.nextPage())).toEqual([]);
    http.expectNone((request) => request.url.includes('/api/v1/timelines/home'));
  });
});
