import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from './auth';
import { dedupeInterceptor } from './dedupe.interceptor';
import { externalFetch } from './providers/external-fetch';
import { Server } from './server';

describe('dedupeInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        Auth,
        Server,
        provideHttpClient(withInterceptors([dedupeInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('shares identical concurrent GETs but does not retain a completed response', () => {
    const values: number[][] = [];
    http.get<number[]>('/api/items').subscribe((value) => values.push(value));
    http.get<number[]>('/api/items').subscribe((value) => values.push(value));

    const first = httpMock.expectOne('/api/items');
    first.flush([1]);
    expect(values).toEqual([[1], [1]]);

    http.get<number[]>('/api/items').subscribe();
    httpMock.expectOne('/api/items').flush([2]);
  });

  it('does not deduplicate explicitly external fetches', () => {
    const options = { context: externalFetch(), responseType: 'text' as const };
    http.get('https://example.com/feed', options).subscribe();
    http.get('https://example.com/feed', options).subscribe();

    const requests = httpMock.match('https://example.com/feed');
    expect(requests).toHaveLength(2);
    requests.forEach((request) => request.flush('ok'));
  });
});
