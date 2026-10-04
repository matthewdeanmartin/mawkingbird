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
  it('clears old rules immediately and rejects late responses from the previous server', () => {
    const about = TestBed.inject(ServerAbout);
    about.load();
    const oldRules = http.expectOne('https://social.example/api/v1/instance/rules');
    const oldTerms = http.expectOne('https://social.example/api/v1/instance/terms_of_service');
    TestBed.inject(Server).setBaseUrl('https://mastomini.local');
    expect(about.rules()).toBeUndefined();
    expect(about.loading()).toBe(false);
    about.load();
    oldRules.flush([{ id: 'old', text: 'Old rule' }]);
    oldTerms.flush({ content: 'Old terms' });
    expect(about.rules()).toBeUndefined();
    http
      .expectOne('https://mastomini.local/api/v1/instance/rules')
      .flush([{ id: 'new', text: 'New rule' }]);
    http
      .expectOne('https://mastomini.local/api/v1/instance/terms_of_service')
      .flush({ content: 'New terms' });
    expect(about.rules()?.[0].id).toBe('new');
    TestBed.inject(Server).setBaseUrl('https://other.example');
    expect(about.hasRules()).toBe(false);
    TestBed.inject(Server).setBaseUrl('https://mastomini.local');
    expect(about.rules()?.[0].id).toBe('new');
  });
});
