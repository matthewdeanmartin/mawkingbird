import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../models';
import { AccountResultCard } from './account-result-card';

function makeAccount(over: Partial<Account> = {}): Account {
  return {
    id: '1',
    username: 'alan',
    acct: 'alan',
    display_name: 'Alan',
    note: '',
    url: '',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
    ...over,
  };
}

describe('AccountResultCard activity', () => {
  let fixture: ComponentFixture<AccountResultCard>;

  /** Render the card for one account and return its stats-row text. */
  function statsFor(over: Partial<Account>): string {
    fixture = TestBed.createComponent(AccountResultCard);
    fixture.componentRef.setInput('item', {
      account: makeAccount(over),
      matchingPosts: [],
    });
    fixture.componentRef.setInput('profileLink', ['/accounts', '1']);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.acct-stats')?.textContent ?? '';
  }

  /** `last_status_at` is a plain date, so build one N days back. */
  function daysAgo(n: number): string {
    return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('shows how long ago the account last posted', () => {
    expect(statsFor({ last_status_at: daysAgo(5) })).toContain('active 5 days ago');
  });

  it('reads today for a post made today', () => {
    expect(statsFor({ last_status_at: daysAgo(0) })).toContain('active today');
  });

  it('coarsens to months and years as the silence grows', () => {
    expect(statsFor({ last_status_at: daysAgo(60) })).toContain('active 2 mo ago');
    expect(statsFor({ last_status_at: daysAgo(800) })).toContain('active 2y ago');
  });

  it('marks a long silence as stale, but a recent post not', () => {
    statsFor({ last_status_at: daysAgo(400) });
    expect(fixture.nativeElement.querySelector('.acct-activity.stale')).toBeTruthy();
    statsFor({ last_status_at: daysAgo(3) });
    expect(fixture.nativeElement.querySelector('.acct-activity.stale')).toBeNull();
  });

  it('distinguishes "never posted" from "activity unknown"', () => {
    // null is an answer from the server; undefined means nobody has told us.
    expect(statsFor({ last_status_at: null })).toContain('never posted');
    expect(statsFor({})).toContain('activity unknown');
  });
});

/**
 * Only the avatar and the display name opened the profile. The bio underneath —
 * several lines that look exactly like a tappable card body — was an inert div,
 * so on a phone the whole card appeared dead apart from a ~40px face, and
 * readers concluded the profile was unavailable.
 */
describe('AccountResultCard navigation', () => {
  let fixture: ComponentFixture<AccountResultCard>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(AccountResultCard);
    fixture.componentRef.setInput('item', {
      account: makeAccount({ note: '<p>Economist. Writes about trade.</p>' }),
      matchingPosts: [],
    });
    fixture.componentRef.setInput('profileLink', ['/accounts', '1']);
    fixture.componentRef.setInput('showModerationMenu', true);
    fixture.detectChanges();
  });

  function clickOn(selector: string): void {
    const el = (fixture.nativeElement as HTMLElement).querySelector(selector);
    expect(el, `no element matched ${selector}`).not.toBeNull();
    el!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  }

  it('opens the profile from the bio', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    clickOn('.acct-bio');

    expect(navigate).toHaveBeenCalledWith(['/accounts', '1']);
  });

  it('opens the profile from the card whitespace', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    clickOn('.acct-card');

    expect(navigate).toHaveBeenCalledWith(['/accounts', '1']);
  });

  it('leaves the follow button and the moderation menu to themselves', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    clickOn('.follow-btn');
    clickOn('.acct-danger-menu summary');

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate on a modified click', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const bio = (fixture.nativeElement as HTMLElement).querySelector('.acct-bio')!;

    bio.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true }),
    );

    expect(navigate).not.toHaveBeenCalled();
  });
});
