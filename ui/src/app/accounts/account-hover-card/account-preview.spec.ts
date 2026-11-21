import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountPreview } from './account-preview';
import { Account } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { AnonymousAccount } from '../anonymous/anonymous-account';

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
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    const button = fixture.nativeElement.querySelector('.summary') as HTMLElement;
    const panel = fixture.nativeElement.querySelector('[popover]') as HTMLElement;
    panel.showPopover = vi.fn();
    panel.hidePopover = vi.fn();
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    fixture.detectChanges();
    http
      .expectOne((request) => request.url.includes('relationships'))
      .flush([{ id: '123', following: true, followed_by: true }]);
    fixture.detectChanges();
    http.expectNone((request) => request.url.endsWith('/accounts/123/statuses'));
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.querySelector('article')).toBeNull();
    expect(panel.showPopover).toHaveBeenCalledOnce();
    const card = fixture.nativeElement.querySelector('app-account-hover-card') as HTMLElement;
    expect(card.classList.contains('inline')).toBe(true);
    expect(card.textContent).toContain('@alice@social.example');
    expect(card.textContent).toContain('Cat photographer');
    expect(card.textContent).toContain('Mutuals');
    expect(card.textContent).toContain('20');
    expect(card.querySelector('a')?.getAttribute('href')).toContain(
      '/accounts/123/@alice@social.example',
    );
    vi.useFakeTimers();
    try {
      button.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
      vi.advanceTimersByTime(450);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-account-hover-card')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-account-hover-card')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  describe('as Anonymous', () => {
    function open(account: Partial<Account>) {
      TestBed.inject(Auth).enterAnonymous();
      TestBed.inject(AnonymousAccount).activate('https://mastodon.social');
      const fixture = TestBed.createComponent(AccountPreview);
      fixture.componentRef.setInput('account', {
        username: 'bob',
        display_name: 'Bob',
        note: '',
        avatar: '',
        avatar_static: '',
        statuses_count: 1,
        followers_count: 1,
        following_count: 1,
        ...account,
      } as Account);
      fixture.detectChanges();
      const panel = fixture.nativeElement.querySelector('[popover]') as HTMLElement;
      panel.showPopover = vi.fn();
      panel.hidePopover = vi.fn();
      (fixture.nativeElement.querySelector('.summary') as HTMLElement).dispatchEvent(
        new FocusEvent('focusin', { bubbles: true }),
      );
      fixture.detectChanges();
      return { fixture, panel };
    }

    it('opens a remote account preview without looking up its posts', () => {
      const { panel } = open({
        id: '9',
        acct: 'bob@home.example',
        url: 'https://home.example/@bob',
      });
      expect(panel.textContent).toContain('Bob');
      http.expectNone((request) => request.url.includes('/accounts/'));
    });

    it('shows the profile link for a local account without fetching a timeline', () => {
      const { panel } = open({ id: '9', acct: 'bob', url: 'https://mastodon.social/@bob' });
      expect(panel.querySelector('a')?.getAttribute('href')).toContain('/accounts/');
      http.expectNone((request) => request.url.includes('/statuses'));
    });
  });
});
