import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Server } from './server';
import { ServerAbout } from './server-about';
import { serverInterceptor } from './server.interceptor';

describe('ServerAbout', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([serverInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(Server).setBaseUrl('https://social.example');
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('does not check optional pages until load is requested', () => {
    TestBed.inject(ServerAbout);

    http.expectNone((request) => request.url.includes('/api/v1/instance/'));
  });

  it('stores availability per server and reuses it without more API calls', () => {
    const about = TestBed.inject(ServerAbout);
    about.load();
    http
      .expectOne('https://social.example/api/v1/instance/rules')
      .flush([{ id: '1', text: 'Be kind', hint: '' }]);
    http.expectOne('https://social.example/api/v1/instance/terms_of_service').flush('', {
      status: 404,
      statusText: 'Not Found',
    });

    expect(about.hasRules()).toBe(true);
    expect(about.hasTerms()).toBe(false);

    about.load();
    http.expectNone((request) => request.url.includes('/api/v1/instance/'));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([serverInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(Server).setBaseUrl('https://social.example');
    const revived = TestBed.inject(ServerAbout);
    expect(revived.hasRules()).toBe(true);
    expect(revived.hasTerms()).toBe(false);
    revived.load();
    TestBed.inject(HttpTestingController).expectNone((request) =>
      request.url.includes('/api/v1/instance/'),
    );
  });
});
