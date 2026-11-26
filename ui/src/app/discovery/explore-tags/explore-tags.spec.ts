import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnonymousTags } from '../../accounts/anonymous/anonymous-tags';
import { Lists } from '../../feeds/lists/lists';
import { Api } from '../../platform/api/api';
import { Status, Tag } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { HashtagSamples } from '../similar-hashtags/similar-hashtags';
import { ExploreTags, PER_GROUP, dedupeGroups, peopleThisWeek, resetTagsTab } from './explore-tags';

function tag(name: string, accounts: number[] = []): Tag {
  return {
    id: name,
    name,
    url: '',
    following: false,
    featuring: false,
    history: accounts.map((n, i) => ({ day: String(i), uses: String(n), accounts: String(n) })),
  } as unknown as Tag;
}

function tagged(id: string, ...names: string[]): Status {
  return { id, uri: id, tags: names.map((name) => ({ name, url: '' })) } as unknown as Status;
}

describe('peopleThisWeek', () => {
  it('adds up accounts across the history, or says nothing without one', () => {
    expect(peopleThisWeek(tag('a', [3, 4, 5]))).toBe(12);
    expect(peopleThisWeek(tag('a'))).toBeNull();
  });
});

describe('dedupeGroups', () => {
  it('shows a tag once, in its first group, and never one already followed', () => {
    const out = dedupeGroups(
      {
        yours: [{ name: 'Cats', people: null }],
        similar: [
          { name: 'cats', people: null },
          { name: 'Dogs', people: null },
        ],
        trending: [
          { name: 'dogs', people: 9 },
          { name: 'birds', people: 2 },
        ],
      },
      new Set(['birds']),
    );
    expect(out.yours.map((t) => t.name)).toEqual(['Cats']);
    expect(out.similar.map((t) => t.name)).toEqual(['Dogs']);
    expect(out.trending).toEqual([]);
  });

  it('caps each group', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `t${i}`, people: null }));
    expect(
      dedupeGroups({ yours: [], similar: [], trending: many }, new Set()).trending,
    ).toHaveLength(PER_GROUP);
  });
});

describe('ExploreTags', () => {
  let fixture: ComponentFixture<ExploreTags>;
  let api: Api;

  beforeEach(() => {
    localStorage.clear();
    resetTagsTab();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    // The embedded Feeds sections read this; tags only, as on the real route.
    TestBed.inject(ActivatedRoute).snapshot.data = { only: 'tags' };
    api = TestBed.inject(Api);
  });

  function render(): HTMLElement {
    fixture = TestBed.createComponent(ExploreTags);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  /** Open one of Yours | Similar | Featured | More. */
  function open(label: string): void {
    const tab = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ].find((button) => button.textContent?.trim() === label)!;
    tab.click();
    fixture.detectChanges();
  }

  function names(): (string | undefined)[] {
    fixture.detectChanges();
    return [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('.et-suggested a[mbItemTitle]'),
    ].map((a) => a.textContent?.trim());
  }

  function followButton(name: string): HTMLButtonElement | undefined {
    fixture.detectChanges();
    return [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('li button'),
    ].find((b) => b.getAttribute('aria-label') === `Follow #${name}`);
  }

  describe('signed in to Mastodon', () => {
    beforeEach(() => {
      TestBed.inject(Auth).setToken('token');
      vi.spyOn(api, 'followedTags').mockReturnValue(of([tag('gardening')]));
      vi.spyOn(TestBed.inject(HashtagSamples), 'page').mockReturnValue(
        of([tagged('1', 'gardening', 'compost'), tagged('2', 'compost', 'seeds')]),
      );
    });

    it('splits suggestions over Yours | Similar | Trending | More, without repeats', () => {
      vi.spyOn(api, 'featuredTagSuggestions').mockReturnValue(
        of([tag('knitting'), tag('gardening')]),
      );
      vi.spyOn(api, 'trendingTags').mockReturnValue(
        of([tag('compost', [2, 3]), tag('news', [40])]),
      );
      const host = render();
      expect([...host.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim())).toEqual([
        'Yours',
        'Similar',
        'Trending',
        'More',
      ]);
      // Yours: your followed hashtags (the Feeds sections), then the ones you post with.
      expect(host.querySelector('app-lists')).not.toBeNull();
      expect(text()).toContain('You post with these');
      expect(names()).toEqual(['#knitting']);
      open('Similar');
      expect(text()).toContain('Tags similar to what you follow now');
      expect(names()).toEqual(['#compost', '#seeds']);
      open('Trending');
      // #compost is already in Similar, so it shows once, there.
      expect(names()).toEqual(['#news']);
      expect(text()).toContain('40 people this week');
      open('More');
      // More has its own strip: Tag bundles | Featured | Tag relay.
      const moreTabs = [...host.querySelectorAll('mb-tabs mb-tabs [role="tab"]')].map((t) =>
        t.textContent?.trim(),
      );
      expect(moreTabs).toEqual(['Tag bundles', 'Featured', 'Tag relay']);
      expect(host.querySelector('app-lists')).not.toBeNull();
      open('Featured');
      expect(host.querySelector('app-friends-featured')).not.toBeNull();
    });

    it('keeps the other groups when one source fails', () => {
      vi.spyOn(api, 'featuredTagSuggestions').mockReturnValue(throwError(() => new Error('500')));
      vi.spyOn(api, 'trendingTags').mockReturnValue(of([tag('news')]));
      render();
      expect(text()).toContain('Couldn’t load these.');
      open('Trending');
      expect(names()).toEqual(['#news']);
      open('Similar');
      expect(names()).toContain('#compost');
    });

    it('follows on the server, turns the row to Following and refreshes Your hashtags', () => {
      vi.spyOn(api, 'featuredTagSuggestions').mockReturnValue(of([tag('knitting')]));
      vi.spyOn(api, 'trendingTags').mockReturnValue(of([]));
      const followTag = vi.spyOn(api, 'followTag').mockReturnValue(of(tag('knitting')));
      const refresh = vi.spyOn(Lists.prototype, 'refreshTags');
      render();
      followButton('knitting')!.click();
      expect(followTag).toHaveBeenCalledWith('knitting');
      expect(refresh).toHaveBeenCalled();
      fixture.detectChanges();
      const row = [...(fixture.nativeElement as HTMLElement).querySelectorAll('li')].find((li) =>
        li.textContent?.includes('#knitting'),
      );
      expect(row?.querySelector('button')?.textContent?.trim()).toBe('Following');
    });

    it('says so when a follow fails', () => {
      vi.spyOn(api, 'featuredTagSuggestions').mockReturnValue(of([]));
      vi.spyOn(api, 'trendingTags').mockReturnValue(of([tag('news')]));
      vi.spyOn(api, 'followTag').mockReturnValue(throwError(() => new Error('403')));
      render();
      open('Trending');
      followButton('news')!.click();
      expect(text()).toContain('Couldn’t follow #news.');
    });

    it('comes back on the tab last open, as after Back from a tag page', () => {
      vi.spyOn(api, 'featuredTagSuggestions').mockReturnValue(of([]));
      vi.spyOn(api, 'trendingTags').mockReturnValue(of([tag('news')]));
      render();
      open('Trending');
      fixture.destroy();
      const host = render();
      expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe(
        'Trending',
      );
    });
  });

  it('follows in the browser for Anonymous, with no account-only request', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const suggestions = vi.spyOn(api, 'featuredTagSuggestions');
    vi.spyOn(api, 'trendingTags').mockReturnValue(of([tag('news')]));
    const followTag = vi.spyOn(api, 'followTag');
    render();
    open('Trending');
    followButton('news')!.click();
    expect(TestBed.inject(AnonymousTags).has('news')).toBe(true);
    expect(followTag).not.toHaveBeenCalled();
    expect(suggestions).not.toHaveBeenCalled();
  });

  it('tells a Bluesky reader plainly, and asks nothing of a server', () => {
    TestBed.inject(Auth).kind.set('bluesky');
    const trending = vi.spyOn(api, 'trendingTags');
    render();
    expect(text()).toContain('Bluesky has no followed hashtags');
    expect(trending).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-lists')).toBeNull();
  });
});
