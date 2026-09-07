import { DatePipe } from '@angular/common';
import { Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FocusTrap } from '../a11y/focus-trap';
import { Auth } from '../auth';
import { PageDiagnostics } from '../page-diagnostics';
import { ProfileAccountKey } from '../providers/account/profile-account-key';
import { SupporterStatus } from '../providers/account/supporter-status';
import { FoundFeed } from '../providers/rss/friend-feed-cache';
import { DEFAULT_PROBE_CAP, FriendFeedScan, PROBE_CAPS } from '../providers/rss/friend-feed-scan';
import { opmlFilename } from '../providers/rss/opml';
import { RssAddFeed } from '../providers/rss/rss-add-feed';
import { RSS_SUBSCRIPTION_LIMIT_MAX, RssSubscriptions } from '../providers/rss/rss-subscriptions';
import { CorsProxy } from '../providers/cors-proxy/cors-proxy';
import { CorsProxySettings } from '../providers/cors-proxy/cors-proxy-settings';
import { firstValueFrom } from 'rxjs';

/**
 * "Find my friends' blogs": consent, progress, then the feeds.
 *
 * ## The three states are one thought
 *
 * Same shape as {@link EffectiveAudienceDialog}, and for the same reason: the
 * user is deciding whether the cost is worth it, watching it be spent, and then
 * reading what it bought. Splitting those across components would put the
 * estimate that justified the scan off-screen by the time it is running.
 *
 * ## Why the cost is quoted in sites, not accounts
 *
 * One profile carries up to four links, so "500 accounts" and "500 fetches" are
 * different numbers and only the second one is what gets spent. The control
 * therefore says *sites*, which is both the honest unit and the one the scanner
 * actually caps on.
 *
 * ## Silence about what was not found
 *
 * Friends with no links, and links with no feed, are never listed. On a large
 * following list that would be hundreds of rows saying nothing — and the point
 * of the dialog is the handful of blogs that *were* found. A single "checked N
 * sites" line explains the absence without enumerating it.
 */
// i18n friendFeeds.title: Find your friends’ blogs
// i18n friendFeeds.lead: People put their websites in their profile. This checks those links for a feed and collects whatever it finds into one file.
// i18n friendFeeds.plusTitle: Part of Mawkingbird Plus
// i18n friendFeeds.plusWhy: Checking hundreds of websites is the most expensive thing this app can do, so it is kept for supporters.
// i18n friendFeeds.plusSeePlans: See what Plus includes
// i18n friendFeeds.budgetLabel: Check up to
// i18n friendFeeds.budgetSites: {{count}} sites
// i18n friendFeeds.cost: Each site is one request, so this is up to <strong>{{count}}</strong> of them. Sites checked in an earlier run are free, and you can stop at any point.
// i18n friendFeeds.noProxy: Checking websites needs a CORS proxy. Set one up under Settings → Connections.
// i18n friendFeeds.start: Start checking
// i18n friendFeeds.cancel: Cancel
// i18n friendFeeds.close: Close
// i18n friendFeeds.stop: Stop and keep what was found
// i18n friendFeeds.walking: Reading the list of people you follow…
// i18n friendFeeds.walkingCount: {{count}} of about {{total}} accounts read · {{links}} websites to check
// i18n friendFeeds.walkingCountUnknown: {{count}} accounts read · {{links}} websites to check
// i18n friendFeeds.walkingSlow: Big following lists take a while — this reads them 80 at a time.
// i18n friendFeeds.runningHint: You can leave this open; closing it needs the Stop button.
// i18n friendFeeds.probing: Checking {{done}} of {{total}} sites · {{found}} feeds found
// i18n friendFeeds.reusedOne: {{count}} site was already checked in an earlier run
// i18n friendFeeds.reusedOther: {{count}} sites were already checked in earlier runs
// i18n friendFeeds.rateLimited: The CORS proxy asked us to slow down — waiting a moment before carrying on.
// i18n friendFeeds.failed: The scan could not finish.
// i18n friendFeeds.resultNone: No feeds found. None of the websites your friends link to publish one that could be followed.
// i18n friendFeeds.resultCount.one: <strong>{{count}}</strong> feed found
// i18n friendFeeds.resultCount.other: <strong>{{count}}</strong> feeds found
// i18n friendFeeds.checked: checked {{count}} sites
// i18n friendFeeds.partial: Stopped before the end, so there may be more to find. Run it again to carry on — sites already checked will not be checked twice.
// i18n friendFeeds.generatedAt: Generated {{when}}
// i18n friendFeeds.via: from {{handle}}
// i18n friendFeeds.follow: Follow
// i18n friendFeeds.checking: Checking…
// i18n friendFeeds.following: Following
// i18n friendFeeds.followAll: Follow all
// i18n friendFeeds.download: Download OPML
// i18n friendFeeds.rescan: Check again
// i18n friendFeeds.capReached: Added {{added}}. The other {{left}} would go over your {{limit}}-feed limit.
// i18n friendFeeds.raiseLimit: Raise the limit to {{limit}} and follow the rest
// i18n friendFeeds.raising: Following the rest…
// i18n friendFeeds.limitRaised: Limit raised to {{limit}}.
// i18n friendFeeds.followingAll: Following {{done}} of {{total}}…
// i18n friendFeeds.followFailed: {{count}} could not be read, even through the proxy. They are left unfollowed.
// i18n friendFeeds.signedOut: Sign in to check the people you follow.
@Component({
  selector: 'app-friend-feeds-dialog',
  imports: [DatePipe, FocusTrap, RouterLink, TranslocoPipe],
  templateUrl: './friend-feeds-dialog.html',
  styleUrl: './friend-feeds-dialog.css',
})
export class FriendFeedsDialog {
  private scan = inject(FriendFeedScan);
  private subs = inject(RssSubscriptions);
  private addFeed = inject(RssAddFeed);
  private proxy = inject(CorsProxy);
  private proxySettings = inject(CorsProxySettings);
  private accountKey = inject(ProfileAccountKey);
  private auth = inject(Auth);
  private diagnostics = inject(PageDiagnostics);
  protected supporter = inject(SupporterStatus);

  readonly closed = output<void>();

  protected readonly caps = PROBE_CAPS;
  protected readonly cap = signal<number>(DEFAULT_PROBE_CAP);

  protected readonly progress = this.scan.progress;
  protected readonly result = this.scan.result;
  protected readonly running = this.scan.running;
  protected readonly percent = this.scan.percent;

  /** Feed URLs subscribed to during this dialog, so rows can say "Following". */
  protected readonly justAdded = signal(new Set<string>());

  /**
   * Set when "Follow all" ran out of room under the subscription limit.
   *
   * Structured rather than a finished string so the template translates it:
   * a message assembled here would be English for everybody.
   */
  protected readonly capOverflow = signal<{
    added: number;
    left: number;
    limit: number;
  } | null>(null);

  /** A refusal from a single `add`, already worded by the service that made it. */
  protected readonly addError = signal<string | null>(null);

  /** The most recent failure text from {@link addWithProxyFallback}. */
  private lastAddError: string | null = null;

  /** The feed currently being fetched by a single Follow, if any. */
  protected readonly busy = signal<string | null>(null);

  /** True while Follow all is working through the list. */
  protected readonly followingAll = signal(false);

  /** How far Follow all has got — it fetches each feed, so it is not instant. */
  protected readonly followProgress = signal({ done: 0, total: 0 });

  /** Feeds Follow all could not read even through the proxy. */
  protected readonly followFailures = signal(0);

  /** Set once the limit has been raised from here, so the UI can confirm it. */
  protected readonly limitRaisedTo = signal<number | null>(null);

  /** The ceiling {@link raiseLimitAndContinue} would move to. */
  protected readonly limitNeeded = computed(() =>
    Math.min(
      this.subs.feeds().length + (this.capOverflow()?.left ?? 0),
      RSS_SUBSCRIPTION_LIMIT_MAX,
    ),
  );

  /** True before anything has been asked for — the consent screen. */
  protected readonly asking = computed(() => !this.progress() && !this.result());

  protected readonly failed = computed(() => this.progress()?.phase === 'failed');

  /** Whether a scan can run at all: it needs a proxy and an account to read. */
  protected readonly available = computed(() => this.scan.available());

  /**
   * The scan needs an account id to walk the following list of, and a key to
   * file the result under. `auth.account()` settles asynchronously after a cold
   * load, so this is a signal rather than a constructor read.
   */
  protected readonly me = computed(() => this.auth.account());
  protected readonly signedIn = computed(() => this.me() !== null);

  constructor() {
    // Reopening the dialog after a scan should show what was found rather than
    // asking again — the result is the expensive part and it is already paid
    // for. Loading is cheap and idempotent.
    void this.restore();
  }

  private async restore(): Promise<void> {
    const key = this.accountKey.current();
    if (key && !this.result()) {
      await this.scan.loadStored(key);
    }
  }

  protected setCap(value: string): void {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      this.cap.set(parsed);
    }
  }

  protected async start(): Promise<void> {
    const key = this.accountKey.current();
    const me = this.me();
    if (!key || !me) {
      return;
    }
    this.capOverflow.set(null);
    this.addError.set(null);
    // `following_count` is the progress bar's denominator. Without it the walk
    // has no total and the bar cannot move.
    await this.scan.scan(me.id, key, this.cap(), me.following_count ?? 0);
  }

  protected stop(): void {
    this.diagnostics.info('FriendFeedsDialog', 'user:stop', {
      probed: this.progress()?.probed ?? 0,
      found: this.progress()?.found ?? 0,
    });
    this.scan.stop();
  }

  /** Throw away the stored answer and ask again from scratch. */
  protected async rescan(): Promise<void> {
    const key = this.accountKey.current();
    if (!key) {
      return;
    }
    // Notable because it throws away the probe cache: the next scan pays full
    // price again, which is the one action here that costs real money.
    this.diagnostics.info('FriendFeedsDialog', 'user:forget-cache', {});
    await this.scan.forget(key);
  }

  protected isFollowing(feed: FoundFeed): boolean {
    return this.justAdded().has(feed.url) || this.subs.has(feed.url);
  }

  /**
   * Subscribe to one feed, proving it can actually be read first.
   *
   * ## Why this fetches rather than just writing a subscription
   *
   * A `<link rel=alternate>` is a *claim*. The scan found these on other
   * people's pages and never fetched the feeds themselves, so writing them
   * straight into the subscription list produces entries that look fine and
   * then fail on first read — which is exactly what happened: hundreds of
   * feeds, most of them unreadable, each needing to be found and fixed by hand.
   *
   * ## Why the proxy is not opt-in here
   *
   * Most personal blogs do not send CORS headers, so the direct fetch fails for
   * the majority of what this feature finds. Making the user opt in per feed
   * means answering the same question hundreds of times, and the question is a
   * strange one to ask: these are public feed URLs discovered on public web
   * pages, carrying no credential of any kind. There is nothing to leak.
   *
   * So: direct first — free, private, and works for the minority who send the
   * header — then the proxy. Same order as the starter-kit installer, and the
   * subscription records which route actually worked, so the reader does not
   * have to rediscover it.
   */
  protected async follow(feed: FoundFeed): Promise<void> {
    this.addError.set(null);
    this.busy.set(feed.url);
    try {
      const added = await this.addWithProxyFallback(feed);
      if (added) {
        this.justAdded.update((set) => new Set(set).add(feed.url));
      } else {
        this.addError.set(this.lastAddError ?? 'That feed could not be read.');
      }
    } finally {
      this.busy.set(null);
    }
  }

  /**
   * Try direct, then through the proxy. True when a subscription was made.
   *
   * Adopts the supporter proxy on the way if the account is entitled to one and
   * has never set it up — a paying user should not have to go and configure
   * something before a feature they paid for can work.
   */
  private async addWithProxyFallback(feed: FoundFeed): Promise<boolean> {
    this.lastAddError = null;
    for (const useProxy of [false, true]) {
      if (useProxy) {
        if (this.proxySettings.missingEntitledProxy()) {
          this.proxySettings.adoptSupporterProxy();
        }
        if (!this.proxy.available()) {
          break;
        }
      }
      try {
        await firstValueFrom(this.addFeed.add(feed.url, useProxy));
        return true;
      } catch (error) {
        this.lastAddError = error instanceof Error ? error.message : String(error);
        // At the subscription limit there is no point trying the proxy: the
        // refusal is about the list's size, not about reaching the feed.
        if (this.subs.remaining() <= 0) {
          break;
        }
      }
    }
    return false;
  }

  /**
   * Subscribe to everything found, up to the subscription limit.
   *
   * Fills to the ceiling and then says plainly how many were left and why,
   * rather than stopping at the first refusal or silently dropping the tail.
   * Someone who asked for all of them should get as many as they can have.
   */
  protected async followAll(): Promise<void> {
    if (this.followingAll()) {
      return;
    }
    const feeds = (this.result()?.feeds ?? []).filter((feed) => !this.isFollowing(feed));
    const added = new Set(this.justAdded());
    let count = 0;
    let blockedByLimit = 0;
    let unreadable = 0;

    this.addError.set(null);
    this.capOverflow.set(null);
    this.followFailures.set(0);
    this.followingAll.set(true);
    this.followProgress.set({ done: 0, total: feeds.length });

    try {
      for (const feed of feeds) {
        if (this.subs.remaining() <= 0) {
          blockedByLimit++;
          continue;
        }
        if (await this.addWithProxyFallback(feed)) {
          added.add(feed.url);
          count++;
        } else if (this.subs.remaining() <= 0) {
          blockedByLimit++;
        } else {
          unreadable++;
        }
        this.justAdded.set(new Set(added));
        this.followProgress.update((p) => ({ ...p, done: p.done + 1 }));
      }
    } finally {
      this.followingAll.set(false);
    }

    this.diagnostics.info('FriendFeedsDialog', 'user:follow-all', {
      added: count,
      blockedByLimit,
      unreadable,
    });
    this.justAdded.set(added);
    this.followFailures.set(unreadable);
    this.capOverflow.set(
      blockedByLimit > 0 ? { added: count, left: blockedByLimit, limit: this.subs.limit() } : null,
    );
  }

  /**
   * Raise the subscription limit far enough for what is left, then carry on.
   *
   * Hitting a ten-feed default after a scan that found hundreds is the exact
   * moment the number is wrong, and sending someone to another page to change
   * it — losing this screen and its results on the way — is a poor answer to a
   * question they have already implicitly answered by pressing Follow all.
   *
   * Raises to what this result actually needs rather than to the maximum: the
   * cap exists because long lists are slow to read, so the honest move is to
   * fit the list in hand, not to remove the ceiling.
   */
  protected async raiseLimitAndContinue(): Promise<void> {
    const needed = this.subs.feeds().length + (this.capOverflow()?.left ?? 0);
    const next = Math.min(needed, RSS_SUBSCRIPTION_LIMIT_MAX);
    this.subs.setLimit(next);
    this.diagnostics.info('FriendFeedsDialog', 'user:raise-limit', { limit: next });
    this.limitRaisedTo.set(next);
    await this.followAll();
  }

  /** Hand the OPML to the browser as a file. */
  protected download(): void {
    const opml = this.result()?.opml;
    if (!opml) {
      return;
    }
    const blob = new Blob([opml], { type: 'text/x-opml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = opmlFilename();
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Close, unless a scan is running.
   *
   * A stray click on the backdrop must not abandon a job the user is minutes
   * into and has paid proxy requests for. The scan itself survives — it is
   * root-provided and reopening shows it again — but a dialog that vanishes
   * mid-run reads as a crash, and the Stop button is right there for someone
   * who actually means it.
   *
   * The explicit Stop and Close buttons call {@link forceClose}, so this only
   * ever guards the accidental dismissals: backdrop click and Escape.
   */
  protected close(): void {
    if (this.running()) {
      return;
    }
    this.closed.emit();
  }

  /** Close on purpose, running or not. */
  protected forceClose(): void {
    // Worth a line when it happens mid-run: the scan keeps going in the
    // background, so a later "why is the proxy busy" question has an answer.
    if (this.running()) {
      this.diagnostics.info('FriendFeedsDialog', 'close:while-running', {});
    }
    this.closed.emit();
  }
}
