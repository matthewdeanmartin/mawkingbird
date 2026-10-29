import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../models';
import { AccountAnalytics } from './account-analytics';

const ME = { id: 'me', acct: 'me', username: 'me', display_name: 'Me' } as Account;

describe('AccountAnalytics load failure', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function statuses() {
    return http.expectOne((req) => req.url.endsWith('/api/v1/accounts/me/statuses'));
  }

  it('says why the posts did not load and retries on the spot', () => {
    const fixture = TestBed.createComponent(AccountAnalytics);
    fixture.componentRef.setInput('account', ME);
    fixture.detectChanges();
    http.match((req) => req.url.includes('/followers')).forEach((req) => req.flush([]));

    statuses().flush(null, { status: 429, statusText: 'Too Many Requests' });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const alert = root.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("Couldn't load posts.");
    expect(alert.textContent).toContain('limiting how fast it answers');
    expect(alert.textContent).not.toContain('try again later');

    alert.querySelector('button')!.click();
    fixture.detectChanges();
    statuses().flush([]);
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.textContent).toContain('Nothing to analyze yet');
  });

  it('names an unreachable server rather than a status code', () => {
    const fixture = TestBed.createComponent(AccountAnalytics);
    fixture.componentRef.setInput('account', ME);
    fixture.detectChanges();
    statuses().error(new ProgressEvent('error'), { status: 0 });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("couldn't be reached");
  });
});
