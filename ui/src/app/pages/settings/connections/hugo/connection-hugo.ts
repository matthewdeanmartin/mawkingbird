import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ClientPrefs } from '../../../../client-prefs';
import { Drafts } from '../../../../drafts';
import { GitHubSession } from '../../../../providers/github/github-session';
import { HugoEditSession } from '../../../../providers/hugo/hugo-edit-session';
import { HugoFeed } from '../../../../providers/hugo/hugo-feed';
import { HugoPostRow } from '../../../../providers/hugo/hugo-listing';
import { HugoPosts } from '../../../../providers/hugo/hugo-posts';
import {
  DEFAULT_CONTENT_PATH,
  HugoSettings,
  normalizeSiteUrl,
  parseRepoInput,
} from '../../../../providers/hugo/hugo-settings';
import { HugoValidate } from '../../../../providers/hugo/hugo-validate';
import { CONNECTION_SCOPE_COPY } from '../connection-catalog';
import { expiryLabel } from '../expiry-label';
import { credentialLocation, StorageBadge } from '../storage-badge';
import { VaultBridge } from '../../../../providers/vault/vault-bridge';

/** The registry base this page's credential is stored under. */
const HUGO_KEY = 'mockingbird_hugo_credentials';
import { Terminology } from '../../../../terminology';
import { PageDiagnostics } from '../../../../page-diagnostics';

// i18n settings.connections.hugo.back: ‹ All connections
// i18n settings.connections.hugo.title: ✍️ Blog (Hugo)
// i18n settings.connections.hugo.intro: Publish Markdown posts to your own Hugo site on GitHub. A post is a file: Mawkingbird commits it to your repository, and GitHub builds the site. Nobody else hosts your writing, and there is no blog service that can close your account.
// i18n settings.connections.hugo.step1.a: Have a Hugo site in a GitHub repository. Starting from scratch?
// i18n settings.connections.hugo.step1.link: Hugo's quick start ↗
// i18n settings.connections.hugo.step1.b: — or fork any Hugo theme's example site, then turn on GitHub Pages for it.
// i18n settings.connections.hugo.step2.link: Create a fine-grained personal access token ↗
// i18n settings.connections.hugo.step2.a: . Under
// i18n settings.connections.hugo.repositoryAccess: Repository access
// i18n settings.connections.hugo.step2.b: pick
// i18n settings.connections.hugo.onlySelectRepositories: Only select repositories
// i18n settings.connections.hugo.step2.c: and choose your blog repo. Under
// i18n settings.connections.hugo.permissionsRepository: Permissions → Repository
// i18n settings.connections.hugo.step2.d: set
// i18n settings.connections.hugo.step2.e: to
// i18n settings.connections.hugo.readAndWrite: Read and write
// i18n settings.connections.hugo.step2.f: , and
// i18n settings.connections.hugo.readOnly: Read-only
// i18n settings.connections.hugo.step2.g: (that one is for showing build status later).
// i18n settings.connections.hugo.step3: Paste it below with your repository details, then save. We check them before storing.
// i18n settings.connections.hugo.warning.a: This token can commit files to the repository you scope it to. It is stored in this browser's localStorage, never sent to Mawkingbird, and sent only to
// i18n settings.connections.hugo.warning.b: — no CORS proxy is involved, because GitHub's API accepts browser requests directly. Scope it to the one blog repository, and revoke it in GitHub to invalidate it.
// i18n settings.connections.hugo.connected: Connected
// i18n settings.connections.hugo.viewSite: View site ↗
// i18n settings.connections.hugo.disconnect: Disconnect
// i18n settings.connections.hugo.publishingTo: Publishing to
// i18n settings.connections.hugo.on: on
// i18n settings.connections.hugo.deletedOn: This token is deleted from this browser on {{date}}.
// i18n settings.connections.hugo.readBack.title: Read your blog back
// i18n settings.connections.hugo.readBack.body: Your Hugo site publishes an RSS feed, so Mawkingbird can read your own posts the same way it reads any other feed — no special handling, and no CORS proxy if your site is on GitHub Pages.
// i18n settings.connections.hugo.includeInProfile: Include my blog's posts on my profile
// i18n settings.connections.hugo.includeInProfile.on: Your published posts appear alongside your Mawkingbird posts on your own profile.
// i18n settings.connections.hugo.includeInProfile.off: Add your site address above to turn this on.
// i18n settings.connections.hugo.inHomeTimeline: In your home timeline
// i18n settings.connections.hugo.removeFromFeeds: Remove from feeds
// i18n settings.connections.hugo.lookingForFeed: Looking for your feed…
// i18n settings.connections.hugo.addToHomeTimeline: Add my blog to my home timeline
// i18n settings.connections.hugo.addSiteFirst: Add your site address above first.
// i18n settings.connections.hugo.posse.title: Record what you like and boost
// i18n settings.connections.hugo.posse.label: Record interactions on my blog
// i18n settings.connections.hugo.posse.hintA: Liking or boosting a post also keeps a record of it on your own site, so it survives whether or not the other server does. The post is still liked normally — this is additional. Records collect under
// i18n settings.connections.hugo.waitingToPublish: Waiting to publish
// i18n settings.connections.hugo.posse.hintB: and are committed when you say so, not one commit per like.
// i18n settings.connections.hugo.posse.hintC: Turn this on once your blog is set up to receive: a webmention endpoint, a template that renders these records, and the scheduled job that pulls mentions in. Before that, it writes files nothing displays.
// i18n settings.connections.hugo.postsHeading: Posts in this repository
// i18n settings.connections.hugo.reading: Reading…
// i18n settings.connections.hugo.refresh: Refresh
// i18n settings.connections.hugo.readingFolder: Reading your posts folder…
// i18n settings.connections.hugo.noPostsYet.a: No posts yet in
// i18n settings.connections.hugo.noPostsYet.b: . Publish one from the composer and it will show up here.
// i18n settings.connections.hugo.draft: Draft
// i18n settings.connections.hugo.opening: Opening…
// i18n settings.connections.hugo.edit: Edit
// i18n settings.connections.hugo.reading2: Reading…
// i18n settings.connections.hugo.loadMoreTitles: Load more titles
// i18n settings.connections.hugo.titlesHint: Titles and dates are read one file at a time, so only the newest are loaded up front.
// i18n settings.connections.hugo.needsToken: Your repository details are saved, but the token is gone — either it aged out under the retention policy, or these settings were imported from another browser. Paste a token to publish again.
// i18n settings.connections.hugo.githubTokenLabel: GitHub token
// i18n settings.connections.hugo.tokenPlaceholder: github_pat_…
// i18n settings.connections.hugo.repositoryLabel: Repository
// i18n settings.connections.hugo.repositoryPlaceholder: you/your-blog
// i18n settings.connections.hugo.repositoryHint: Or paste the repository's address from your browser.
// i18n settings.connections.hugo.branchLabel: Branch
// i18n settings.connections.hugo.branchPlaceholder: main
// i18n settings.connections.hugo.branchHint: The branch your site is built from.
// i18n settings.connections.hugo.postsFolderLabel: Posts folder
// i18n settings.connections.hugo.postsFolderPlaceholder: content/posts
// i18n settings.connections.hugo.postsFolderHint.a: Where your posts live in the repository. Some themes use
// i18n settings.connections.hugo.postsFolderHint.or: or
// i18n settings.connections.hugo.siteAddressLabel: Site address
// i18n settings.connections.hugo.optional: (optional)
// i18n settings.connections.hugo.siteAddressPlaceholder: https://you.github.io/your-blog/
// i18n settings.connections.hugo.siteAddressHint: Used to link to a published post. Without it, posts link to the file on GitHub.
// i18n settings.connections.hugo.checking: Checking…
// i18n settings.connections.hugo.saveAndCheck: Save and check repository
// i18n settings.connections.hugo.fromFilenameTitle: Read from the file name — this {{post}} own title and date have not been loaded yet.
// i18n settings.connections.hugo.fromFilename: · from file name
// i18n settings.connections.hugo.error.invalidRepo: Enter your repository as owner/name, or paste its GitHub address.
// i18n settings.connections.hugo.error.checkSiteAddress: Check the site address.
// i18n settings.connections.hugo.notice.connectedWithPosts.one: Connected. Found {{count}} post in {{path}}. Hugo is now a target in the composer.
// i18n settings.connections.hugo.notice.connectedWithPosts.other: Connected. Found {{count}} posts in {{path}}. Hugo is now a target in the composer.
// i18n settings.connections.hugo.notice.connectedEmpty: Connected. {{path}} is empty — your first post will be the first file in it.
// i18n settings.connections.hugo.warning.notHugo: We couldn't find a Hugo config file at the root of this repository. Publishing will still commit your posts, but check this is the right repo.
// i18n settings.connections.hugo.error.connectFailed: Couldn't reach GitHub.
// i18n settings.connections.hugo.error.openPostFailed: Could not open that post for editing.
// i18n settings.connections.hugo.error.feedFindFailed: Could not reach your site to find its feed.
// i18n settings.connections.hugo.notice.feedRemoved: Removed your blog from your feeds. Your posts are untouched.

/** Settings → Connections → Blog (Hugo). */
@Component({
  selector: 'app-connection-hugo',
  imports: [DatePipe, FormsModule, RouterLink, StorageBadge, TranslocoPipe],
  templateUrl: './connection-hugo.html',
  styleUrls: ['../connection-page.css', './connection-hugo.css'],
})
export class ConnectionHugo implements OnInit {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  protected readonly settings = inject(HugoSettings);
  protected readonly posts = inject(HugoPosts);
  private readonly bridge = inject(VaultBridge);
  private readonly validate = inject(HugoValidate);
  private readonly github = inject(GitHubSession);
  private readonly hugoEdit = inject(HugoEditSession);
  private readonly drafts = inject(Drafts).forCurrentAccount();
  private readonly diagnostics = inject(PageDiagnostics);
  private readonly prefs = inject(ClientPrefs);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  /** The row whose file is being fetched, so only that row shows a spinner. */
  protected readonly opening = signal<string | null>(null);
  protected readonly openError = signal<string | null>(null);

  protected readonly feed = inject(HugoFeed);
  protected readonly feedBusy = signal(false);
  protected readonly feedNotice = signal<string | null>(null);
  protected readonly feedError = signal<string | null>(null);

  protected readonly token = signal('');
  protected readonly repoInput = signal('');
  protected readonly branch = signal('main');
  protected readonly contentPath = signal(DEFAULT_CONTENT_PATH);
  protected readonly siteUrl = signal('');
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  /** Set when the repo connected but does not look like a Hugo site. */
  protected readonly warning = signal<string | null>(null);

  protected readonly scopeDetail = CONNECTION_SCOPE_COPY.account.detail;
  protected readonly expiryLabel = expiryLabel;

  /**
   * Where this credential lives, for the badge.
   *
   * Reads the connector's own facts rather than the vault's state: a locked
   * vault is not a locked credential. See `storage-badge.ts`.
   */
  protected where() {
    return credentialLocation(this.bridge.syncs(HUGO_KEY), this.settings.needsFetch());
  }
  protected readonly canSubmit = computed(
    () => !!this.token().trim() && !!this.repoInput().trim() && !this.busy(),
  );

  /**
   * The repo half without the token half — the state a machine is in after
   * importing settings. Publishing is impossible until a token is pasted, and
   * saying so beats rendering an empty form that looks like a fresh setup.
   */
  protected readonly needsToken = computed(
    () => this.settings.repo() !== null && this.settings.token() === null,
  );

  ngOnInit(): void {
    this.settings.enforceLifetime();
    const repo = this.settings.repo();
    if (repo) {
      this.repoInput.set(`${repo.owner}/${repo.repo}`);
      this.branch.set(repo.branch);
      this.contentPath.set(repo.contentPath);
      this.siteUrl.set(repo.siteUrl ?? '');
      if (this.settings.connected()) {
        void this.posts.load();
      }
      return;
    }
    // A convenience, never a dependency: if the read-only GitHub connector is
    // linked we know the likely owner, so the user types one word instead of two.
    const login = this.github.user()?.login;
    if (login) {
      this.repoInput.set(`${login}/`);
    }
  }

  async connect(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.error.set(null);
    this.notice.set(null);
    this.warning.set(null);

    const parsed = parseRepoInput(this.repoInput());
    if (!parsed) {
      this.error.set(this.transloco.translate('settings.connections.hugo.error.invalidRepo'));
      return;
    }
    let siteUrl: string | null;
    try {
      siteUrl = normalizeSiteUrl(this.siteUrl());
    } catch (error: unknown) {
      this.diagnostics.warn('Hugo', 'user:invalid-site-url', {
        reason: error instanceof Error ? error.message : 'invalid',
      });
      this.error.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate('settings.connections.hugo.error.checkSiteAddress'),
      );
      return;
    }

    const candidate = {
      ...parsed,
      branch: this.branch().trim() || 'main',
      contentPath: this.contentPath().trim() || DEFAULT_CONTENT_PATH,
      siteUrl,
      includeInProfile: this.settings.includeInProfile(),
    };

    this.busy.set(true);
    try {
      const result = await this.validate.check(this.token(), candidate);
      if (!result.ok) {
        this.error.set(result.problem);
        return;
      }
      this.settings.connect(this.token(), candidate);
      this.token.set('');
      this.notice.set(
        result.postCount
          ? this.transloco.translate(
              result.postCount === 1
                ? 'settings.connections.hugo.notice.connectedWithPosts.one'
                : 'settings.connections.hugo.notice.connectedWithPosts.other',
              { count: result.postCount, path: candidate.contentPath },
            )
          : this.transloco.translate('settings.connections.hugo.notice.connectedEmpty', {
              path: candidate.contentPath,
            }),
      );
      void this.posts.load();
      if (!result.looksLikeHugo) {
        this.warning.set(this.transloco.translate('settings.connections.hugo.warning.notHugo'));
      }
    } catch (error: unknown) {
      this.diagnostics.error('Hugo', 'connect:error', error);
      this.error.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate('settings.connections.hugo.error.connectFailed'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  setProfileFeed(include: boolean): void {
    this.settings.setIncludeInProfile(include);
  }

  setPosse(enabled: boolean): void {
    this.settings.setPosse(enabled);
  }

  /**
   * Open a post in the composer.
   *
   * Two handoffs are parked, not one. The text rides in the existing
   * `Drafts.handoff()` slot — the same mechanism "Edit for post" uses from
   * /drafts and /pastes — because the composer already knows how to drain that
   * on seed. The git half (path, sha, delimiter style, original date, unknown
   * front-matter keys) rides in {@link HugoEditSession}, because none of it
   * belongs in a `DraftSnapshot` that every other target shares.
   *
   * The file is re-read here rather than reusing the list's cached parse: an
   * edit needs the *current* sha to write back with, and this read is the last
   * chance to notice the file changed since the list was drawn.
   */
  async edit(row: HugoPostRow): Promise<void> {
    if (this.opening()) {
      return;
    }
    this.opening.set(row.path);
    this.openError.set(null);
    try {
      const { parsed, sha } = await this.posts.open(row.path);
      const title = parsed.title?.trim() || row.title;
      this.hugoEdit.start({
        path: row.path,
        sha,
        format: parsed.format,
        date: parsed.date,
        extraLines: parsed.extraLines,
        originalTitle: title,
      });
      this.drafts.handoff({
        segments: [parsed.body],
        spoilerText: title,
        sensitive: false,
        visibility: this.prefs.defaultVisibility(),
        poll: null,
        target: 'hugo',
      });
      await this.router.navigate(['/home']);
    } catch (error: unknown) {
      this.diagnostics.error('Hugo', 'open-post:error', error);
      this.openError.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate('settings.connections.hugo.error.openPostFailed'),
      );
    } finally {
      this.opening.set(null);
    }
  }

  /**
   * Find the site's feed and subscribe to it.
   *
   * The blog becomes an ordinary RSS subscription — it counts against the feed
   * limit, and it can be disabled or removed from the Feeds page like any
   * other. That is correct: it *is* a feed. Subscribed state is derived from
   * the subscription list rather than stored here, so removing it there is
   * reflected here immediately instead of the two disagreeing.
   */
  async subscribeFeed(): Promise<void> {
    if (this.feedBusy()) {
      return;
    }
    this.feedBusy.set(true);
    this.feedNotice.set(null);
    this.feedError.set(null);
    try {
      const result = await this.feed.subscribe();
      (result.ok ? this.feedNotice : this.feedError).set(result.message);
    } catch (error: unknown) {
      this.diagnostics.error('Hugo', 'feed-subscribe:error', error);
      this.feedError.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate('settings.connections.hugo.error.feedFindFailed'),
      );
    } finally {
      this.feedBusy.set(false);
    }
  }

  unsubscribeFeed(): void {
    this.feed.unsubscribe();
    this.feedError.set(null);
    this.feedNotice.set(this.transloco.translate('settings.connections.hugo.notice.feedRemoved'));
  }

  refresh(): void {
    void this.posts.load();
  }

  showMore(): void {
    void this.posts.hydrate();
  }

  disconnect(): void {
    this.settings.disconnect();
    this.posts.reset();
    this.token.set('');
    this.notice.set(null);
    this.error.set(null);
    this.warning.set(null);
  }
}
