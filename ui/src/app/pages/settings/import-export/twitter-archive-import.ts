import { afterNextRender, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { accountProfilePath } from '../../../account-route';
import { MbButton } from '../../../design-system/button/button';
import { Account } from '../../../models';
import { PageDiagnostics } from '../../../page-diagnostics';
import {
  extractTwitterArchive,
  TwitterArchiveSummary,
  twitterArchiveCsv,
} from '../../../twitter-archive';
import { saveCsv } from './save-csv';
import {
  isBotOrMirrorTwitterCandidate,
  isInactiveTwitterCandidate,
  isIncompleteTwitterCandidate,
  isStaleTwitterCandidate,
  TwitterFriendDiscovery,
  TwitterFriendStatus,
} from './twitter-friend-discovery';

/**
 * Carries a read archive across the Mastodon sign-in redirect.
 *
 * The archive is read before any account exists, then OAuth leaves the page.
 * Tab-lived and consumed once, so it never outlives the sign-in it serves.
 */
const HANDOFF_KEY = 'mockingbird_twitter_archive_handoff';

export function stashTwitterArchive(archive: TwitterArchiveSummary): void {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(archive));
  } catch {
    // Too large or storage blocked: the reader picks the archive again.
  }
}

/** Read and clear a stashed archive; null if absent or not an archive. */
export function takeTwitterArchive(): TwitterArchiveSummary | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TwitterArchiveSummary>;
    return Array.isArray(parsed.people) && Array.isArray(parsed.files)
      ? (parsed as TwitterArchiveSummary)
      : null;
  } catch {
    return null;
  }
}

// i18n settings.importExport.twitter.archiveHint.a: Choose your unzipped archive folder. Mawkingbird reads only
// i18n settings.importExport.twitter.archiveHint.b: , and
// i18n settings.importExport.twitter.archiveHint.c: in your browser; nothing is uploaded. You can also select those files directly from the archive's
// i18n settings.importExport.twitter.candidates.one: {{count}} Mastodon candidate
// i18n settings.importExport.twitter.candidates.other: {{count}} Mastodon candidates
// i18n settings.importExport.twitter.candidatesShown: Mastodon candidates shown
// i18n settings.importExport.twitter.chooseArchive: Choose unzipped archive…
// i18n settings.importExport.twitter.chooseFiles: Choose data files…
// i18n settings.importExport.twitter.currentlyFollowed: currently followed ·
// i18n settings.importExport.twitter.downloadCsv: Download contacts CSV
// i18n settings.importExport.twitter.folder: folder.
// i18n settings.importExport.twitter.handleRecovered: of those have a handle recovered from your tweets
// i18n settings.importExport.twitter.hide.bots: Bots or mirrors
// i18n settings.importExport.twitter.hide.inactive: Inactive (&lt;10 combined posts, following, and followers)
// i18n settings.importExport.twitter.hide.incomplete: Missing a bio or avatar
// i18n settings.importExport.twitter.hide.stale: No posts, or last activity over a year ago (when known)
// i18n settings.importExport.twitter.hideTitle: Hide candidates that are…
// i18n settings.importExport.twitter.inviteLink: invite them from Twitter
// i18n settings.importExport.twitter.mentions: mentions
// i18n settings.importExport.twitter.missing.a: No
// i18n settings.importExport.twitter.missing.following: was selected, so this export contains interactions only.
// i18n settings.importExport.twitter.missing.tweets: was selected. Add it to recover reply/mention history and handles for some followed IDs.
// i18n settings.importExport.twitter.notJoined: The ones you don’t find here haven’t joined yet —
// i18n settings.importExport.twitter.read: Read
// i18n settings.importExport.twitter.readNote: . The CSV keeps numeric Twitter IDs even when Twitter omitted the handle.
// i18n settings.importExport.twitter.readingLocally: Reading the archive locally…
// i18n settings.importExport.twitter.readyToExport: unique Twitter accounts ready to export
// i18n settings.importExport.twitter.readyToSearch: Twitter handles ready to search ·
// i18n settings.importExport.twitter.repliedTo: people replied to in
// i18n settings.importExport.twitter.replies: replies ·
// i18n settings.importExport.twitter.searchNote: username-search calls used. Same-handle accounts are likely matches, not confirmed identities; a matching display name or profile link back to Twitter is shown as extra evidence.
// i18n settings.importExport.twitter.seenIn: people seen in
// i18n settings.importExport.twitter.title: Extract contacts from Twitter/Twitter
// i18n twitterImport.signIn.title: Next: find them on Mastodon.
// i18n twitterImport.signIn.body: Sign in to search your Mastodon server for these {{count}} people and follow the ones who have already moved. Your archive stays in this browser.
// i18n twitterImport.signIn.action: Sign in with Mastodon

/**
 * Twitter archive → Mastodon follows: read the archive locally, search the
 * signed-in server for each handle, follow in place.
 *
 * Shared by Settings → Import/Export and the /twitter-to-mastodon mini-app.
 * Reading needs no account; searching and following do, so a signed-out
 * reader is offered sign-in once the archive is read.
 */
@Component({
  selector: 'app-twitter-archive-import',
  imports: [FormsModule, RouterLink, TranslocoPipe, MbButton],
  templateUrl: './twitter-archive-import.html',
  styleUrl: './friend-finder.css',
})
export class TwitterArchiveImport {
  protected readonly accountProfilePath = accountProfilePath;
  private readonly diagnostics = inject(PageDiagnostics);
  private readonly router = inject(Router);
  protected twitterDiscovery = inject(TwitterFriendDiscovery);

  /** Where "invite them" points: the full app's builder, or a mini-app's own tab. */
  readonly inviteLink = input('/invites');
  /** The page sign-in returns to with the archive. */
  readonly signInReturn = input('/twitter-to-mastodon');

  /**
   * Signed out on a public page: once the archive is read, ask for a Mastodon
   * sign-in in place of the search. Settings is always behind an account.
   */
  readonly offerSignIn = input(false);
  protected readonly canSearch = computed(() => !this.offerSignIn());

  /** Held by the discovery service, so it survives moving between tabs. */
  protected twitterArchive = this.twitterDiscovery.archive;
  protected twitterArchiveReading = signal(false);
  protected twitterArchiveError = signal<string | null>(null);
  protected twitterCallLimit = signal(20);
  protected hideTwitterFollowed = signal(false);
  protected hideTwitterInactive = signal(false);
  protected hideTwitterIncomplete = signal(false);
  protected hideTwitterBots = signal(false);
  protected hideTwitterStale = signal(false);

  constructor() {
    // Inputs are not bound yet; read the handoff once they are.
    afterNextRender(() => {
      if (this.offerSignIn() || this.twitterArchive()) return;
      const stashed = takeTwitterArchive();
      if (stashed) this.twitterDiscovery.load(stashed.people, stashed);
    });
  }

  protected twitterFoundCount = computed(() =>
    this.twitterDiscovery.rows().reduce((count, row) => count + row.matches.length, 0),
  );
  protected twitterPendingCount = computed(
    () => this.twitterDiscovery.rows().filter((row) => row.status === 'pending').length,
  );
  protected twitterFiltersActive = computed(
    () =>
      this.hideTwitterInactive() ||
      this.hideTwitterIncomplete() ||
      this.hideTwitterBots() ||
      this.hideTwitterStale() ||
      this.hideTwitterFollowed(),
  );
  protected twitterVisibleMatchCount = computed(() =>
    this.twitterDiscovery
      .rows()
      .reduce(
        (count, row) =>
          count + row.matches.filter((match) => this.twitterMatchVisible(match.account)).length,
        0,
      ),
  );
  protected twitterVisibleRows = computed(() =>
    this.twitterDiscovery.rows().filter((row) => {
      const renderable =
        row.matches.length || row.status === 'searching' || row.status === 'failed';
      return (
        renderable &&
        (!row.matches.length ||
          row.matches.some((match) => this.twitterMatchVisible(match.account)))
      );
    }),
  );

  protected async onTwitterArchive(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])].filter((file) =>
      ['following.js', 'tweets.js', 'deleted-tweets.js'].includes(file.name.toLowerCase()),
    );
    input.value = '';
    this.twitterArchiveError.set(null);
    this.twitterDiscovery.reset();
    if (!files.length) {
      this.twitterArchiveError.set(
        'No archive data found. Choose the unzipped archive folder or its data/following.js and data/tweets.js files.',
      );
      return;
    }
    this.twitterArchiveReading.set(true);
    try {
      const sources = await Promise.all(
        files.map(async (file) => ({
          name: file.webkitRelativePath || file.name,
          text: await file.text(),
        })),
      );
      const archive = extractTwitterArchive(sources);
      this.twitterDiscovery.load(archive.people, archive);
    } catch (error) {
      this.diagnostics.error('ImportExport', 'twitter-archive:read-error', error);
      this.twitterArchiveError.set(
        error instanceof Error ? error.message : 'The Twitter archive could not be read.',
      );
    } finally {
      this.twitterArchiveReading.set(false);
    }
  }

  protected downloadTwitterArchive(): void {
    const archive = this.twitterArchive();
    if (!archive) {
      return;
    }
    saveCsv(twitterArchiveCsv(archive.people), 'mawkingbird-twitter-contacts.csv');
  }

  protected clearTwitterArchive(): void {
    this.twitterArchiveError.set(null);
    this.twitterDiscovery.reset();
  }

  protected startTwitterSearch(): void {
    void this.twitterDiscovery.start(this.twitterCallLimit());
  }

  protected setTwitterCallLimit(value: number | string): void {
    const parsed = Number(value);
    this.twitterCallLimit.set(
      Number.isFinite(parsed) ? Math.min(5000, Math.max(1, Math.floor(parsed))) : 20,
    );
  }

  protected twitterStatusLabel(status: TwitterFriendStatus): string {
    switch (status) {
      case 'pending':
        return 'waiting';
      case 'searching':
        return 'searching…';
      case 'complete':
        return 'checked';
      default:
        return 'failed';
    }
  }

  protected twitterMatchVisible(account: Account): boolean {
    if (this.hideTwitterInactive() && isInactiveTwitterCandidate(account)) return false;
    if (this.hideTwitterIncomplete() && isIncompleteTwitterCandidate(account)) return false;
    if (this.hideTwitterBots() && isBotOrMirrorTwitterCandidate(account)) return false;
    if (this.hideTwitterStale() && isStaleTwitterCandidate(account)) return false;
    return !(
      this.hideTwitterFollowed() && this.twitterDiscovery.relationship(account.id)?.following
    );
  }

  /** Keep the archive for the return trip, then start a Mastodon sign-in that comes back here. */
  protected signIn(): void {
    const archive = this.twitterArchive();
    if (archive) stashTwitterArchive(archive);
    void this.router.navigate(['/login/mastodon'], {
      queryParams: { next: this.signInReturn() },
    });
  }
}
