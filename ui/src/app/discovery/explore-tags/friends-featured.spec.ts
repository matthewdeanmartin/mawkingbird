import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../platform/api/api';
import { Account, FeaturedTag } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { FRIENDS_PER_STEP, FriendsFeatured, groupByTag, rankMutuals } from './friends-featured';

/** Explore → Tags → More → Featured (spec/sprint/explore-2026-11.md). */

function person(id: string, lastPost = '2026-11-20', name = `Friend ${id}`): Account {
  return {
    id,
    username: id,
    acct: `${id}@example.social`,
    display_name: name,
    last_status_at: lastPost,
    fields: [],
  } as unknown as Account;
}

function featured(...names: string[]): FeaturedTag[] {
  return names.map(
    (name, i) =>
      ({
        id: `${name}${i}`,
        name,
        url: '',
        statuses_count: 7,
        last_status_at: null,
      }) as FeaturedTag,
  );
}

describe('rankMutuals', () => {
  it('keeps people who follow back, the most recently active first', () => {
    const a = person('a', '2026-11-01');
    const b = person('b', '2026-11-25');
    const c = person('c', '2026-11-20');
    expect(rankMutuals([a, b, c], [c, a, person('stranger')]).map((x) => x.id)).toEqual(['c', 'a']);
  });
});

describe('groupByTag', () => {
  it('ranks hashtags by how many friends feature them, a friend counting once', () => {
    const rows = groupByTag(
      new Map([
        ['a', { account: person('a'), tags: ['Rust', 'rust', 'cats'] }],
        ['b', { account: person('b'), tags: ['rust'] }],
        ['c', { account: person('c'), tags: ['birds'] }],
      ]),
    );
    expect(rows.map((r) => [r.name, r.friends.map((f) => f.id)])).toEqual([
      ['Rust', ['a', 'b']],
      ['birds', ['c']],
      ['cats', ['a']],
    ]);
  });
});

describe('FriendsFeatured', () => {
  let fixture: ComponentFixture<FriendsFeatured>;
  let api: Api;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    api = TestBed.inject(Api);
  });

  function signIn(): void {
    const auth = TestBed.inject(Auth);
    auth.setToken('token');
    auth.account.set(person('me'));
  }

  function render(): HTMLElement {
    fixture = TestBed.createComponent(FriendsFeatured);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('shows your own featured hashtags, then your friends’ grouped by hashtag', () => {
    signIn();
    vi.spyOn(api, 'featuredTags').mockReturnValue(of(featured('gardening')));
    const ana = person('ana', '2026-11-25', 'Ana');
    const bo = person('bo', '2026-11-24', 'Bo');
    vi.spyOn(api, 'accountFollowing').mockReturnValue(of([ana, bo]));
    vi.spyOn(api, 'accountFollowers').mockReturnValue(of([ana, bo]));
    vi.spyOn(api, 'accountFeaturedTags').mockImplementation((id) =>
      of(id === 'ana' ? featured('rust', 'cats') : featured('rust')),
    );
    const host = render();
    const titles = [...host.querySelectorAll('a[mbItemTitle]')].map((a) => a.textContent?.trim());
    expect(titles).toEqual(['#gardening', '#rust', '#cats']);
    expect(text()).toContain('featured by Ana, Bo');
    expect(text()).toContain('Checked 2 of 2 friends.');
  });

  it('checks friends twenty at a time, with a button for more', () => {
    signIn();
    vi.spyOn(api, 'featuredTags').mockReturnValue(of([]));
    const friends = Array.from({ length: FRIENDS_PER_STEP + 5 }, (_, i) => person(`f${i}`));
    vi.spyOn(api, 'accountFollowing').mockReturnValue(of(friends));
    vi.spyOn(api, 'accountFollowers').mockReturnValue(of(friends));
    const reads = vi.spyOn(api, 'accountFeaturedTags').mockReturnValue(of(featured('rust')));
    const host = render();
    expect(reads).toHaveBeenCalledTimes(FRIENDS_PER_STEP);
    const more = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Check 5 more friends (5 API calls)'),
    )!;
    more.click();
    expect(reads).toHaveBeenCalledTimes(FRIENDS_PER_STEP + 5);
    expect(text()).toContain('featured by');
    expect(text()).not.toContain('Check 0 more');
  });

  it('skips a friend whose featured hashtags fail to load', () => {
    signIn();
    vi.spyOn(api, 'featuredTags').mockReturnValue(of([]));
    vi.spyOn(api, 'accountFollowing').mockReturnValue(of([person('a'), person('b')]));
    vi.spyOn(api, 'accountFollowers').mockReturnValue(of([person('a'), person('b')]));
    vi.spyOn(api, 'accountFeaturedTags').mockImplementation((id) =>
      id === 'a' ? throwError(() => new Error('500')) : of(featured('birds')),
    );
    render();
    expect(text()).toContain('#birds');
    expect(text()).toContain('Checked 2 of 2 friends.');
  });

  it('does not ask again on a second visit in the same session', () => {
    signIn();
    vi.spyOn(api, 'featuredTags').mockReturnValue(of([]));
    vi.spyOn(api, 'accountFollowing').mockReturnValue(of([person('a')]));
    const followers = vi.spyOn(api, 'accountFollowers').mockReturnValue(of([person('a')]));
    vi.spyOn(api, 'accountFeaturedTags').mockReturnValue(of(featured('birds')));
    render();
    fixture.destroy();
    render();
    expect(followers).toHaveBeenCalledTimes(1);
    expect(text()).toContain('#birds');
  });

  it('hands a follow to the page that owns follow state', () => {
    signIn();
    vi.spyOn(api, 'featuredTags').mockReturnValue(of([]));
    vi.spyOn(api, 'accountFollowing').mockReturnValue(of([person('a')]));
    vi.spyOn(api, 'accountFollowers').mockReturnValue(of([person('a')]));
    vi.spyOn(api, 'accountFeaturedTags').mockReturnValue(of(featured('birds')));
    const host = render();
    let followed = '';
    fixture.componentInstance.follow.subscribe((name) => (followed = name));
    (host.querySelector('li button') as HTMLButtonElement).click();
    expect(followed).toBe('birds');
  });

  it('asks Anonymous to sign in, and asks no server', () => {
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    const mine = vi.spyOn(api, 'featuredTags');
    render();
    expect(text()).toContain('Sign in to see yours and your friends');
    expect(mine).not.toHaveBeenCalled();
  });
});
