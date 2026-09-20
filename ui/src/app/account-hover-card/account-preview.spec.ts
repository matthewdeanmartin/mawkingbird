import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountPreview } from './account-preview';
import { Account } from '../models';
import { Auth } from '../auth';

describe('Member account preview', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(Auth).setToken('preview-test');
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('loads relationships on explicit preview, shows useful context, and closes with Escape', () => {
    const fixture = TestBed.createComponent(AccountPreview);
    fixture.componentRef.setInput('account', {
      id: '123',
      username: 'alice',
      acct: 'alice',
      display_name: 'Alice',
      url: 'https://social.example/@alice',
      note: '<p>Cat photographer</p>',
      avatar: '',
      avatar_static: '',
      statuses_count: 20,
      followers_count: 30,
      following_count: 40,
    } as Account);
    fixture.detectChanges();
    http.expectNone((request) => request.url.includes('relationships'));
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    http
      .expectOne((request) => request.url.includes('relationships'))
      .flush([{ id: '123', following: true, followed_by: true }]);
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('app-account-hover-card') as HTMLElement;
    expect(card.classList.contains('inline')).toBe(true);
    expect(card.textContent).toContain('@alice@social.example');
    expect(card.textContent).toContain('Cat photographer');
    expect(card.textContent).toContain('Mutuals');
    expect(card.textContent).toContain('20');
    expect(card.querySelector('a')?.getAttribute('href')).toContain(
      '/accounts/123/@alice@social.example',
    );
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-account-hover-card')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
