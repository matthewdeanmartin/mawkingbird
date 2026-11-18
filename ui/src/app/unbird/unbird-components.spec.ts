import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import type { UnbirdArchive } from './unbird-archive';
import { UnbirdArchiveTools } from './unbird-archive-tools';
import { UnbirdDrop } from './unbird-drop';
import { UnbirdMatcher } from './unbird-matcher';
import { UnbirdPeople } from './unbird-people';
import { UnbirdStore } from './unbird-store';

function archive(): UnbirdArchive {
  return {
    version: 1,
    readAt: 0,
    owner: { accountId: '1', userName: 'owner', displayName: 'Owner' },
    generatedAt: null,
    profile: null,
    counts: {},
    files: { total: 74, opened: ['following.js', 'tweets.js'] },
    hasContacts: false,
    followingCount: 2,
    followerCount: 1,
    people: [
      {
        twitter_handle: 'ada',
        twitter_name: 'Ada',
        twitter_account_id: '10',
        previous_handles: [],
        currently_following: true,
        reply_count: 4,
        mention_count: 1,
        first_interaction_at: null,
        last_interaction_at: null,
        twitter_profile_url: 'https://twitter.com/ada',
        mutual: true,
        closeness: 15,
      },
    ],
    tweets: [
      {
        id: '2',
        at: '2022-01-01T00:00:00.000Z',
        text: 'hello mastodon',
        likes: 3,
        retweets: 0,
        media: 0,
      },
      {
        id: '1',
        at: '2021-01-01T00:00:00.000Z',
        text: 'goodbye bird',
        likes: 0,
        retweets: 0,
        media: 0,
      },
    ],
    likes: [{ id: '9', text: 'a liked post', url: '' }],
    savedSearches: [],
  };
}

function setup(): UnbirdMatcher {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: UnbirdStore,
        useValue: {
          loadArchive: async () => null,
          loadMatches: async () => [],
          saveArchive: async () => true,
          saveMatches: async () => true,
          forget: async () => undefined,
        },
      },
    ],
  });
  return TestBed.inject(UnbirdMatcher);
}

describe('Unbird components', () => {
  it('offers the drop target with a calm privacy line, then the archive it read', async () => {
    const matcher = setup();
    const fixture = TestBed.createComponent(UnbirdDrop);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.target')?.textContent).toContain('Drop your Twitter archive');
    expect(root.querySelector('.privacy summary')?.textContent).toContain('Stays on your device');

    await matcher.use(archive(), []);
    fixture.detectChanges();
    expect(root.querySelector('.target')).toBeNull();
    expect(root.querySelector('.loaded')?.textContent).toContain('@owner');
    expect(root.querySelector('.privacy summary')?.textContent).toContain('2 of 74');
  });

  it('lists found people with why they matter, and follows only on request', async () => {
    const matcher = setup();
    await matcher.use(archive(), [
      {
        handle: 'ada',
        status: 'complete',
        checkedAt: 0,
        matches: [
          {
            acct: 'ada@hachyderm.io',
            url: 'https://hachyderm.io/@ada',
            displayName: 'Ada',
            avatar: '',
            signals: ['Mastodon username matches Twitter handle'],
            confidence: 'likely',
            lastStatusAt: null,
            bot: false,
            statuses: 10,
            followers: 5,
          },
        ],
      },
    ]);
    const search = vi.spyOn(matcher, 'search').mockResolvedValue();
    const fixture = TestBed.createComponent(UnbirdPeople);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.big')?.textContent).toContain('1 of your people is on Mastodon');
    expect(root.querySelector('.person')?.textContent).toContain('@ada@hachyderm.io');
    expect(root.querySelector('.person .chips')?.textContent).toContain('Followed you back');
    // Signed out: a link to the profile, never a Follow button.
    expect(root.querySelector('.person a')?.getAttribute('href')).toBe('https://hachyderm.io/@ada');
    expect(search).not.toHaveBeenCalled();
  });

  it('searches the archive as you type', async () => {
    const matcher = setup();
    await matcher.use(archive(), []);
    const fixture = TestBed.createComponent(UnbirdArchiveTools);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const visible = '[role="tabpanel"]:not([hidden]) .posts li';
    expect(root.querySelectorAll(visible)).toHaveLength(2);
    const input = root.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'mastodon';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const posts = root.querySelectorAll(visible);
    expect(posts).toHaveLength(1);
    expect(posts[0].textContent).toContain('hello mastodon');
  });
});
