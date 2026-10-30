import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { SupporterStatus } from '../../providers/account/supporter-status';
import { FriendFeedScan } from '../../providers/rss/friend-feed-scan';
import { FriendFeedsWorkbench } from './friend-feeds-workbench';
import { MastodonFriendsRssFeeds } from './mastodon-friends-rss-feeds';

describe('MastodonFriendsRssFeeds', () => {
  beforeEach(() => localStorage.clear());

  async function page(data: Record<string, unknown>): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [MastodonFriendsRssFeeds],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data } } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(MastodonFriendsRssFeeds);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('signed out, says it is a Plus feature and offers sign-in and the plans', async () => {
    const root = await page({});
    expect(root.querySelector('h1')?.textContent).toContain('RSS feeds of everyone you follow');
    expect(root.textContent).toContain('part of Mawkingbird Plus');
    const links = [...root.querySelectorAll('.sign-in-choices a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual(['/login/mastodon?next=%2Fmastodon-friends-rss-feeds', '/plans']);
    expect(root.querySelector('app-friend-feeds-workbench')).toBeNull();
  });

  it('signed in, shows the scan instead of the pitch', async () => {
    const root = await page({ inShell: true });
    expect(root.querySelector('.steps')).toBeNull();
    expect(root.querySelector('.sign-in-choices')).toBeNull();
  });
});

describe('FriendFeedsWorkbench', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [FriendFeedsWorkbench],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(FriendFeedsWorkbench);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('tells a non-supporter up front, and the dialog then shows the Plus offer', () => {
    const { fixture, root } = render();
    expect(root.querySelector('.panel a[href="/plans"]')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('.panel button')!.click();
    fixture.detectChanges();
    expect(root.querySelector('app-friend-feeds-dialog .plus-gate')).not.toBeNull();
  });

  it('for a supporter, skips the note and opens the scan itself', () => {
    TestBed.inject(SupporterStatus).isSupporter.set(true);
    const { fixture, root } = render();
    expect(root.querySelector('.panel a[href="/plans"]')).toBeNull();
    root.querySelector<HTMLButtonElement>('.panel button')!.click();
    fixture.detectChanges();
    expect(root.querySelector('app-friend-feeds-dialog .plus-gate')).toBeNull();
  });

  it('summarises a finished scan and only then offers the next steps', () => {
    const { fixture, root } = render();
    expect(root.querySelector('app-focused-next-steps')).toBeNull();
    TestBed.inject(FriendFeedScan).result.set({
      feeds: [],
      opml: '',
      generatedAt: Date.now(),
      checkedCount: 12,
    } as never);
    fixture.detectChanges();
    expect(root.querySelector('.panel')?.textContent).toContain('Found 0 feeds on the 12 sites');
    expect(root.querySelector('app-focused-next-steps')).not.toBeNull();
  });
});
