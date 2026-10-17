import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../models';
import { AccountHoverCard } from './account-hover-card';

const ACCOUNT = {
  id: '42',
  username: 'kay',
  acct: 'kay@example.social',
  display_name: 'Kay',
  note: '<p>I take photographs of bridges.</p>',
  avatar: 'https://example.social/a.png',
  followers_count: 321,
  following_count: 45,
  statuses_count: 6789,
} as Account;

@Component({
  imports: [AccountHoverCard],
  template: `<span class="hover-anchor"
    ><a href="#profile">Kay</a><app-account-hover-card [account]="account"
  /></span>`,
})
class HoverHost {
  account = ACCOUNT;
}

describe('AccountHoverCard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  function render(account: Account): HTMLElement {
    const fixture = TestBed.createComponent(AccountHoverCard);
    fixture.componentRef.setInput('account', account);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('loads Following when the profile trigger is hovered, before entering the popup', async () => {
    const fixture = TestBed.createComponent(HoverHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector('.hover-anchor')!.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(root.querySelector<HTMLButtonElement>('.hc-follow')!.disabled).toBe(true);
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/v1/accounts/relationships?id%5B%5D=42')
      .flush([{ id: '42', following: true, followed_by: true }]);
    fixture.detectChanges();
    expect(root.querySelector('.hc-follow')!.textContent).toContain('Following');
    root.querySelector('a')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    http.verify();
  });

  it('ignores a previous profile response after the card is reused', () => {
    const fixture = TestBed.createComponent(AccountHoverCard);
    fixture.componentRef.setInput('account', ACCOUNT);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const http = TestBed.inject(HttpTestingController);
    root.querySelector('.hover-card')!.dispatchEvent(new MouseEvent('mouseenter'));
    const old = http.expectOne('/api/v1/accounts/relationships?id%5B%5D=42');
    fixture.componentRef.setInput('account', { ...ACCOUNT, id: '43' });
    fixture.detectChanges();
    root.querySelector('.hover-card')!.dispatchEvent(new MouseEvent('mouseenter'));
    http
      .expectOne('/api/v1/accounts/relationships?id%5B%5D=43')
      .flush([{ id: '43', following: true }]);
    old.flush([{ id: '42', following: false }]);
    fixture.detectChanges();
    expect(root.querySelector('.hc-follow')!.textContent).toContain('Following');
    http.verify();
  });

  it('shows name, handle, bio and the three stats', () => {
    const el = render(ACCOUNT);
    expect(el.querySelector('.hc-name')?.textContent).toContain('Kay');
    expect(el.querySelector('.hc-acct')?.textContent).toContain('@kay@example.social');
    expect(el.querySelector('.hc-note')?.textContent).toContain('photographs of bridges');
    const stats = el.querySelector('.hc-stats')?.textContent ?? '';
    expect(stats).toContain('6,789');
    expect(stats).toContain('45');
    expect(stats).toContain('321');
  });

  it('shows a follow action without eagerly fetching the relationship', () => {
    const el = render(ACCOUNT);
    expect(el.querySelector('button')?.textContent).toContain('Follow');
    TestBed.inject(HttpTestingController).expectNone('/api/v1/accounts/relationships');
  });

  it('uses Request and Requested for an approval-only account', () => {
    const fixture = TestBed.createComponent(AccountHoverCard);
    fixture.componentRef.setInput('account', { ...ACCOUNT, locked: true });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('button')?.textContent).toContain('Request');

    el.querySelector('.hover-card')?.dispatchEvent(new MouseEvent('mouseenter'));
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne('/api/v1/accounts/relationships?id%5B%5D=42')
      .flush([{ id: '42', following: false, requested: false }]);
    fixture.detectChanges();
    (el.querySelector('button') as HTMLButtonElement).click();
    httpMock
      .expectOne('/api/v1/accounts/42/follow')
      .flush({ id: '42', following: false, requested: true });
    fixture.detectChanges();

    expect(el.querySelector('button')?.textContent).toContain('Requested');
  });

  it('omits the bio block when the account has no note', () => {
    const el = render({ ...ACCOUNT, note: '' });
    expect(el.querySelector('.hc-note')).toBeNull();
  });

  it('does not call includes on a missing id from stale cached data', () => {
    const el = render({ ...ACCOUNT, id: undefined } as unknown as Account);
    expect(el.querySelector('.hc-name')?.textContent).toContain('Kay');
    expect(el.querySelector('.hc-stats')).toBeNull();
  });
});
