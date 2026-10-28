import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterArchiveSummary } from '../../../twitter-archive';
import {
  stashTwitterArchive,
  takeTwitterArchive,
  TwitterArchiveImport,
} from './twitter-archive-import';
import { TwitterFriendDiscovery } from './twitter-friend-discovery';

const ARCHIVE: TwitterArchiveSummary = {
  files: ['following.js', 'tweets.js'],
  people: [
    {
      twitter_handle: 'alice',
      twitter_name: 'Alice Example',
      twitter_account_id: '1',
      previous_handles: [],
      currently_following: true,
      reply_count: 2,
      mention_count: 3,
      first_interaction_at: null,
      last_interaction_at: null,
      twitter_profile_url: 'https://twitter.com/alice',
    },
  ],
  currentFollowingCount: 1,
  currentFollowingWithHandleCount: 1,
  repliedPeopleCount: 1,
  replyCount: 2,
  mentionedPeopleCount: 1,
  mentionCount: 3,
};

describe('TwitterArchiveImport', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  function render(offerSignIn = false): HTMLElement {
    const fixture = TestBed.createComponent(TwitterArchiveImport);
    fixture.componentRef.setInput('offerSignIn', offerSignIn);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('signed out, offers sign-in instead of searching once the archive is read', () => {
    TestBed.inject(TwitterFriendDiscovery).load(ARCHIVE.people, ARCHIVE);
    const root = render(true);

    expect(root.querySelector('.sign-in-step')?.textContent).toContain('these 1 people');
    // Searching and following need a Mastodon token; their controls stay hidden.
    expect(root.querySelector('.twitter-filters')).toBeNull();
    expect(root.textContent).toContain('Download contacts CSV');
  });

  it('keeps the archive for the trip through sign-in and asks to come back', () => {
    TestBed.inject(TwitterFriendDiscovery).load(ARCHIVE.people, ARCHIVE);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const root = render(true);

    root.querySelector<HTMLButtonElement>('.sign-in-step button')!.click();

    expect(navigate).toHaveBeenCalledWith(['/login/mastodon'], {
      queryParams: { next: '/twitter-to-mastodon' },
    });
    expect(takeTwitterArchive()).toEqual(ARCHIVE);
  });

  it('back from sign-in, picks up the stashed archive and offers the search', async () => {
    stashTwitterArchive(ARCHIVE);
    const fixture = TestBed.createComponent(TwitterArchiveImport);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(TestBed.inject(TwitterFriendDiscovery).archive()).toEqual(ARCHIVE);
    expect(root.querySelector('.twitter-filters')).not.toBeNull();
    expect(root.querySelector('.sign-in-step')).toBeNull();
    // Consumed: a later visit in this tab does not resurrect it.
    expect(takeTwitterArchive()).toBeNull();
  });

  it('points "invite them" wherever the host page says', () => {
    const fixture = TestBed.createComponent(TwitterArchiveImport);
    fixture.componentRef.setInput('inviteLink', '/twitter-to-mastodon/invite');
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a[href]');
    expect(link?.getAttribute('href')).toBe('/twitter-to-mastodon/invite');
  });

  it('ignores a handoff that is not an archive', () => {
    sessionStorage.setItem('mockingbird_twitter_archive_handoff', '{"people":"nope"}');
    expect(takeTwitterArchive()).toBeNull();
    sessionStorage.setItem('mockingbird_twitter_archive_handoff', 'not json');
    expect(takeTwitterArchive()).toBeNull();
  });
});
