import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../auth';
import { Account } from '../models';
import { PeopleBrowser } from './people-browser';

function account(id: string): Account {
  return {
    id,
    username: `user${id}`,
    acct: `user${id}`,
    display_name: `User ${id}`,
    note: '',
    url: `https://social.example/@user${id}`,
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 2,
    following_count: 3,
    statuses_count: 4,
    bot: false,
    locked: false,
    fields: [],
  };
}

describe('PeopleBrowser', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).enterAnonymous('https://home.example');
  });

  afterEach(() => httpMock.verify());

  it('loads another profile followers from its public server without relationship requests', () => {
    const fixture = TestBed.createComponent(PeopleBrowser);
    fixture.componentRef.setInput('accountId', '900');
    fixture.componentRef.setInput('mode', 'followers');
    fixture.componentRef.setInput('server', 'https://social.example');
    fixture.detectChanges();

    const request = httpMock.expectOne(
      (candidate) => candidate.url === 'https://social.example/api/v1/accounts/900/followers',
    );
    expect(request.request.params.get('limit')).toBe('80');
    request.flush([account('10')]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('User 10');
    httpMock.expectNone((candidate) => candidate.url.includes('/relationships'));
    expect(fixture.nativeElement.querySelector('.person-name-row')?.getAttribute('href')).toContain(
      '/accounts/anonymous-account.',
    );
  });

  it('explains a withheld list when the profile reports connections but the API returns none', () => {
    const fixture = TestBed.createComponent(PeopleBrowser);
    fixture.componentRef.setInput('accountId', '900');
    fixture.componentRef.setInput('mode', 'following');
    fixture.componentRef.setInput('reportedCount', 42);
    fixture.componentRef.setInput('server', 'https://social.example');
    fixture.detectChanges();

    httpMock
      .expectOne(
        (candidate) => candidate.url === 'https://social.example/api/v1/accounts/900/following',
      )
      .flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('following list isn’t available');
    expect(fixture.nativeElement.textContent).toContain('profile reports 42');
    expect(fixture.nativeElement.textContent).toContain('privacy settings');
    expect(fixture.nativeElement.textContent).not.toContain('Not following anyone');
  });

  /**
   * The symptom this whole change exists for: a profile advertising thousands of
   * followers whose list stops after one page, under the words "End of the
   * list." The reader concludes the account is hiding something, or that the app
   * is broken, and neither is true — the server's `Link` header did not survive
   * a CORS hop.
   */
  it('does not call a truncated list the end of the list', () => {
    const fixture = TestBed.createComponent(PeopleBrowser);
    fixture.componentRef.setInput('accountId', '900');
    fixture.componentRef.setInput('mode', 'followers');
    fixture.componentRef.setInput('server', 'https://social.example');
    fixture.componentRef.setInput('reportedCount', 3000);
    fixture.detectChanges();

    // One short page, no Link header: the walk genuinely cannot continue.
    httpMock
      .expectOne((c) => c.url === 'https://social.example/api/v1/accounts/900/followers')
      .flush([account('10')]);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Stopped at 1 of 3000');
    expect(text).not.toContain('End of the list.');
  });

  it('still says end of the list when the count agrees with what loaded', () => {
    const fixture = TestBed.createComponent(PeopleBrowser);
    fixture.componentRef.setInput('accountId', '900');
    fixture.componentRef.setInput('mode', 'followers');
    fixture.componentRef.setInput('server', 'https://social.example');
    fixture.componentRef.setInput('reportedCount', 2);
    fixture.detectChanges();

    httpMock
      .expectOne((c) => c.url === 'https://social.example/api/v1/accounts/900/followers')
      .flush([account('10'), account('11')]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('End of the list.');
  });
});
