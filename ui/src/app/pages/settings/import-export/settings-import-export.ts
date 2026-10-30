import { accountProfilePath } from '../../../account-route';
import { Component, computed, inject, Injectable, signal } from '@angular/core';
import { MbButton } from '../../../design-system/button/button';
import { MbCheckbox } from '../../../design-system/checkbox/checkbox';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../api';
import { MockApi } from '../../../mock-api';
import { Auth } from '../../../auth';
import { ImportFollows, parseHandles } from '../../../import-follows';
import { followedTagsCsv, ImportTags, parseTags } from '../../../import-tags';
import { AnonymousTags } from '../../../providers/anonymous/anonymous-tags';
import { Account, ImportReport } from '../../../models';
import { environment } from '../../../../environments/environment';
import { GitHubSession } from '../../../providers/github/github-session';
import { extractArchiveHashtags } from '../../../twitter-archive';
import { SAMPLE_SIZE, TagSources } from './tag-sources';
import { BridgeFriendsImport } from './bridge-friends-import';
import { ContactFriendsImport } from './contact-friends-import';
import { saveCsv } from './save-csv';
import { GitHubFriendsImport } from './github-friends-import';
import { TwitterArchiveImport } from './twitter-archive-import';
import { BlueskySession } from '../../../providers/bluesky/bluesky-session';
import { PageDiagnostics } from '../../../page-diagnostics';

type CsvKind = 'following' | 'mutes' | 'blocks';

/** Render accounts in the Mastodon following_accounts.csv format accepted by ImportFollows. */
export function followingAccountsCsv(accounts: readonly Account[]): string {
  const rows = accounts.map((account) => `${exportHandle(account)},true,false,`);
  return ['Account address,Show boosts,Notify on new posts,Languages', ...rows, ''].join('\n');
}

function exportHandle(account: Account): string {
  const acct = account.acct.replace(/^@/, '');
  if (acct.includes('@')) return acct;
  try {
    return `${acct}@${new URL(account.url).host}`;
  } catch {
    return acct;
  }
}

/** Client-side friend import/export, plus mock-server graph tools in mock builds. */
// i18n settings.importExport.account.approvalBadge: 🔒 approval required
// i18n settings.importExport.account.approvalTitle: Requires follow approval
// i18n settings.importExport.account.bot: BOT
// i18n settings.importExport.account.followers: followers
// i18n settings.importExport.account.following: following
// i18n settings.importExport.account.lastActive: last active
// i18n settings.importExport.account.neverPosted: never posted
// i18n settings.importExport.account.posts: posts
// i18n settings.importExport.alreadyFollowing: Already following
// i18n settings.importExport.anon.a: You're not signed in, so anyone you follow here is saved
// i18n settings.importExport.anon.b: . They won't appear on another device, and they'll be lost if you clear your browser data.
// i18n settings.importExport.anon.c: if you want your follows kept on a server account.
// i18n settings.importExport.anon.here: in this browser
// i18n settings.importExport.anon.signIn: Sign in
// i18n settings.importExport.apiCalls: API calls
// i18n settings.importExport.checking: Checking…
// i18n settings.importExport.clear: clear
// i18n settings.importExport.continueSearching: Continue searching
// i18n settings.importExport.findMastodonAccounts: Find Mastodon accounts
// i18n settings.importExport.follow: Follow
// i18n settings.importExport.followAllOpen: Follow all (
// i18n settings.importExport.following: Following
// i18n settings.importExport.followingBusy: Following…
// i18n settings.importExport.friends.exportAll: Export all friends
// i18n settings.importExport.friends.exportBody.a: Fetch every account you follow and download a Mastodon-compatible
// i18n settings.importExport.friends.exportBody.b: that can be imported above or by another Mastodon server.
// i18n settings.importExport.friends.exportTitle: Export Friends
// i18n settings.importExport.friends.exporting: Exporting {{count}}…
// i18n settings.importExport.friends.importTitle: Import Friends
// i18n settings.importExport.friends.paste.a: Paste
// i18n settings.importExport.friends.paste.b: handles or profile URLs, one per line, or upload a Mastodon
// i18n settings.importExport.friends.paste.c: . Each account is looked up and followed one at a time.
// i18n settings.importExport.friends.uploadCsv: Upload CSV…
// i18n settings.importExport.hideAlreadyFollowed: Hide already followed
// i18n settings.importExport.intro: Move your friends and followed hashtags between accounts with portable CSV files, and find the people you already follow on your other network.
// i18n settings.importExport.invite.body: Prewritten posts for Twitter and Bluesky that ask your friends to come over — or just to visit with no account at all.
// i18n settings.importExport.invite.title: Can’t find someone? Invite them.
// i18n settings.importExport.legend.currentlyFollowed: currently followed
// i18n settings.importExport.legend.replies: replies
// i18n settings.importExport.loaded: Loaded
// i18n settings.importExport.mastodonApiCalls: Mastodon API calls
// i18n settings.importExport.mock.blockingList: Blocking list
// i18n settings.importExport.mock.blocks: Blocks
// i18n settings.importExport.mock.data: Data
// i18n settings.importExport.mock.downloadCsv: Download CSV
// i18n settings.importExport.mock.followingList: Following list
// i18n settings.importExport.mock.follows: Follows
// i18n settings.importExport.mock.handleHint: One handle per line, e.g. user@example.com.
// i18n settings.importExport.mock.importType: Import type
// i18n settings.importExport.mock.imported: Imported
// i18n settings.importExport.mock.mutes: Mutes
// i18n settings.importExport.mock.mutingList: Muting list
// i18n settings.importExport.mock.pastePlaceholder: …or paste CSV here
// i18n settings.importExport.mock.skipped: Skipped:
// i18n settings.importExport.mock.title: Mock server data
// i18n settings.importExport.mock.upload: Upload
// i18n settings.importExport.mock.uploading: Uploading…
// i18n settings.importExport.more: more
// i18n settings.importExport.of: of
// i18n settings.importExport.preview: Preview
// i18n settings.importExport.progress.followed: followed
// i18n settings.importExport.progress.processed: processed ·
// i18n settings.importExport.reading: Reading…
// i18n settings.importExport.requested: Requested
// i18n settings.importExport.selectAll: select all
// i18n settings.importExport.selectNone: select none
// i18n settings.importExport.showAlreadyFollowed: Show already followed
// i18n settings.importExport.startSearching: Start searching
// i18n settings.importExport.stop: Stop
// i18n settings.importExport.stopAfter: Stop after
// i18n settings.importExport.suggest.fromArchive: From a Twitter archive…
// i18n settings.importExport.suggest.fromBluesky: From my Bluesky posts
// i18n settings.importExport.suggest.fromFavourites: From posts I've favourited
// i18n settings.importExport.suggest.posts.one: {{count}} post
// i18n settings.importExport.suggest.posts.other: {{count}} posts
// i18n settings.importExport.suggest.reads.a: Reads about
// i18n settings.importExport.suggest.readsSelection.b: of your posts or favourites and counts the hashtags in them. Choose the tags you want, then select Follow selected hashtags.
// i18n settings.importExport.suggest.follow: Follow selected hashtags ({{count}})
// i18n settings.importExport.suggest.summary.one: {{tags}} hashtag found across {{posts}} posts. The most-used are ticked.
// i18n settings.importExport.suggest.summary.other: {{tags}} hashtags found across {{posts}} posts. The most-used are ticked.
// i18n settings.importExport.suggest.title: Suggest hashtags from what you already read
// i18n settings.importExport.tags.importHint.a: Paste hashtags, one per line or separated by commas — with or without the
// i18n settings.importExport.tags.importHint.b: . Tag page URLs like
// i18n settings.importExport.tags.importHint.c: work too. Each one is followed in turn, and shows up in your Home timeline.
// i18n settings.importExport.tags.uploadList: Upload list…
// i18n settings.importExport.tags.preview: Preview
// i18n settings.importExport.tags.followAll: Follow all ({{count}})
// i18n settings.importExport.tags.loaded: Loaded
// i18n settings.importExport.tags.progress: {{done}} / {{total}} processed · {{followed}} followed
// i18n settings.importExport.tags.exportAll: Export all hashtags
// i18n settings.importExport.tags.exportBody.a: Download the hashtags you follow as a
// i18n settings.importExport.tags.exportBody.b: you can import above on another account. Mastodon's own account archive leaves followed tags out, so this file is the only way to carry them across.
// i18n settings.importExport.tags.exportTitle: Export hashtags
// i18n settings.importExport.tags.exporting: Exporting {{count}}…
// i18n settings.importExport.tags.textareaLabel: Hashtags to follow
// i18n settings.importExport.title: Import/Export Friends & Tags

// i18n settings.importExport.tags.importTitle: Import hashtags
// i18n settings.importExport.tags.seeAll: See every hashtag you follow →

// i18n settings.importExport.friends.found.one: Found {{count}} account to follow.
// i18n settings.importExport.friends.found.other: Found {{count}} accounts to follow.
// i18n settings.importExport.friends.noneFound: No handles found — expected @user@host, profile URLs, or a Mastodon CSV export.
// i18n settings.importExport.tags.found.one: Found {{count}} hashtag to follow.
// i18n settings.importExport.tags.found.other: Found {{count}} hashtags to follow.
// i18n settings.importExport.tags.noneFound: No hashtags found — expected #tag names, one per line, or tag page URLs.

@Injectable()
export class SuggestedTagImporter extends ImportTags {}

@Component({
  selector: 'app-settings-import-export',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbCheckbox,
    BridgeFriendsImport,
    ContactFriendsImport,
    TwitterArchiveImport,
    GitHubFriendsImport,
  ],
  providers: [SuggestedTagImporter],
  templateUrl: './settings-import-export.html',
  styleUrls: ['./friend-finder.css', './settings-import-export.css'],
})
export class SettingsImportExport {
  protected readonly accountProfilePath = accountProfilePath;
  private readonly diagnostics = inject(PageDiagnostics);
  private transloco = inject(TranslocoService);
  private api = inject(Api);
  // CSV import/export is a mock-server control-plane endpoint, not public
  // Mastodon; its UI is already gated on `mockTooling` below.
  private mockApi = inject(MockApi);
  private auth = inject(Auth);
  protected importer = inject(ImportFollows);
  protected tagImporter = inject(ImportTags);
  protected tagSources = inject(TagSources);
  protected suggestedTagImporter = inject(SuggestedTagImporter);
  private anonymousTags = inject(AnonymousTags);
  protected github = inject(GitHubSession);
  protected bsky = inject(BlueskySession);

  /**
   * Whether this reader has no server account.
   *
   * Several sections here follow via `api.follow`, which needs credentials, and
   * they hide themselves rather than offering buttons that cannot work. The
   * contacts finder and the CSV importer both branch on identity internally, so
   * they stay — and they are the two an anonymous first-run visitor needs.
   */
  protected readonly isAnonymous = this.auth.isAnonymous;

  protected readonly mockTooling = environment.mockTooling;
  protected pasted = signal('');
  protected fileName = signal<string | null>(null);
  protected parseNote = signal<string | null>(null);
  protected exportingFriends = signal(false);
  protected exportCount = signal(0);
  protected exportError = signal<string | null>(null);
  protected pastedTags = signal('');
  protected tagFileName = signal<string | null>(null);
  protected tagParseNote = signal<string | null>(null);
  protected exportingTags = signal(false);
  protected tagExportCount = signal(0);
  protected tagExportError = signal<string | null>(null);
  protected readonly tagSampleSize = SAMPLE_SIZE;
  /** Which suggestion source last ran, so the results carry their provenance. */
  protected tagSourceUsed = signal<'twitter' | 'bluesky' | 'favourites' | null>(null);
  protected tagArchiveReading = signal(false);

  protected doneCount = computed(
    () =>
      this.importer
        .rows()
        .filter(
          (row) =>
            row.status !== 'pending' && row.status !== 'resolving' && row.status !== 'following',
        ).length,
  );
  protected followedCount = computed(
    () => this.importer.rows().filter((row) => row.status === 'followed').length,
  );
  protected tagDoneCount = computed(
    () =>
      this.tagImporter
        .rows()
        .filter((row) => row.status !== 'pending' && row.status !== 'following').length,
  );
  protected tagFollowedCount = computed(
    () => this.tagImporter.rows().filter((row) => row.status === 'followed').length,
  );
  protected tagAlreadyCount = computed(
    () => this.tagImporter.rows().filter((row) => row.status === 'already_followed').length,
  );
  protected tagFailedCount = computed(
    () => this.tagImporter.rows().filter((row) => row.status === 'failed').length,
  );
  /**
   * The net-change line, or null when we don't actually know the net change.
   *
   * Only shown when the importer confirmed the follow state of every tag. With
   * a partial answer the "already followed" count is a floor, not a fact, and a
   * number presented as fact is worse than no number.
   */
  protected tagRunSummary = computed(() => {
    const rows = this.tagImporter.rows();
    if (!rows.length || this.tagImporter.running() || !this.tagImporter.knowsFollowState()) {
      return null;
    }
    if (this.tagDoneCount() < rows.length) {
      return null;
    }
    const parts = [`${this.tagFollowedCount()} newly followed`];
    if (this.tagAlreadyCount()) {
      parts.push(`${this.tagAlreadyCount()} already followed`);
    }
    if (this.tagFailedCount()) {
      parts.push(`${this.tagFailedCount()} failed`);
    }
    return parts.join(' · ');
  });
  protected importKind = signal<CsvKind>('following');
  protected csvText = signal('');
  protected uploading = signal(false);
  protected report = signal<ImportReport | null>(null);

  protected download(kind: CsvKind): void {
    this.mockApi.exportCsv(kind).subscribe((csv) => {
      saveCsv(csv, `${kind}.csv`);
    });
  }

  protected onServerFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.csvText.set(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  protected upload(): void {
    if (this.uploading() || !this.csvText().trim()) {
      return;
    }
    this.uploading.set(true);
    this.report.set(null);
    this.mockApi.importCsv(this.importKind(), this.csvText()).subscribe({
      next: (report) => {
        this.uploading.set(false);
        this.report.set(report);
      },
      error: () => this.uploading.set(false),
    });
  }

  protected onFriendFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.fileName.set(file.name);
    file.text().then((text) => {
      this.pasted.set(text);
      this.previewFriends();
    });
    input.value = '';
  }

  protected previewFriends(): void {
    const handles = parseHandles(this.pasted());
    this.importer.reset();
    this.importer.load(handles);
    this.parseNote.set(
      handles.length
        ? this.transloco.translate<string>(
            handles.length === 1
              ? 'settings.importExport.friends.found.one'
              : 'settings.importExport.friends.found.other',
            { count: handles.length },
          )
        : this.transloco.translate<string>('settings.importExport.friends.noneFound'),
    );
  }

  protected startImport(): void {
    void this.importer.start();
  }

  protected clearImport(): void {
    this.pasted.set('');
    this.fileName.set(null);
    this.parseNote.set(null);
    this.importer.reset();
  }

  protected onTagFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.tagFileName.set(file.name);
    file.text().then((text) => {
      this.pastedTags.set(text);
      this.previewTags();
    });
    input.value = '';
  }

  protected previewTags(): void {
    const tags = parseTags(this.pastedTags());
    this.tagImporter.reset();
    this.tagImporter.load(tags);
    this.tagParseNote.set(
      tags.length
        ? this.transloco.translate<string>(
            tags.length === 1
              ? 'settings.importExport.tags.found.one'
              : 'settings.importExport.tags.found.other',
            { count: tags.length },
          )
        : this.transloco.translate<string>('settings.importExport.tags.noneFound'),
    );
  }

  protected startTagImport(): void {
    void this.tagImporter.start();
  }

  protected clearTagImport(): void {
    this.pastedTags.set('');
    this.tagFileName.set(null);
    this.tagParseNote.set(null);
    this.tagImporter.reset();
  }

  /**
   * Rank the hashtags in a Twitter archive's own tweets.
   *
   * Reads only tweets.js, and reads it here rather than reusing the people
   * extraction above because the two answer different questions and someone may
   * well want the tags without the contact CSV.
   */
  protected async onTagArchive(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])].filter((file) =>
      ['tweets.js', 'deleted-tweets.js'].includes(file.name.toLowerCase()),
    );
    input.value = '';
    this.tagSources.reset();
    this.tagSourceUsed.set('twitter');
    if (!files.length) {
      this.tagSources.error.set(
        'No tweets found. Choose the unzipped archive folder or its data/tweets.js file.',
      );
      return;
    }
    this.tagArchiveReading.set(true);
    try {
      const sources = await Promise.all(
        files.map(async (file) => ({
          name: file.webkitRelativePath || file.name,
          text: await file.text(),
        })),
      );
      const hashtags = extractArchiveHashtags(sources);
      this.tagSources.loadCounts(
        new Map(hashtags.map((entry) => [entry.tag, entry.count])),
        hashtags.reduce((total, entry) => total + entry.count, 0),
      );
    } catch (err) {
      this.tagSources.error.set(
        err instanceof Error ? err.message : 'That archive could not be read.',
      );
    } finally {
      this.tagArchiveReading.set(false);
    }
  }

  protected async suggestTagsFromBluesky(): Promise<void> {
    this.tagSourceUsed.set('bluesky');
    await this.tagSources.loadFromBluesky();
  }

  protected async suggestTagsFromFavourites(): Promise<void> {
    this.tagSourceUsed.set('favourites');
    await this.tagSources.loadFromFavourites();
  }

  /** Follow the selected suggestions and keep their results in this section. */
  protected useSuggestedTags(): void {
    const tags = this.tagSources.selectedTags();
    if (!tags.length || this.suggestedTagImporter.running()) return;
    this.suggestedTagImporter.reset();
    this.suggestedTagImporter.load(tags);
    void this.suggestedTagImporter.start();
  }

  protected tagStatusLabel(status: string): string {
    switch (status) {
      case 'pending':
        return 'waiting';
      case 'following':
        return 'following…';
      case 'followed':
        return 'followed ✓';
      case 'already_followed':
        return 'already following';
      default:
        return 'failed';
    }
  }

  /**
   * Download the followed hashtags as a list this page can read back.
   *
   * Mastodon's own account archive does not include followed tags, so there is
   * no standard format to match — this is the simplest thing that round-trips:
   * a header line and one bare tag per line, which `parseTags` reads.
   */
  protected async exportTags(): Promise<void> {
    if (this.exportingTags()) return;
    this.exportingTags.set(true);
    this.tagExportError.set(null);
    this.tagExportCount.set(0);
    try {
      const tags = this.isAnonymous ? this.anonymousTags.tags() : await this.allFollowedTags();
      if (!tags.length) {
        this.tagExportError.set('You don’t follow any hashtags yet.');
        return;
      }
      saveCsv(followedTagsCsv(tags), 'followed_tags.csv');
    } catch {
      this.tagExportError.set('Could not export your hashtags. Please try again.');
    } finally {
      this.exportingTags.set(false);
    }
  }

  /**
   * Every followed hashtag, walking the `Link` cursor to the end.
   *
   * One page used to be the whole export, which silently truncated for anyone
   * following more tags than a page holds — the failure mode being a file that
   * looks complete and isn't.
   */
  private async allFollowedTags(): Promise<string[]> {
    const names: string[] = [];
    const seen = new Set<string>();
    let maxId: string | undefined;
    while (true) {
      const page = await firstValueFrom(this.api.followedTagsPage(maxId));
      for (const tag of page.tags) {
        if (!seen.has(tag.name)) {
          seen.add(tag.name);
          names.push(tag.name);
        }
      }
      this.tagExportCount.set(names.length);
      // No cursor, or one that did not advance, means the list ended. The mock
      // answers with everything at once and no Link header, so that is the
      // normal path there rather than an error.
      if (!page.nextMaxId || page.nextMaxId === maxId || !page.tags.length) {
        return names;
      }
      maxId = page.nextMaxId;
    }
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'pending':
        return 'waiting';
      case 'resolving':
        return 'looking up…';
      case 'following':
        return 'following…';
      case 'followed':
        return 'followed ✓';
      case 'not_found':
        return 'not found';
      default:
        return 'failed';
    }
  }

  /** Fetch every following page and download a portable Mastodon follow list. */
  protected async exportFriends(): Promise<void> {
    const accountId = this.auth.account()?.id;
    if (!accountId || this.exportingFriends()) return;
    this.exportingFriends.set(true);
    this.exportCount.set(0);
    this.exportError.set(null);
    const accounts: Account[] = [];
    const seen = new Set<string>();
    let maxId: string | undefined;
    try {
      while (true) {
        const page = await firstValueFrom(this.api.accountFollowing(accountId, maxId, 80));
        for (const account of page) {
          if (!seen.has(account.id)) {
            seen.add(account.id);
            accounts.push(account);
          }
        }
        this.exportCount.set(accounts.length);
        if (page.length < 80) break;
        const nextMaxId = page.at(-1)?.id;
        if (!nextMaxId || nextMaxId === maxId) throw new Error('Pagination did not advance.');
        maxId = nextMaxId;
      }
      saveCsv(followingAccountsCsv(accounts), 'following_accounts.csv');
    } catch {
      this.exportError.set('Could not export every friend. Please try again.');
    } finally {
      this.exportingFriends.set(false);
    }
  }
}
