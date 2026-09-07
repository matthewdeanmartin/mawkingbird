import { Component, computed, inject, signal } from '@angular/core';
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
import { ContactDiscovery } from './contact-discovery';
import { contactPickerAvailable, pickContacts } from './contact-picker';
import { GitHubSession } from '../../../providers/github/github-session';
import { GitHubFriendDiscovery, GitHubFriendStatus } from './github-friend-discovery';
import {
  extractArchiveHashtags,
  extractTwitterArchive,
  TwitterArchiveSummary,
  twitterArchiveCsv,
} from '../../../twitter-archive';
import { SAMPLE_SIZE, TagSources } from './tag-sources';
import {
  isBotOrMirrorTwitterCandidate,
  isInactiveTwitterCandidate,
  isIncompleteTwitterCandidate,
  isStaleTwitterCandidate,
  TwitterFriendDiscovery,
  TwitterFriendStatus,
} from './twitter-friend-discovery';
import { BridgeFinder, BridgeRow } from './bridge-finder';
import { BridgeNetwork } from './bridge-matching';
import { BlueskySession } from '../../../providers/bluesky/bluesky-session';
import { MastodonConnector } from '../../../providers/mastodon/mastodon-connector';
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

function saveCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
// i18n settings.importExport.bridge.all: all
// i18n settings.importExport.bridge.anon.a: Reading a server anonymously can show you public posts, but it cannot tell us who
// i18n settings.importExport.bridge.anon.b: follow — so both sides need real credentials.
// i18n settings.importExport.bridge.anon.you: you
// i18n settings.importExport.bridge.bluesky: Bluesky —
// i18n settings.importExport.bridge.blueskyToMastodon: Bluesky → Mastodon
// i18n settings.importExport.bridge.connectBluesky: connect Bluesky
// i18n settings.importExport.bridge.connected: connected
// i18n settings.importExport.bridge.directionLabel: Search direction
// i18n settings.importExport.bridge.followSelected: Follow selected ({{count}})
// i18n settings.importExport.bridge.intro: You keep two follow lists that were built at different times. This finds the overlap: who you already follow on one network, and can now follow on the other.
// i18n settings.importExport.bridge.mastodon: Mastodon —
// i18n settings.importExport.bridge.mastodonToBluesky: Mastodon → Bluesky
// i18n settings.importExport.bridge.needsBoth: This needs both accounts connected.
// i18n settings.importExport.bridge.noMatches: No matches yet. Nobody you follow named their other account in their bio.
// i18n settings.importExport.bridge.pendingNote: didn’t name their other account. Searching for them costs one request each, so it’s opt-in and capped.
// i18n settings.importExport.bridge.people: people
// i18n settings.importExport.bridge.readFollows: Read my follows (free)
// i18n settings.importExport.bridge.readingFollows: Reading your follows…
// i18n settings.importExport.bridge.search: Search
// i18n settings.importExport.bridge.searchUpTo: Search up to
// i18n settings.importExport.bridge.searchesUsed: searches used
// i18n settings.importExport.bridge.signInMastodon: sign in to a Mastodon account
// i18n settings.importExport.bridge.summary.one: Read <strong>{{follows}}</strong> follows over {{pages}} page and found <strong>{{found}}</strong> from bios alone — no searches spent.
// i18n settings.importExport.bridge.summary.other: Read <strong>{{follows}}</strong> follows over {{pages}} pages and found <strong>{{found}}</strong> from bios alone — no searches spent.
// i18n settings.importExport.bridge.title: Find the same people on your other network
// i18n settings.importExport.checking: Checking…
// i18n settings.importExport.clear: clear
// i18n settings.importExport.contacts.callsUsed: API calls used
// i18n settings.importExport.contacts.chooseCsv: Choose contacts CSV…
// i18n settings.importExport.contacts.clues.one: {{count}} matching clue
// i18n settings.importExport.contacts.clues.other: {{count}} matching clues
// i18n settings.importExport.contacts.intro: Look for the people in your contacts through your home server. Your contacts stay in this browser; only derived search terms are sent to your server. Nobody is followed automatically. Names, usernames, domains, and profile links are clues—not proof of identity.
// i18n settings.importExport.contacts.loadedNote: only in this browser.
// i18n settings.importExport.contacts.noCandidate: searched contacts had no candidate match:
// i18n settings.importExport.contacts.pick: Pick from my contacts…
// i18n settings.importExport.contacts.pickedNote: Picked from your contacts. Nothing was saved — closing this page forgets them.
// i18n settings.importExport.contacts.pickerNote: On this phone you can pick contacts directly — no export, no file. Your browser shows the picker and this page only ever sees the people you tap.
// i18n settings.importExport.contacts.readyToSearch: contacts ready to search
// i18n settings.importExport.contacts.skipped.a: skipped because they had no full person name or Mastodon handle. Up to
// i18n settings.importExport.contacts.skipped.b: calls total; this run stops at
// i18n settings.importExport.contacts.title: Find contacts on Mastodon
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
// i18n settings.importExport.github.callsUsed: {{used}} / {{limit}} username-search calls used.
// i18n settings.importExport.github.checked.a: Checked
// i18n settings.importExport.github.checked.b: starred repositories and
// i18n settings.importExport.github.checked.c: unique owners; contributors were not loaded.
// i18n settings.importExport.github.checkingStarred: Checking starred repo owners…
// i18n settings.importExport.github.follows.body: The shorter, higher-confidence list. Direct profile links are matched first; remaining profiles can be searched once by GitHub username.
// i18n settings.importExport.github.follows.title: People you follow on GitHub
// i18n settings.importExport.github.friends.one: {{count}} GitHub friend
// i18n settings.importExport.github.friends.other: {{count}} GitHub friends
// i18n settings.importExport.github.intro: Use either or both GitHub sources. Exact handles are resolved through your Mastodon server so results open inside Mawkingbird and show your follow status.
// i18n settings.importExport.github.linkedSummary: {{count}} matched directly from GitHub profile links. Loaded in
// i18n settings.importExport.github.loadingFollows: Loading GitHub follows…
// i18n settings.importExport.github.mastodonMatches.one: {{count}} Mastodon match
// i18n settings.importExport.github.mastodonMatches.other: {{count}} Mastodon matches
// i18n settings.importExport.github.matchViaFriends: Get matches via GitHub friends
// i18n settings.importExport.github.matchViaStars: Get matches via GitHub stars
// i18n settings.importExport.github.reloadFollows: Reload GitHub follows
// i18n settings.importExport.github.requests.one: {{count}} GitHub GraphQL request
// i18n settings.importExport.github.requests.other: {{count}} GitHub GraphQL requests
// i18n settings.importExport.github.resolved.one: and resolved {{count}} exact linked profile through your server.
// i18n settings.importExport.github.resolved.other: and resolved {{count}} exact linked profiles through your server.
// i18n settings.importExport.github.starred.body: The longer, lower-confidence list. Checks each unique repository owner for a direct Mastodon profile link. Contributors and stargazers are never loaded.
// i18n settings.importExport.github.starred.title: Owners of repositories you starred
// i18n settings.importExport.github.starredMatches.one: {{count}} starred-owner match
// i18n settings.importExport.github.starredMatches.other: {{count}} starred-owner matches
// i18n settings.importExport.github.starsChecked: GitHub stars checked
// i18n settings.importExport.github.title: Find GitHub friends on Mastodon
// i18n settings.importExport.github.youStarred: You starred:
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
// i18n settings.importExport.mock.handleHint: One handle per line, e.g. user&#64;example.com.
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
// i18n settings.importExport.suggest.reads.b: of your posts or favourites and counts the hashtags in them. Nothing is followed until you send the results to the box above.
// i18n settings.importExport.suggest.send.a: Send
// i18n settings.importExport.suggest.send.b: to the box above
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

// i18n settings.importExport.bridge.following: Following…
// i18n settings.importExport.tags.importTitle: Import hashtags
// i18n settings.importExport.tags.seeAll: See every hashtag you follow →
// i18n settings.importExport.twitter.title: Extract contacts from Twitter/Twitter

// i18n settings.importExport.friends.found.one: Found {{count}} account to follow.
// i18n settings.importExport.friends.found.other: Found {{count}} accounts to follow.
// i18n settings.importExport.friends.noneFound: No handles found — expected @user@host, profile URLs, or a Mastodon CSV export.
// i18n settings.importExport.tags.found.one: Found {{count}} hashtag to follow.
// i18n settings.importExport.tags.found.other: Found {{count}} hashtags to follow.
// i18n settings.importExport.tags.noneFound: No hashtags found — expected #tag names, one per line, or tag page URLs.

@Component({
  selector: 'app-settings-import-export',
  imports: [FormsModule, RouterLink, TranslocoPipe],
  templateUrl: './settings-import-export.html',
  styleUrl: './settings-import-export.css',
})
export class SettingsImportExport {
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
  private anonymousTags = inject(AnonymousTags);
  protected contactDiscovery = inject(ContactDiscovery);
  protected github = inject(GitHubSession);
  protected githubDiscovery = inject(GitHubFriendDiscovery);
  protected twitterDiscovery = inject(TwitterFriendDiscovery);
  protected bridge = inject(BridgeFinder);
  protected bsky = inject(BlueskySession);
  protected mastodonConnector = inject(MastodonConnector);

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
  protected contactFileName = signal<string | null>(null);
  protected contactCallLimit = signal(20);
  protected githubCallLimit = signal(20);
  protected hideGithubFollowed = signal(false);
  protected twitterArchive = signal<TwitterArchiveSummary | null>(null);
  protected twitterArchiveReading = signal(false);
  protected twitterArchiveError = signal<string | null>(null);
  protected twitterCallLimit = signal(20);
  protected hideTwitterFollowed = signal(false);
  protected hideTwitterInactive = signal(false);
  protected hideTwitterIncomplete = signal(false);
  protected hideTwitterBots = signal(false);
  protected hideTwitterStale = signal(false);

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
  protected contactMisses = computed(() =>
    this.contactDiscovery
      .rows()
      .filter((row) => row.status === 'complete' && row.matches.length === 0)
      .map((row) => row.contact.name),
  );
  protected githubFoundCount = computed(() =>
    this.githubDiscovery
      .rows()
      .reduce((count, row) => count + (row.identity ? 1 : row.matches.length), 0),
  );
  protected githubLinkedCount = computed(
    () => this.githubDiscovery.rows().filter((row) => row.identity).length,
  );
  protected githubPendingCount = computed(
    () => this.githubDiscovery.rows().filter((row) => row.status === 'pending').length,
  );
  protected githubFollowingProfileCount = computed(
    () => this.githubDiscovery.rows().filter((row) => row.source !== 'starred-owner').length,
  );
  protected githubStarredMatchCount = computed(
    () => this.githubDiscovery.rows().filter((row) => row.source === 'starred-owner').length,
  );
  protected githubVisibleRows = computed(() =>
    this.githubDiscovery.rows().filter((row) => {
      const renderable =
        row.identity || row.matches.length || row.status === 'searching' || row.status === 'failed';
      return (
        renderable &&
        (!this.hideGithubFollowed() ||
          !row.matches.length ||
          row.matches.some(
            (match) => !this.githubDiscovery.relationship(match.account.id)?.following,
          ))
      );
    }),
  );
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

  // --- bridge finder ---

  protected bridgeBudget = signal(50);
  protected bridgeSelected = signal<ReadonlySet<string>>(new Set());
  protected bridgeFollowing = signal(false);

  /**
   * Whether the user has credentials on Mastodon.
   *
   * Two ways to have them, and both count: a Mastodon-primary account holds the
   * token as its identity, while a Bluesky-primary account holds it in the
   * connector. An `anonymous` connector is deliberately *not* enough — reading a
   * public server anonymously cannot tell us who *you* follow.
   */
  protected hasMastodon = computed(
    () => this.auth.kind() === 'mastodon' || this.mastodonConnector.signedIn(),
  );

  /** Whether a Bluesky account is linked, in either of its two roles. */
  protected hasBluesky = computed(() => this.bsky.linked());

  /**
   * Both sides are required, and the section is disabled rather than hidden when
   * one is missing — a greyed-out bridge finder is the best argument there is
   * for attaching the second account.
   */
  protected bridgeReady = computed(() => this.hasMastodon() && this.hasBluesky());

  protected bridgeSource = computed(() => this.bridge.direction().source);

  protected bridgeMatchedRows = computed(() =>
    this.bridge.rows().filter((row) => row.matches.length > 0),
  );

  protected bridgePendingCount = computed(
    () => this.bridge.rows().filter((row) => row.status === 'pending').length,
  );

  /** Matches that are selected, unfollowed, and therefore actionable. */
  protected bridgeFollowTargets = computed(() =>
    this.bridgeMatchedRows()
      .flatMap((row) => row.matches)
      .filter(
        (match) =>
          this.bridgeSelected().has(match.account.id) && !this.bridge.isFollowing(match.account),
      )
      .map((match) => match.account),
  );

  protected setBridgeDirection(source: BridgeNetwork): void {
    this.bridgeSelected.set(new Set());
    this.bridge.setDirection(
      source === 'mastodon'
        ? { source: 'mastodon', target: 'bluesky' }
        : { source: 'bluesky', target: 'mastodon' },
    );
  }

  protected async loadBridge(): Promise<void> {
    this.bridgeSelected.set(new Set());
    await this.bridge.load();
    // Exact matches are self-published, so they are pre-selected; inferred ones
    // are not, and weak ones especially must never be followed by default.
    this.bridgeSelected.set(
      new Set(
        this.bridge
          .rows()
          .flatMap((row) => row.matches)
          .filter((match) => match.confidence === 'exact')
          .map((match) => match.account.id),
      ),
    );
  }

  protected toggleBridgeMatch(id: string): void {
    this.bridgeSelected.update((selected) => {
      const next = new Set(selected);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected async followBridgeSelection(): Promise<void> {
    if (this.bridgeFollowing()) return;
    this.bridgeFollowing.set(true);
    try {
      await this.bridge.followAll(this.bridgeFollowTargets());
    } finally {
      this.bridgeFollowing.set(false);
    }
  }

  protected bridgeRowKey(row: BridgeRow): string {
    return row.person.id;
  }

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

  protected async onTwitterArchive(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])].filter((file) =>
      ['following.js', 'tweets.js', 'deleted-tweets.js'].includes(file.name.toLowerCase()),
    );
    input.value = '';
    this.twitterArchive.set(null);
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
      this.twitterArchive.set(archive);
      this.twitterDiscovery.load(archive.people);
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
    this.twitterArchive.set(null);
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

  protected onContactFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.contactFileName.set(file.name);
    this.contactPickerError.set(null);
    file.text().then((text) => this.contactDiscovery.load(text));
    input.value = '';
  }

  /**
   * Whether to offer the phone's own contact picker.
   *
   * Read once at construction rather than per-render: the answer is a property
   * of the browser and cannot change while the page is open.
   */
  protected readonly canPickContacts = contactPickerAvailable();

  /** A picker failure worth showing, or null. Cleared by the next attempt. */
  protected readonly contactPickerError = signal<string | null>(null);

  /**
   * Open the phone's contact picker and search for whoever was chosen.
   *
   * Everything downstream is the CSV path's code — the picker only supplies the
   * contacts. Deliberately does **not** start searching on its own: the budget
   * control sits right there and spending someone's API calls without a second
   * tap would be the app deciding how much to spend on their behalf.
   */
  protected async pickPhoneContacts(): Promise<void> {
    this.contactPickerError.set(null);
    const outcome = await pickContacts();
    switch (outcome.kind) {
      case 'picked':
        // Replaces whatever a CSV had loaded, exactly as choosing a second CSV
        // would. Two contact sets merged into one list would make the counts on
        // screen unexplainable.
        this.contactFileName.set(null);
        this.contactDiscovery.loadContacts(outcome.result);
        break;
      case 'failed':
        this.contactPickerError.set(outcome.message);
        break;
      case 'unsupported':
        this.contactPickerError.set('This browser cannot open a contact picker.');
        break;
      case 'cancelled':
        // Nothing chosen, nothing to say.
        break;
    }
  }

  protected startContactSearch(): void {
    void this.contactDiscovery.start(this.contactCallLimit());
  }

  protected setContactCallLimit(value: number | string): void {
    const parsed = Number(value);
    this.contactCallLimit.set(
      Number.isFinite(parsed) ? Math.min(1000, Math.max(1, Math.floor(parsed))) : 20,
    );
  }

  protected clearContactSearch(): void {
    this.contactFileName.set(null);
    this.contactPickerError.set(null);
    this.contactDiscovery.reset();
  }

  protected loadGitHubFriends(): void {
    void this.githubDiscovery.load();
  }

  protected loadGitHubStarredOwners(): void {
    void this.githubDiscovery.loadStarredOwners();
  }

  protected startGitHubSearch(): void {
    void this.githubDiscovery.start(this.githubCallLimit());
  }

  protected setGitHubCallLimit(value: number | string): void {
    const parsed = Number(value);
    this.githubCallLimit.set(
      Number.isFinite(parsed) ? Math.min(1000, Math.max(1, Math.floor(parsed))) : 20,
    );
  }

  protected githubStatusLabel(status: GitHubFriendStatus): string {
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

  protected contactStatusLabel(status: string): string {
    switch (status) {
      case 'pending':
        return 'waiting';
      case 'searching':
        return 'searching…';
      case 'complete':
        return 'searched';
      default:
        return 'failed';
    }
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

  /** Move the ticked suggestions into the importer above, ready to follow. */
  protected useSuggestedTags(): void {
    const tags = this.tagSources.selectedTags();
    if (!tags.length) {
      return;
    }
    this.pastedTags.set(tags.map((tag) => `#${tag}`).join('\n'));
    this.previewTags();
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
