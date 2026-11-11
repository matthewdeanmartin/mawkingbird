import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { Account } from '../../models';
import { Server } from '../../server';
import { ServerSuggestions } from './server-suggestions';

function account(id: string, acct: string): Account {
  return {
    id,
    username: acct,
    acct,
    display_name: acct,
    url: '',
    fields: [],
  } as unknown as Account;
}

describe('ServerSuggestions', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(Auth).token.set('suggestions-token');
    TestBed.inject(Server).setBaseUrl('https://home.example');
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function setUp(): ComponentFixture<ServerSuggestions> {
    const fixture = TestBed.createComponent(ServerSuggestions);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === '/api/v2/suggestions');
    expect(req.request.params.get('limit')).toBe('20');
    req.flush([
      { sources: ['most_followed'], account: account('1', 'ann') },
      { sources: ['similar_to_recently_followed'], account: account('2', 'bo') },
    ]);
    http
      .expectOne((r) => r.url === '/api/v1/accounts/relationships')
      .flush([
        { id: '1', following: false },
        { id: '2', following: false },
      ]);
    fixture.detectChanges();
    return fixture;
  }

  it("shows each suggestion with the server's reason", () => {
    const text = (setUp().nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Suggested by your server');
    expect(text).toContain('Popular on home.example');
    expect(text).toContain('Similar to profiles you recently followed');
  });

  it('removes a suggestion for good when dismissed', () => {
    const fixture = setUp();
    const dismiss = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        '.suggestion-dismiss',
      ),
    ];
    dismiss[0].click();
    const req = http.expectOne('/api/v1/suggestions/1');
    expect(req.request.method).toBe('DELETE');
    req.flush({});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-account-result-card')).toHaveLength(1);
  });

  it('says so when the server has none', () => {
    const fixture = TestBed.createComponent(ServerSuggestions);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/v2/suggestions').flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('no suggestions for you right now');
  });
});
