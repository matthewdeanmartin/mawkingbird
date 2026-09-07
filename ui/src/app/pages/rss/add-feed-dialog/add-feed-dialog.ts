import { Component, computed, inject, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FocusTrap } from '../../../a11y/focus-trap';
import { Api } from '../../../api';
import { Auth } from '../../../auth';
import { Account } from '../../../models';
import { CorsProxySettings } from '../../../providers/cors-proxy/cors-proxy-settings';
import { FeedCandidate } from '../../../providers/rss/feed-ranking';
import { PasteResolve, PasteResolution } from '../../../providers/rss/paste-resolve';
import { RssAddFeed } from '../../../providers/rss/rss-add-feed';
import { PageDiagnostics } from '../../../page-diagnostics';

// i18n pages.rss.addFeed.pasteLink: Paste a link
// i18n pages.rss.addFeed.intro: A site, a feed, or a fediverse handle — paste whatever you have and Mawkingbird works out the rest.
// i18n pages.rss.addFeed.tryAgainVia: Try again via {{proxy}}
// i18n pages.rss.addFeed.didYouMean: Did you mean
// i18n pages.rss.addFeed.question: ?
// i18n pages.rss.addFeed.followingDone: Following ✓
// i18n pages.rss.addFeed.following: Following…
// i18n pages.rss.addFeed.follow: Follow
// i18n pages.rss.addFeed.viewProfile: View their profile
// i18n pages.rss.addFeed.followingNeedsAccount: Following needs an account. You can subscribe to their posts by RSS instead:
// i18n pages.rss.addFeed.subscribeByRss: Subscribe by RSS
// i18n pages.rss.addFeed.or: Or
// i18n pages.rss.addFeed.subscribeByRssInstead: subscribe by RSS instead
// i18n pages.rss.addFeed.ifRatherRead: , if you would rather read them than follow them.
// i18n pages.rss.addFeed.sitePublishesFeeds: That site publishes {{count}} feeds. This one looks right:
// i18n pages.rss.cancel: Cancel
// i18n pages.rss.addFeed.checking: Checking…
// i18n pages.rss.addFeed.subscribe: Subscribe
// i18n pages.rss.addFeed.looking: Looking…
// i18n pages.rss.addFeed.continue: Continue
// i18n pages.rss.addFeed.couldNotFollow: Could not follow that account.

/**
 * "Paste a link" — the front door to subscribing.
 *
 * ## Why this stopped being an "add a feed URL" box
 *
 * It used to demand a feed URL, which meant the only way to subscribe to a site
 * was to open view-source and find its `<link rel="alternate">` by hand. That is
 * a step only a developer can perform, and it gated every RSS feature in the app
 * behind being one.
 *
 * So the box now takes *anything* — a site, a feed, a fediverse handle — and
 * {@link PasteResolve} works out what it is. The subscribe path underneath is
 * unchanged: {@link RssAddFeed} is still the only thing that writes a
 * subscription, and still validates by fetching.
 *
 * ## What is deliberately preserved
 *
 * The entitled-proxy auto-adopt on a failed direct fetch. A Plus subscriber who
 * has never configured a proxy is entitled to one, and making them find Settings
 * before a feed they just pasted can work is the exact problem
 * `adoptSupporterProxy` exists to solve. It survived the rewrite of everything
 * around it.
 */
@Component({
  selector: 'app-add-feed-dialog',
  imports: [FormsModule, FocusTrap, TranslocoPipe],
  templateUrl: './add-feed-dialog.html',
  styleUrl: './add-feed-dialog.css',
})
export class AddFeedDialog {
  private addFeed = inject(RssAddFeed);
  private resolver = inject(PasteResolve);
  private api = inject(Api);
  private router = inject(Router);
  private auth = inject(Auth);
  protected proxySettings = inject(CorsProxySettings);
  private diagnostics = inject(PageDiagnostics);
  private transloco = inject(TranslocoService);

  readonly closed = output<void>();
  /** Emitted once a feed is actually subscribed, so the host can refresh. */
  readonly added = output<void>();

  protected input = signal('');
  protected resolving = signal(false);
  protected adding = signal(false);
  protected error = signal<string | null>(null);
  protected retryable = signal<string | null>(null);

  /** What the last resolve turned up; null before anything has been pasted. */
  protected resolution = signal<PasteResolution | null>(null);
  /** Which candidate the user has picked, when a site offered several. */
  protected chosen = signal<string | null>(null);
  protected following = signal(false);
  protected followed = signal(false);
  /** Set when the user asks for RSS on an account, instead of following. */
  protected accountRssWanted = signal(false);

  /** Anonymous visitors have no token to follow with, so RSS is their only path. */
  protected anonymous = computed(() => this.auth.isAnonymous);

  protected busy = computed(() => this.resolving() || this.adding() || this.following());

  protected feeds = computed(() => {
    const result = this.resolution();
    return result?.kind === 'feeds' ? result.feeds : [];
  });

  protected account = computed(() => {
    const result = this.resolution();
    return result?.kind === 'account' ? result.account : null;
  });

  /** The candidate that will be subscribed if the user just presses the button. */
  protected pick = computed<FeedCandidate | null>(() => {
    const list = this.feeds();
    if (!list.length) {
      return null;
    }
    const picked = this.chosen();
    return list.find((f) => f.url === picked) ?? list[0];
  });

  async resolve(): Promise<void> {
    const value = this.input().trim();
    if (!value || this.busy()) {
      return;
    }
    this.reset();
    this.resolving.set(true);
    try {
      const result = await this.resolver.resolve(value);
      this.resolution.set(result);
      if (result.kind === 'none') {
        this.error.set(result.reason);
      }
      // One clear feed and nothing to choose between: subscribing right away is
      // what the user asked for by pressing the button. Several candidates get
      // shown instead, because picking is a decision only they can make.
      if (result.kind === 'feeds' && result.feeds.length === 1) {
        await this.subscribe();
      }
    } finally {
      this.resolving.set(false);
    }
  }

  /** Take a suggested scheme ("did you mean https://example.com?"). */
  async acceptSuggestion(url: string): Promise<void> {
    this.input.set(url);
    await this.resolve();
  }

  choose(url: string): void {
    this.chosen.set(url);
  }

  async subscribe(): Promise<void> {
    const target = this.pick();
    const result = this.resolution();
    if (!target || this.adding()) {
      return;
    }
    const needsProxy = result?.kind === 'feeds' && result.needsProxy;
    await this.attempt(target.url, needsProxy);
  }

  /** Subscribe to an account's RSS feed instead of following it. */
  async subscribeToAccountRss(): Promise<void> {
    const result = this.resolution();
    if (result?.kind !== 'account') {
      return;
    }
    this.accountRssWanted.set(true);
    await this.attempt(result.rssUrl, false);
  }

  async follow(): Promise<void> {
    const account = this.account();
    if (!account || this.following()) {
      return;
    }
    this.following.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.follow(account.id));
      this.diagnostics.info('RSS', 'paste:followed', { acct: account.acct });
      this.followed.set(true);
    } catch (err) {
      this.error.set(
        err instanceof Error
          ? err.message
          : this.transloco.translate('pages.rss.addFeed.couldNotFollow'),
      );
    } finally {
      this.following.set(false);
    }
  }

  viewAccount(account: Account): void {
    this.closed.emit();
    void this.router.navigate(['/accounts', account.id]);
  }

  retryViaProxy(): void {
    const url = this.retryable();
    if (url) {
      void this.attempt(url, true);
    }
  }

  private reset(): void {
    this.error.set(null);
    this.retryable.set(null);
    this.resolution.set(null);
    this.chosen.set(null);
    this.followed.set(false);
    this.accountRssWanted.set(false);
  }

  private async attempt(url: string, useProxy: boolean): Promise<void> {
    this.adding.set(true);
    this.error.set(null);
    this.retryable.set(null);

    try {
      await firstValueFrom(this.addFeed.add(url, useProxy));
      this.diagnostics.info('RSS', 'add-feed-dialog:success', { viaProxy: useProxy });
      this.added.emit();
      this.closed.emit();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.diagnostics.warn('RSS', 'add-feed-dialog:error', { message });
      // A direct fetch just failed — almost always CORS. A Plus subscriber who
      // has never configured a proxy is entitled to one right now, and asking
      // them to find Settings -> Connections -> CORS proxy before a feed they
      // just tried to add can work is exactly the "still being rate-limited at
      // the free tier until they stumble across the right screen" problem
      // CorsProxySettings.adoptSupporterProxy already exists to fix elsewhere.
      // Adopt it here too, then retry immediately and silently.
      if (!useProxy && this.proxySettings.missingEntitledProxy()) {
        this.proxySettings.adoptSupporterProxy();
        await this.attempt(url, true);
        return;
      }
      this.error.set(message);
      if (!useProxy && this.proxySettings.usable()) {
        this.retryable.set(url);
      }
    } finally {
      this.adding.set(false);
    }
  }
}
