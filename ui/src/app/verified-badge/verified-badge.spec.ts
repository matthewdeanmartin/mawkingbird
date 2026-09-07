import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../auth';
import { ClientPrefs } from '../client-prefs';
import { Account } from '../models';
import { VERIFIED_FOLLOWER_THRESHOLD, VerifiedBadge } from './verified-badge';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: '1',
    username: 'alice',
    acct: 'alice',
    display_name: 'Alice',
    followers_count: 10,
    following_count: 5,
    statuses_count: 3,
    note: '',
    avatar: '',
    header: '',
    locked: false,
    bot: false,
    created_at: '2020-01-01T00:00:00Z',
    ...overrides,
  } as Account;
}

describe('VerifiedBadge', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function render(account: Account, viewer: Account | null = null): HTMLElement {
    const auth = TestBed.inject(Auth);
    auth.account.set(viewer);
    const fixture = TestBed.createComponent(VerifiedBadge);
    fixture.componentRef.setInput('account', account);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows a public check at the follower threshold or more', () => {
    const el = render(makeAccount({ followers_count: VERIFIED_FOLLOWER_THRESHOLD }));
    const badge = el.querySelector('svg.badge');
    expect(badge).not.toBeNull();
    expect(badge!.classList.contains('self')).toBe(false);
  });

  it('shows no check just below the threshold for other accounts', () => {
    const el = render(makeAccount({ followers_count: VERIFIED_FOLLOWER_THRESHOLD - 1 }));
    expect(el.querySelector('svg.badge')).toBeNull();
  });

  it('the threshold is 9,728 — the 10,000th most-followed account', () => {
    expect(VERIFIED_FOLLOWER_THRESHOLD).toBe(9_728);
  });

  it("shows the self-only check on the viewer's own account regardless of followers", () => {
    const viewer = makeAccount({ id: '42', followers_count: 2 });
    const el = render(viewer, viewer);
    const badge = el.querySelector('svg.badge');
    expect(badge).not.toBeNull();
    expect(badge!.classList.contains('self')).toBe(true);
    expect(badge!.querySelector('title')?.textContent).toContain('only you');
  });

  it('prefers the public check when the viewer is also over the threshold', () => {
    const viewer = makeAccount({ id: '42', followers_count: 80_000 });
    const el = render(viewer, viewer);
    const badge = el.querySelector('svg.badge');
    expect(badge).not.toBeNull();
    expect(badge!.classList.contains('self')).toBe(false);
  });

  it('shows nothing to logged-out viewers for small accounts', () => {
    const el = render(makeAccount({ followers_count: 100 }), null);
    expect(el.querySelector('svg.badge')).toBeNull();
  });

  it('famous mode checks anyone with more followers than the viewer, and no one with fewer', () => {
    TestBed.inject(ClientPrefs).setVerifiedMode('famous');
    const viewer = makeAccount({ id: '42', followers_count: 50 });

    const above = render(makeAccount({ followers_count: 51 }), viewer);
    expect(above.querySelector('svg.badge')).not.toBeNull();

    const below = render(makeAccount({ followers_count: 50 }), viewer);
    expect(below.querySelector('svg.badge')).toBeNull();
  });

  it('everyone mode checks even a zero-follower account', () => {
    TestBed.inject(ClientPrefs).setVerifiedMode('everyone');
    const el = render(makeAccount({ followers_count: 0 }), null);
    const badge = el.querySelector('svg.badge');
    expect(badge).not.toBeNull();
    expect(badge!.querySelector('title')?.textContent).toContain('everyone deserves');
  });
});
