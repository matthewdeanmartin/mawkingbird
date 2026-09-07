import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, ImportReport } from '../../../models';
import { Auth } from '../../../auth';
import { parseHandles } from '../../../import-follows';
import { followingAccountsCsv, SettingsImportExport } from './settings-import-export';
import { GitHubFriendDiscovery } from './github-friend-discovery';
import { TwitterArchiveSummary } from '../../../twitter-archive';
import { TwitterFriendDiscovery } from './twitter-friend-discovery';
import { TagSources } from './tag-sources';
import { seedGitHubConnection } from '../../../testing/seed-storage';

/** Exposes SettingsImportExport's protected signals for white-box testing. */
interface SettingsImportExportInternals {
  importKind: WritableSignal<'following' | 'mutes' | 'blocks'>;
  csvText: WritableSignal<string>;
  report: WritableSignal<ImportReport | null>;
  exportCount: WritableSignal<number>;
  pastedTags: WritableSignal<string>;
  tagExportError: WritableSignal<string | null>;
  tagExportCount: WritableSignal<number>;
  previewTags(): void;
  useSuggestedTags(): void;
  suggestTagsFromFavourites(): Promise<void>;
  exportTags(): Promise<void>;
  hideGithubFollowed: WritableSignal<boolean>;
  twitterArchive: WritableSignal<TwitterArchiveSummary | null>;
  download(kind: 'following' | 'mutes' | 'blocks'): void;
  upload(): void;
  exportFriends(): Promise<void>;
}

function internals(fixture: ComponentFixture<SettingsImportExport>): SettingsImportExportInternals {
  return fixture.componentInstance as unknown as SettingsImportExportInternals;
}

describe('SettingsImportExport', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
    // jsdom does not implement object URLs; stub them for download().
    URL.createObjectURL = () => 'blob:mock';
    URL.revokeObjectURL = () => undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.mocked(HTMLAnchorElement.prototype.click).mockClear();
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setUp(): ComponentFixture<SettingsImportExport> {
    const fixture = TestBed.createComponent(SettingsImportExport);
    fixture.detectChanges();
    return fixture;
  }

  it('download() GETs the export endpoint for the requested kind', () => {
    const fixture = setUp();
    internals(fixture).download('mutes');

    const req = httpMock.expectOne('/api/v1/_mock/export/mutes');
    expect(req.request.method).toBe('GET');
    req.flush('Account address\nbob@example.com\n');
  });

  it('upload() POSTs the CSV with the selected type and stores the report', () => {
    const fixture = setUp();
    internals(fixture).importKind.set('blocks');
    internals(fixture).csvText.set('spammer@example.com\n');

    internals(fixture).upload();

    const req = httpMock.expectOne('/api/v1/_mock/import');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ type: 'blocks', csv: 'spammer@example.com\n' });
    req.flush({ type: 'blocks', imported: 1, skipped: ['nobody@example.com'] });

    expect(internals(fixture).report()).toEqual({
      type: 'blocks',
      imported: 1,
      skipped: ['nobody@example.com'],
    });
  });

  it('upload() with empty CSV issues no request', () => {
    const fixture = setUp();
    internals(fixture).csvText.set('   ');

    internals(fixture).upload();

    httpMock.expectNone('/api/v1/_mock/import');
  });

  it('writes the same following_accounts.csv shape accepted by the importer', () => {
    const csv = followingAccountsCsv([
      { id: '1', acct: 'alice@remote.social', username: 'alice', url: '' } as Account,
      {
        id: '2',
        acct: 'bob',
        username: 'bob',
        url: 'https://home.social/@bob',
      } as Account,
    ]);

    expect(csv).toContain('Account address,Show boosts,Notify on new posts,Languages');
    expect(csv).toContain('alice@remote.social,true,false,');
    expect(csv).toContain('bob@home.social,true,false,');
    expect(parseHandles(csv)).toEqual(['alice@remote.social', 'bob@home.social']);
  });

  it('renders GitHub matches as local profiles and follows them in place', async () => {
    seedGitHubConnection('ghp_test', {
      login: 'viewer',
      avatar_url: '',
      html_url: 'https://github.com/viewer',
      name: 'Viewer',
    });
    const fixture = setUp();
    const discovery = TestBed.inject(GitHubFriendDiscovery);
    const account = {
      id: 'alice-id',
      username: 'alice',
      acct: 'alice@social.example',
      display_name: 'Alice',
      avatar: '',
      avatar_static: '',
      note: '<p>Building friendly federated software.</p>',
      statuses_count: 123,
      following_count: 45,
      followers_count: 678,
    } as Account;
    discovery.rows.set([
      {
        profile: {
          login: 'alice',
          name: 'Alice',
          avatarUrl: '',
          url: 'https://github.com/alice',
          bio: null,
          websiteUrl: null,
          socialAccounts: { nodes: [] },
        },
        source: 'starred-owner',
        starredRepositories: [
          {
            nameWithOwner: 'alice/useful-project',
            url: 'https://github.com/alice/useful-project',
            description: 'A useful project',
          },
        ],
        status: 'complete',
        identity: null,
        matches: [
          {
            account,
            handle: 'alice@social.example',
            signals: ['Mastodon username matches GitHub login'],
            confidence: 'candidate',
          },
        ],
      },
    ]);
    discovery.relationships.set(
      new Map([
        [
          account.id,
          {
            id: account.id,
            following: false,
            followed_by: false,
            requested: false,
            blocking: false,
            muting: false,
          },
        ],
      ]),
    );
    fixture.detectChanges();

    const match = (fixture.nativeElement as HTMLElement).querySelector('.contact-match')!;
    expect(match.querySelector('a')?.getAttribute('href')).toBe('/accounts/alice-id');
    expect(match.textContent).not.toContain('Add');
    expect(fixture.nativeElement.textContent).toContain('alice/useful-project');
    expect(match.textContent).toContain('Building friendly federated software.');
    expect(match.textContent).toContain('123 posts');
    expect(match.textContent).toContain('45 following');
    expect(match.textContent).toContain('678 followers');
    match.querySelector<HTMLButtonElement>('button')!.click();
    httpMock.expectOne('/api/v1/accounts/alice-id/follow').flush({
      id: account.id,
      following: true,
      followed_by: false,
      requested: false,
      blocking: false,
      muting: false,
    });
    await Promise.resolve();
    fixture.detectChanges();

    expect(match.querySelector('button')?.textContent).toContain('Following');
  });

  it('shows separate GitHub friends and stars actions before any import is prepared', () => {
    seedGitHubConnection('ghp_test', {
      login: 'viewer',
      avatar_url: '',
      html_url: 'https://github.com/viewer',
      name: 'Viewer',
    });

    const fixture = setUp();
    const githubSection = (fixture.nativeElement as HTMLElement).querySelector('#github-friends')!;
    const labels = [...githubSection.querySelectorAll('button')].map((button) =>
      button.textContent?.trim(),
    );

    expect(labels).toContain('Get matches via GitHub friends');
    expect(labels).toContain('Get matches via GitHub stars');
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('#import-friends')
        ?.textContent?.includes('GitHub stars'),
    ).toBe(false);
  });

  it('shows Twitter source evidence, candidates, and an in-place follow action', async () => {
    const fixture = setUp();
    const discovery = TestBed.inject(TwitterFriendDiscovery);
    const person = {
      twitter_handle: 'alice',
      twitter_name: 'Alice Example',
      twitter_account_id: 'twitter-alice',
      previous_handles: [],
      currently_following: true,
      reply_count: 12,
      mention_count: 20,
      first_interaction_at: '2020-01-01T00:00:00.000Z',
      last_interaction_at: '2026-01-01T00:00:00.000Z',
      twitter_profile_url: 'https://twitter.com/alice',
    };
    const account = {
      id: 'mastodon-alice',
      username: 'alice',
      acct: 'alice@social.example',
      display_name: 'Alice on Mastodon',
      avatar: '',
      avatar_static: '',
      header: '',
      note: '',
      url: 'https://social.example/@alice',
      followers_count: 0,
      following_count: 0,
      statuses_count: 0,
      bot: false,
      locked: false,
      fields: [],
    } as Account;
    internals(fixture).twitterArchive.set({
      files: ['following.js', 'tweets.js'],
      people: [person],
      currentFollowingCount: 1,
      currentFollowingWithHandleCount: 1,
      repliedPeopleCount: 1,
      replyCount: 12,
      mentionedPeopleCount: 1,
      mentionCount: 20,
    });
    discovery.rows.set([
      {
        person,
        status: 'complete',
        matches: [
          {
            account,
            confidence: 'likely',
            signals: ['Mastodon username matches Twitter handle'],
          },
        ],
      },
    ]);
    discovery.relationships.set(
      new Map([
        [
          account.id,
          {
            id: account.id,
            following: false,
            followed_by: false,
            requested: false,
            blocking: false,
            muting: false,
          },
        ],
      ]),
    );
    fixture.detectChanges();

    const twitterSection = (fixture.nativeElement as HTMLElement).querySelector(
      '#twitter-archive',
    )!;
    const match = twitterSection.querySelector('.contact-match')!;
    expect(twitterSection.textContent).toContain('Alice Example');
    expect(twitterSection.textContent).toContain('12 replies');
    expect(twitterSection.textContent).toContain('20 mentions');
    expect(match.textContent).toContain('@alice@social.example');
    expect(match.textContent).toContain('likely');
    expect(twitterSection.querySelectorAll('.twitter-filters input')).toHaveLength(4);

    match.querySelector<HTMLButtonElement>('button')!.click();
    httpMock.expectOne('/api/v1/accounts/mastodon-alice/follow').flush({
      id: account.id,
      following: true,
      followed_by: false,
      requested: false,
      blocking: false,
      muting: false,
    });
    await Promise.resolve();
    fixture.detectChanges();

    expect(match.querySelector('button')?.textContent).toContain('Following');

    twitterSection.querySelector<HTMLInputElement>('.twitter-filters input')!.click();
    fixture.detectChanges();

    expect(twitterSection.querySelector('.contact-match')).toBeNull();
    expect(twitterSection.textContent).toContain('0 of 1 Mastodon candidates shown');
  });

  it('hides already-followed GitHub matches without changing their discovery order', () => {
    seedGitHubConnection('ghp_test', {
      login: 'viewer',
      avatar_url: '',
      html_url: 'https://github.com/viewer',
      name: 'Viewer',
    });
    const fixture = setUp();
    const discovery = TestBed.inject(GitHubFriendDiscovery);
    const account = (id: string) =>
      ({
        id,
        username: id,
        acct: `${id}@social.example`,
        display_name: id,
        avatar: '',
        avatar_static: '',
      }) as Account;
    discovery.rows.set(
      ['first', 'second'].map((id) => ({
        profile: {
          login: id,
          name: id,
          avatarUrl: '',
          url: `https://github.com/${id}`,
          bio: null,
          websiteUrl: null,
          socialAccounts: { nodes: [] },
        },
        status: 'complete' as const,
        identity: null,
        matches: [
          {
            account: account(id),
            handle: `${id}@social.example`,
            signals: ['Mastodon username matches GitHub login'],
            confidence: 'candidate' as const,
          },
        ],
      })),
    );
    discovery.relationships.set(
      new Map([
        [
          'first',
          {
            id: 'first',
            following: true,
            followed_by: false,
            requested: false,
            blocking: false,
            muting: false,
          },
        ],
        [
          'second',
          {
            id: 'second',
            following: false,
            followed_by: false,
            requested: false,
            blocking: false,
            muting: false,
          },
        ],
      ]),
    );
    internals(fixture).hideGithubFollowed.set(true);
    fixture.detectChanges();

    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.contact-row')].map(
      (row) => row.textContent,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('second');
  });

  it('pages through every friend before downloading the export', async () => {
    const auth = TestBed.inject(Auth);
    auth.setToken('token');
    auth.setAccount({ id: 'me', acct: 'me@home.social' } as Account);
    const fixture = setUp();
    const firstPage = Array.from(
      { length: 80 },
      (_, index) =>
        ({
          id: String(index + 1),
          acct: `friend${index + 1}@remote.social`,
          username: `friend${index + 1}`,
          url: '',
        }) as Account,
    );

    const exported = internals(fixture).exportFriends();
    httpMock.expectOne('/api/v1/accounts/me/following?limit=80').flush(firstPage);
    await Promise.resolve();
    httpMock
      .expectOne('/api/v1/accounts/me/following?limit=80&max_id=80')
      .flush([{ id: '81', acct: 'last@remote.social', username: 'last', url: '' } as Account]);
    await exported;

    expect(internals(fixture).exportCount()).toBe(81);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });

  it('previewTags() loads the parsed hashtags without following any of them', () => {
    const fixture = setUp();
    internals(fixture).pastedTags.set('#photography\nbaking, #Rust\nnot-a-tag');

    internals(fixture).previewTags();

    expect(fixture.componentInstance['tagImporter'].rows().map((r) => r.tag)).toEqual([
      'photography',
      'baking',
      'rust',
    ]);
    // Preview is a parse, not a run: nothing has been followed yet.
    expect(fixture.componentInstance['tagImporter'].running()).toBe(false);
  });

  it('exportTags() downloads the followed hashtags', async () => {
    const fixture = setUp();
    const exported = internals(fixture).exportTags();
    httpMock
      .expectOne('/api/v1/followed_tags?limit=100')
      .flush([{ name: 'photography' }, { name: 'baking' }]);
    await exported;

    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(internals(fixture).tagExportError()).toBeNull();
  });

  it('exportTags() follows the Link cursor so a long list is not truncated', async () => {
    const fixture = setUp();
    const exported = internals(fixture).exportTags();

    httpMock
      .expectOne('/api/v1/followed_tags?limit=100')
      .flush([{ name: 'photography' }, { name: 'baking' }], {
        headers: { Link: '<https://x/api/v1/followed_tags?max_id=42>; rel="next"' },
      });
    await Promise.resolve();
    httpMock.expectOne('/api/v1/followed_tags?limit=100&max_id=42').flush([{ name: 'caturday' }]);
    await exported;

    // Three tags across two pages: one page used to be the whole export.
    expect(internals(fixture).tagExportCount()).toBe(3);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(internals(fixture).tagExportError()).toBeNull();
  });

  it('useSuggestedTags() moves the ticked suggestions into the importer', async () => {
    const fixture = setUp();
    const sources = TestBed.inject(TagSources);
    const suggested = internals(fixture).suggestTagsFromFavourites();
    httpMock
      .expectOne('/api/v1/favourites?limit=40')
      .flush([
        { tags: [{ name: 'cats', url: '' }] },
        { tags: [{ name: 'cats', url: '' }] },
        { tags: [{ name: 'baking', url: '' }] },
        { tags: [{ name: 'baking', url: '' }] },
      ]);
    await suggested;

    sources.toggle('baking');
    internals(fixture).useSuggestedTags();

    // Suggesting never follows on its own: the picks land in the box above,
    // still needing a deliberate Follow.
    expect(fixture.componentInstance['tagImporter'].rows().map((r) => r.tag)).toEqual(['cats']);
    expect(fixture.componentInstance['tagImporter'].running()).toBe(false);
  });

  it('exportTags() says so rather than downloading an empty file', async () => {
    const fixture = setUp();
    const exported = internals(fixture).exportTags();
    httpMock.expectOne('/api/v1/followed_tags?limit=100').flush([]);
    await exported;

    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(internals(fixture).tagExportError()).toContain('don');
  });
});

/**
 * Signed out.
 *
 * The whole page used to sit behind `anonymousUnavailableGuard`, so someone who
 * chose "continue without logging in" could not reach any of it — including the
 * two tools that build a timeline from nothing, which is what that person needs
 * most. Found in testing: the contacts feature shipped and was invisible.
 */
describe('SettingsImportExport, signed out', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
  });

  afterEach(() => {
    localStorage.clear();
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(SettingsImportExport);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('still offers the contacts finder and the follow-list importer', () => {
    const root = render();

    // Account search works anonymously and anonymous follows live in this
    // browser, so both of these work without credentials.
    expect(root.querySelector('#contacts')).not.toBeNull();
    expect(root.querySelector('#import-friends')).not.toBeNull();
  });

  it('still offers the hashtag importer, which writes browser-local follows', () => {
    // AnonymousTags backs this signed out, so it works with no credentials —
    // and following a few topics is the emptiest timeline's fastest fix.
    expect(render().querySelector('#import-tags')).not.toBeNull();
  });

  it('hides the sections whose Follow buttons need a server account', () => {
    const root = render();

    // These call `api.follow` unconditionally. Rendering them signed out would
    // offer buttons that cannot work.
    expect(root.querySelector('#twitter-archive')).toBeNull();
    expect(root.querySelector('#github-friends')).toBeNull();
    expect(root.querySelector('#bridge-finder')).toBeNull();
  });

  it('says plainly where a signed-out follow is saved', () => {
    // The caveat that makes offering these correct, rather than a silent
    // difference the reader discovers on their next device.
    expect(render().textContent).toContain('in this browser');
  });
});
