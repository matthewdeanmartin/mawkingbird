import { TranslocoPipe } from '@jsverse/transloco';
import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CorsProxy } from '../../../../providers/cors-proxy/cors-proxy';
import { CorsProxyEntry } from '../../../../providers/cors-proxy/cors-proxy-catalog';
import { ProxyConsent } from '../../../../providers/proxy-consent-store';
import { TwitterConsentDialog } from '../../../../providers/twitter/twitter-consent-dialog/twitter-consent-dialog';
import { Account } from '../../../../models';
import {
  TwitterApi,
  TwitterBalance,
  stripAt,
  timelinePagesRemaining,
} from '../../../../providers/twitter/twitter-api';
import {
  TwitterFollow,
  TwitterFollows,
  TWITTER_FOLLOW_COMFORTABLE,
  TWITTER_FOLLOW_LIMIT,
} from '../../../../providers/twitter/twitter-follows';
import {
  TwitterReachability,
  TwitterReachabilityResult,
} from '../../../../providers/twitter/twitter-reachability';
import { TwitterFeed } from '../../../../providers/twitter/twitter-feed';
import {
  DEFAULT_INACTIVE_DAYS,
  parseHandles,
  TwitterImport,
} from '../../../../providers/twitter/twitter-import';
import { TwitterPacer } from '../../../../providers/twitter/twitter-pacer';
import { TwitterSettings } from '../../../../providers/twitter/twitter-settings';
import { TwitterUsage } from '../../../../providers/twitter/twitter-usage';
import {
  availableTwitterSources,
  TwitterSourceEntry,
  TwitterSourceId,
} from '../../../../providers/twitter/twitter-source';
import { CONNECTION_SCOPE_COPY } from '../connection-catalog';
import { expiryLabel } from '../expiry-label';
import { credentialLocation, StorageBadge } from '../storage-badge';
import { VaultBridge } from '../../../../providers/vault/vault-bridge';
import { PageDiagnostics } from '../../../../page-diagnostics';

/** The registry base this page's credentials are stored under. */
const TWITTER_KEY = 'mockingbird_twitter_keys';
import { Terminology } from '../../../../terminology';

/**
 * Settings → Connections → Twitter.
 *
 * ## The flow this page has to walk someone through
 *
 * Connecting this is genuinely harder than any other connector here, because it
 * needs *two* third parties: the data service, and a CORS proxy to reach it.
 * Presenting that as one wall of configuration would lose most people, so the
 * page is staged, and each stage only appears once the previous one is done:
 *
 * 1. **Paste a key.** The only step that is just typing.
 * 2. **Test it.** The direct attempt runs and fails — visibly. This is the point
 *    of the whole design: the user *sees* that the service refuses browsers
 *    rather than being told, so the proxy request that follows is something they
 *    understood before agreeing to it.
 * 3. **Set up a proxy**, if they have not. The test names this as the next step.
 * 4. **Consent**, with the disclosure that names the operator and the concrete
 *    risk.
 * 5. **Test again**, which now succeeds. Only then is this "connected".
 *
 * ## Connected means verified, not "key pasted"
 *
 * Same rule as the link shortener page, and it matters more here: a valid key is
 * genuinely useless without a working header-forwarding proxy, so storing one
 * and showing a green tick would be a lie in the *normal* case rather than an
 * edge case.
 */
// i18n settings.connections.twitter.refreshOldest.one: Refresh oldest {{count}} ({{count}} request, ~{{duration}})
// i18n settings.connections.twitter.refreshOldest.other: Refresh oldest {{count}} ({{count}} requests, ~{{duration}})
// i18n settings.connections.twitter.refreshAll.one: Refresh all ({{count}} request, ~{{duration}})
// i18n settings.connections.twitter.refreshAll.other: Refresh all ({{count}} requests, ~{{duration}})
// i18n settings.connections.twitter.followPasted.one: Follow {{count}} account
// i18n settings.connections.twitter.followPasted.other: Follow {{count}} accounts
// i18n settings.connections.twitter.importSummary.one: <strong>{{keeping}}</strong> to import · {{skipped}} skipped · {{requests}} request spent
// i18n settings.connections.twitter.importSummary.other: <strong>{{keeping}}</strong> to import · {{skipped}} skipped · {{requests}} requests spent
// i18n settings.connections.twitter.importAccounts.one: Import {{count}} account
// i18n settings.connections.twitter.importAccounts.other: Import {{count}} accounts

// i18n settings.connections.twitter.active: Active
// i18n settings.connections.twitter.apiKey: API key
// i18n settings.connections.twitter.back: ‹ All connections
// i18n settings.connections.twitter.cancel: Cancel
// i18n settings.connections.twitter.checkBalance: Check balance
// i18n settings.connections.twitter.checking: Checking…
// i18n settings.connections.twitter.credentialWarning: This API key is stored in this browser's localStorage, because Mawkingbird has no server to keep it on. The key spends credits you have paid for, so use one you can rotate, and only on a device you trust. You can revoke it on the provider's own site at any time.
// i18n settings.connections.twitter.disconnect: Disconnect
// i18n settings.connections.twitter.follows.atMax.a: You are following
// i18n settings.connections.twitter.follows.atMax.b: accounts, the maximum. Remove one to add another.
// i18n settings.connections.twitter.follows.confirm: Is this the right account?
// i18n settings.connections.twitter.follows.followHandle: Follow &#64;
// i18n settings.connections.twitter.follows.followers: followers ·
// i18n settings.connections.twitter.follows.accountSummary: {{followers}} followers · {{posts}} {{postsWord}}
// i18n settings.connections.twitter.follows.handleLabel: Twitter handle
// i18n settings.connections.twitter.follows.intro.a: Following stores the handle in this browser so their posts show up on your Feeds page. It is not a follow on Twitter — nobody is notified. Up to
// i18n settings.connections.twitter.follows.intro.b: accounts.
// i18n settings.connections.twitter.follows.lookUp: Look up (1 request)
// i18n settings.connections.twitter.follows.lookingUp: Looking up…
// i18n settings.connections.twitter.follows.setupFirst: Finish the setup above first. Once the connection works you can follow Twitter accounts here.
// i18n settings.connections.twitter.follows.slowRefresh.a: You follow
// i18n settings.connections.twitter.follows.slowRefresh.b: accounts. Refreshing them all takes a while — requests go one at a time to stay under your CORS proxy's rate limit — so expect a full refresh to run for a minute or more.
// i18n settings.connections.twitter.follows.title: Accounts you follow
// i18n settings.connections.twitter.follows.viewOnTwitter: View on Twitter ↗
// i18n settings.connections.twitter.getKeyFrom: Get an API key from
// i18n settings.connections.twitter.honesty.followMeaning: "Follow" here means a subscription stored in this browser. It is not a follow on Twitter, and nobody on Twitter is notified.
// i18n settings.connections.twitter.honesty.intro: This connector is more work to set up than the others, and it is fair to know why before you start.
// i18n settings.connections.twitter.honesty.noFreeApi.body: , so Mawkingbird reads through a third-party service that resells public Twitter data. You bring your own key and pay them per request.
// i18n settings.connections.twitter.honesty.noFreeApi.lead: Twitter has no free API
// i18n settings.connections.twitter.honesty.readOnly.body: You can read posts and follow accounts locally. You cannot like, repost or reply — those need a real Twitter login, which this app never asks for.
// i18n settings.connections.twitter.honesty.readOnly.lead: It is read-only.
// i18n settings.connections.twitter.honesty.refuseBrowsers.body: , so every request also has to go through a CORS proxy. You will see this happen when you press Test.
// i18n settings.connections.twitter.honesty.refuseBrowsers.lead: Those services refuse web browsers
// i18n settings.connections.twitter.honesty.title: Read this first
// i18n settings.connections.twitter.importer.allChecked: All checked
// i18n settings.connections.twitter.importer.checking.a: Checking
// i18n settings.connections.twitter.importer.checking.of: of
// i18n settings.connections.twitter.importer.checkingNote: Checking costs one request per account. How long that takes depends on your plan — the free tier allows one request every five seconds, paid plans are far quicker — so the estimate above adjusts as it runs. You can stop at any point and keep what has been checked so far.
// i18n settings.connections.twitter.importer.clear: Clear
// i18n settings.connections.twitter.importer.days: days
// i18n settings.connections.twitter.importer.fetch: Fetch list
// i18n settings.connections.twitter.importer.fetching: Fetching…
// i18n settings.connections.twitter.importer.include: Include
// i18n settings.connections.twitter.importer.intro: Enter a Twitter handle and pull in the accounts they follow. Nothing is followed until you press Import, so you can look at the list first. Fetching the list is effectively free — 200 accounts per request.
// i18n settings.connections.twitter.importer.lastPosted: Last posted
// i18n settings.connections.twitter.importer.skip: Skip
// i18n settings.connections.twitter.importer.skipDead.a: Skip dead accounts (
// i18n settings.connections.twitter.importer.skipDead.b: requests, ~
// i18n settings.connections.twitter.importer.skipSilent: Skip if silent for
// i18n settings.connections.twitter.importer.stop: Stop
// i18n settings.connections.twitter.importer.stopAfter: Stop after
// i18n settings.connections.twitter.importer.throttled: The service is currently throttling, so this has slowed down.
// i18n settings.connections.twitter.importer.whose: Whose follows?
// i18n settings.connections.twitter.intro: Read public posts from Twitter, so the people who never left don't drop out of your reading. Follow accounts by handle and their posts show up here — no Twitter account needed, and nothing you do here touches Twitter itself.
// i18n settings.connections.twitter.keyExpiry: It is removed from this browser on
// i18n settings.connections.twitter.keySaved: Key saved
// i18n settings.connections.twitter.keySavedNote: A key is saved. Paste a new one to replace it.
// i18n settings.connections.twitter.limits.countedNote: Counted per request, including retries. Mawkingbird records only how many — never which accounts you looked up.
// i18n settings.connections.twitter.limits.intro: The warning is advisory; the limit is enforced. The limit exists mainly to stop a bug or a stuck refresh from spending while you are not looking — set it as high as you like.
// i18n settings.connections.twitter.limits.reset: Reset counters
// i18n settings.connections.twitter.limits.save: Save limits
// i18n settings.connections.twitter.limits.stopAt: Stop at
// i18n settings.connections.twitter.limits.title: Change the daily limits
// i18n settings.connections.twitter.limits.warnAt: Warn at
// i18n settings.connections.twitter.nextStep: Next:
// i18n settings.connections.twitter.posts.clear: Clear saved posts (
// i18n settings.connections.twitter.posts.none: No saved posts
// i18n settings.connections.twitter.posts.note: Posts are saved on this device for a day so reopening Mawkingbird costs nothing. Refreshing is the only thing here that spends a request.
// i18n settings.connections.twitter.proxy.consented.a: You have agreed to send your
// i18n settings.connections.twitter.proxy.consented.b: key through it.
// i18n settings.connections.twitter.proxy.none.a: No CORS proxy is configured.
// i18n settings.connections.twitter.proxy.none.b: cannot be reached from a browser without one, so this connector will not work until you set one up.
// i18n settings.connections.twitter.proxy.notConsented: You have not yet agreed to send your API key through it.
// i18n settings.connections.twitter.proxy.openDashboard.a: Open the
// i18n settings.connections.twitter.proxy.openDashboard.b: dashboard ↗
// i18n settings.connections.twitter.proxy.setUp: Set up a CORS proxy →
// i18n settings.connections.twitter.proxy.stripsHeaders.a: does not forward custom headers, so it cannot carry an API key — requests through it arrive at
// i18n settings.connections.twitter.proxy.stripsHeaders.b: with no key, which looks exactly like a rejected key. Pick a different proxy under
// i18n settings.connections.twitter.proxy.title: CORS proxy
// i18n settings.connections.twitter.proxy.using: Using
// i18n settings.connections.twitter.proxy.withdraw: Withdraw consent
// i18n settings.connections.twitter.refresh.busy: Refreshing…
// i18n settings.connections.twitter.refresh.refreshing.a: Refreshing
// i18n settings.connections.twitter.refresh.refreshing.b: oldest…
// i18n settings.connections.twitter.refresh.upToDate: Everything is up to date
// i18n settings.connections.twitter.saveAndTest: Save and test
// i18n settings.connections.twitter.services: Services
// i18n settings.connections.twitter.spend.creditsLeft: credits left · about {{count}} refreshes
// i18n settings.connections.twitter.spend.hardLimit: You have reached today's limit of {{count}} requests. It resets at midnight, or you can raise it below.
// i18n settings.connections.twitter.spend.past.a: Past
// i18n settings.connections.twitter.spend.past.b: requests today. Nothing is blocked — this is just a heads-up that you are spending more than a usual day's reading.
// i18n settings.connections.twitter.spend.remaining: left before today's limit
// i18n settings.connections.twitter.spend.title: What this has cost
// i18n settings.connections.twitter.spend.today: requests today
// i18n settings.connections.twitter.spend.total: since you connected
// i18n settings.connections.twitter.testConnection: Test connection
// i18n settings.connections.twitter.testCost.a: Testing costs up to two requests against your
// i18n settings.connections.twitter.testCost.b: credits — one direct attempt (which usually fails before it reaches them, costing nothing) and one through your proxy.
// i18n settings.connections.twitter.testing: Testing…
// i18n settings.connections.twitter.title: 🐦 Twitter
// i18n settings.connections.twitter.workingOk: Set up and working. Add accounts to follow from the Feeds page.

// i18n settings.connections.twitter.balanceFree: Free — this is an account call, not a data one.
// i18n settings.connections.twitter.paste.title: Paste a list of accounts
// i18n settings.connections.twitter.paste.handles: Handles
// i18n settings.connections.twitter.importer.title: Import someone's following list

// i18n settings.connections.twitter.follows.show: Show
// i18n settings.connections.twitter.follows.unfollow: Unfollow
// i18n settings.connections.twitter.follows.empty: No accounts yet. Add the people you would miss if you stopped opening Twitter.
// i18n settings.connections.twitter.paste.readyToFollow: Ready to follow {{count}}: {{names}}
// i18n settings.connections.twitter.paste.hint: One per line, or separated by commas. The <code>&#64;</code> is optional, and profile links work too. Nothing is fetched — following is local and free, so a typo just shows up as an account that fails to load, and you can remove it.

@Component({
  selector: 'app-connection-twitter',
  imports: [
    DecimalPipe,
    FormsModule,
    RouterLink,
    TwitterConsentDialog,
    StorageBadge,
    TranslocoPipe,
  ],
  templateUrl: './connection-twitter.html',
  styleUrls: ['../connection-page.css', './connection-twitter.css'],
})
export class ConnectionTwitter implements OnInit {
  private diagnostics = inject(PageDiagnostics);
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  protected settings = inject(TwitterSettings);
  protected consent = inject(ProxyConsent);
  protected follows = inject(TwitterFollows);
  protected usage = inject(TwitterUsage);
  private bridge = inject(VaultBridge);
  private feed = inject(TwitterFeed);
  private proxy = inject(CorsProxy);
  private reachability = inject(TwitterReachability);
  private twitterApi = inject(TwitterApi);
  private pacer = inject(TwitterPacer);

  protected readonly followLimit = TWITTER_FOLLOW_LIMIT;
  protected readonly comfortableLimit = TWITTER_FOLLOW_COMFORTABLE;

  protected readonly sources = availableTwitterSources();
  protected readonly scopeDetail = CONNECTION_SCOPE_COPY.browser.detail;
  protected readonly expiryLabel = expiryLabel;

  /** Which source's setup form is open. Defaults to the active one. */
  protected readonly selected = signal<TwitterSourceId>(
    this.settings.activeId() ?? this.sources[0].id,
  );

  protected readonly entry = computed<TwitterSourceEntry>(
    () => this.sources.find((item) => item.id === this.selected()) ?? this.sources[0],
  );

  /** Draft key. Never prefilled from storage — a stored key is not readable back. */
  protected readonly keyDraft = signal('');

  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Set while the consent dialog is open. */
  protected readonly consentPrompt = signal<{
    source: TwitterSourceEntry;
    proxy: CorsProxyEntry;
  } | null>(null);

  /** The most recent reachability verdict, shown under the actions row. */
  protected readonly lastProbe = signal<TwitterReachabilityResult | null>(null);

  /** The proxy in play, for the page to name it. */
  protected readonly proxyEntry = computed(() => this.proxy.entry());

  /**
   * Whether the configured proxy can carry an API key.
   *
   * The single most valuable thing this page can tell someone. A proxy that
   * strips custom headers makes a perfectly good key look rejected, and the user
   * has no way to know — so it is called out *before* they waste a test on it.
   */
  protected readonly proxyStripsHeaders = computed(
    () => this.proxyEntry()?.forwardsCustomHeaders === false,
  );

  /** Whether the proxy needs the user's domain registered before it will answer. */
  protected readonly proxyNeedsRegistration = computed(
    () => this.proxyEntry()?.originAllowlist ?? null,
  );

  /** Has a key been stored for this source? */
  protected hasKey(id: TwitterSourceId): boolean {
    return this.settings.hasKey(id);
  }

  protected isActive(id: TwitterSourceId): boolean {
    return this.settings.activeId() === id;
  }

  /**
   * Whether this source is actually usable: key stored, proxy consented, and a
   * successful probe on record.
   *
   * Deliberately strict. Anything less has been observed to produce a green tick
   * next to a feature that fails on every use.
   */
  protected readonly working = computed(() => {
    const probe = this.lastProbe();
    return probe?.status === 'proxy' || probe?.status === 'direct';
  });

  /** What the user should do next, in one sentence. Drives the checklist. */
  protected readonly nextStep = computed<string | null>(() => {
    if (!this.settings.hasKey(this.entry().id)) {
      return 'Paste your API key below.';
    }
    if (this.settings.directReachability(this.entry().id) === 'untested') {
      return 'Press Test connection — the first attempt goes direct, and is expected to fail.';
    }
    if (!this.proxy.available()) {
      return 'Set up a CORS proxy, then test again.';
    }
    if (this.proxyStripsHeaders()) {
      return 'Your CORS proxy cannot carry API keys. Switch to one that can.';
    }
    if (!this.hasConsent()) {
      return 'Test again and accept the disclosure, so requests may use your proxy.';
    }
    return null;
  });

  /**
   * Apply the retention policy when this page is reached directly.
   *
   * The Connections hub governs the full set of connectors, but a deep link (or
   * a bookmark) never passes through it. This key spends money, so it should not
   * outlive the policy just because the user's route into the page skipped the
   * one component that enforces it.
   */
  ngOnInit(): void {
    this.settings.enforceLifetime();
    void this.syncStoredCount();
  }

  protected choose(id: TwitterSourceId): void {
    this.selected.set(id);
    this.keyDraft.set('');
    this.notice.set(null);
    this.error.set(null);
    // A verdict belongs to the source it was measured against.
    this.lastProbe.set(null);
  }

  /** Store the key and immediately test it. Saving without testing proves nothing. */
  protected async save(): Promise<void> {
    const entry = this.entry();
    const key = this.keyDraft().trim();
    if (!key) {
      this.error.set(`Paste your ${entry.label} API key first.`);
      return;
    }
    this.settings.setKey(entry.id, key);
    this.settings.activate(entry.id);
    this.keyDraft.set('');
    await this.test();
  }

  /**
   * Run the probe and interpret the verdict.
   *
   * Costs up to two billable requests — one direct, one proxied — which the
   * template states next to the button before it is pressed. The direct one
   * usually dies at the preflight and never reaches the service, so in practice
   * it is usually one.
   */
  protected async test(): Promise<void> {
    const entry = this.entry();
    if (!this.settings.hasKey(entry.id)) {
      this.error.set(`Paste your ${entry.label} API key first.`);
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const result = await firstValueFrom(this.reachability.probe());
      this.lastProbe.set(result);

      if (result.status === 'proxy' || result.status === 'direct') {
        this.notice.set(result.message);
        return;
      }
      if (result.status === 'needs-consent') {
        const proxy = this.proxy.entry();
        if (proxy) {
          this.consentPrompt.set({ source: entry, proxy });
          return;
        }
      }
      this.error.set(result.message);
    } finally {
      this.busy.set(false);
    }
  }

  /** The user accepted the disclosure: record it and retry, which should now work. */
  protected async acceptConsent(): Promise<void> {
    const prompt = this.consentPrompt();
    this.consentPrompt.set(null);
    if (!prompt) {
      return;
    }
    this.consent.grant(prompt.source.id, prompt.proxy.id);
    await this.test();
  }

  protected declineConsent(): void {
    const prompt = this.consentPrompt();
    this.consentPrompt.set(null);
    if (prompt) {
      this.error.set(
        `Nothing was sent through ${prompt.proxy.label}. Without a proxy, Twitter data cannot be read ` +
          `from a browser at all — so this connection stays off until you either consent or ` +
          `configure a proxy you trust.`,
      );
    }
  }

  protected hasConsent(): boolean {
    const proxy = this.proxy.entry();
    const active = this.settings.activeId();
    return proxy && active ? this.consent.granted(active, proxy.id) : false;
  }

  /** Withdraw consent, so the next request asks again. */
  protected revokeConsent(): void {
    const proxy = this.proxy.entry();
    const active = this.settings.activeId();
    if (proxy && active) {
      this.consent.revoke(active, proxy.id);
      this.lastProbe.set(null);
      this.notice.set('Consent withdrawn. You will be asked again next time.');
    }
  }

  // ---------------------------------------------------------------------------
  // Following accounts
  //
  // The point of the whole connector: keeping the handful of people who never
  // left X in your reading. Deliberately a *two-step* flow — look up, then
  // confirm — rather than one button that follows whatever was typed.
  //
  // A single button would be worse for two reasons. It bills a request for a
  // typo, and it gives no chance to notice that @nasa is not the account you
  // meant before it lands in your feed. Showing the profile first makes the
  // request buy something the user can actually check.
  // ---------------------------------------------------------------------------

  protected readonly handleDraft = signal('');
  /** The profile found by a lookup, awaiting confirmation. */
  protected readonly lookupResult = signal<Account | null>(null);
  protected readonly lookingUp = signal(false);
  protected readonly followError = signal<string | null>(null);
  protected readonly followNotice = signal<string | null>(null);

  /** Whether following is possible at all yet. */
  protected readonly canFollow = computed(
    () => this.settings.usable() && this.hasConsent() && !this.proxyStripsHeaders(),
  );

  /**
   * Look up a handle. Costs one request, which the button says.
   *
   * Failures are reported without storing anything: a handle that could not be
   * resolved is not followed, because a follow that cannot be fetched is a row
   * that will fail on every refresh.
   */
  protected async lookup(): Promise<void> {
    const handle = stripAt(this.handleDraft());
    if (!handle) {
      this.followError.set('Type a Twitter handle first, for example @NASA.');
      return;
    }
    if (this.follows.has(handle)) {
      this.followError.set(`You already follow @${handle}.`);
      return;
    }
    if (this.follows.atLimit()) {
      this.followError.set(
        `You can follow up to ${this.followLimit} Twitter accounts. Remove one to add another.`,
      );
      return;
    }

    this.lookingUp.set(true);
    this.followError.set(null);
    this.followNotice.set(null);
    this.lookupResult.set(null);
    try {
      this.lookupResult.set(await firstValueFrom(this.twitterApi.getProfile(handle)));
    } catch (error: unknown) {
      this.diagnostics.error('Twitter', 'profile-lookup:error', error);
      this.followError.set(
        error instanceof Error ? error.message : `Could not find @${handle} on Twitter.`,
      );
    } finally {
      this.lookingUp.set(false);
    }
  }

  /** Confirm the previewed profile. Costs nothing — the lookup already paid. */
  protected confirmFollow(): void {
    const account = this.lookupResult();
    if (!account) {
      return;
    }
    const error = this.follows.add({
      username: account.username,
      displayName: account.display_name,
      avatar: account.avatar,
      // providerRef carries the raw numeric id the adapter recorded; storing it
      // now means the first timeline fetch can use the faster by-id endpoint
      // and survives the account being renamed.
      userId: undefined,
    });
    if (error) {
      this.followError.set(error);
      return;
    }
    this.followNotice.set(`Following @${account.username}. Their posts are on the Feeds page.`);
    this.lookupResult.set(null);
    this.handleDraft.set('');
  }

  protected cancelLookup(): void {
    this.lookupResult.set(null);
    this.followError.set(null);
  }

  protected unfollow(username: string): void {
    this.follows.remove(username);
    this.followNotice.set(`Unfollowed @${username}.`);
  }

  protected toggleFollowEnabled(username: string, enabled: boolean): void {
    this.follows.setEnabled(username, enabled);
  }

  // ---------------------------------------------------------------------------
  // Spend
  // ---------------------------------------------------------------------------

  protected readonly softDraft = signal(this.usage.softLimit());
  protected readonly hardDraft = signal(this.usage.hardLimit());
  /** Which refresh is running, or null. Two buttons, one at a time. */
  protected readonly refreshing = signal<'all' | 'rotation' | null>(null);

  /**
   * How many accounts one rotation press refreshes.
   *
   * Twenty is a batch someone will actually wait for: roughly twenty seconds
   * through a proxy allowing 60 requests a minute, against three and a half
   * minutes for a full 200. Small enough to press casually, large enough to
   * move the feed on.
   */
  protected readonly rotationBatch = 20;
  protected readonly refreshResult = signal<{ message: string; stopped: boolean } | null>(null);

  /**
   * What "Refresh all" would cost right now.
   *
   * Recomputed from the cache rather than fixed at render, so pressing it twice
   * honestly reports zero the second time instead of repeating the first
   * estimate and implying a charge that will not happen.
   */
  protected readonly refreshCost = computed(() =>
    this.feed.estimateCost(this.follows.enabled().map((f) => f.username)),
  );

  /**
   * What a rotation press would cost — the batch size, or fewer if the list is
   * short. Zero when rotation would just be "refresh all", so the button hides
   * rather than offering the same thing twice.
   */
  protected readonly rotationCost = computed<number>(() => {
    const enabled = this.follows.enabled();
    // Only offered when it would do *less* than "Refresh all". Once few enough
    // accounts are stale, rotation and a full refresh are the same act, and
    // showing both would price the same work two different ways — which is
    // exactly what happened after one rotation press: "oldest 20" sat next to
    // "all 5" and looked like the more expensive option.
    const stale = this.feed.estimateCost(enabled.map((follow) => follow.username));
    return stale > this.rotationBatch ? this.rotationBatch : 0;
  });

  /**
   * Wall clock for a refresh, from the pacer's live interval.
   *
   * The honest number: with a paid data plan and a free proxy tier, the proxy
   * is the binding constraint, and the pacer discovers that by being refused.
   */
  private durationFor(requests: number): string {
    const seconds = Math.round((requests * this.pacer.delayMs()) / 1000);
    return seconds < 60 ? `${Math.max(1, seconds)} sec` : `${Math.round(seconds / 60)} min`;
  }

  protected readonly rotationDuration = computed(() => this.durationFor(this.rotationCost()));
  protected readonly refreshDuration = computed(() => this.durationFor(this.refreshCost()));

  /**
   * How many handles have posts saved on this device.
   *
   * A signal refreshed by hand rather than a computed: the count lives in
   * IndexedDB, which cannot be read synchronously, and it only changes on the
   * two actions below.
   */
  protected readonly storedCount = signal(0);

  /**
   * Credits left on the account, as the *service* reports them.
   *
   * Deliberately not derived from {@link TwitterUsage}, which counts requests
   * this browser made. That number cannot see spending from another device and
   * counts calls rather than the credits each one cost, so it answers a
   * different question. This is the one a reader means by "how much have I got
   * left".
   *
   * Fetched on demand rather than on load: it is free, but it still needs the
   * proxy, and a connector page that fires a request just by being opened is
   * the pattern this connector avoids everywhere else.
   */
  protected readonly balance = signal<TwitterBalance | null>(null);
  protected readonly balanceLoading = signal(false);
  protected readonly balanceError = signal<string | null>(null);

  /** Credits expressed as something actionable — see CREDITS_PER_TIMELINE_PAGE. */
  protected readonly pagesRemaining = computed(() =>
    timelinePagesRemaining(this.balance()?.total ?? 0),
  );

  protected async checkBalance(): Promise<void> {
    if (this.balanceLoading()) {
      return;
    }
    this.balanceLoading.set(true);
    this.balanceError.set(null);
    try {
      this.balance.set(await firstValueFrom(this.twitterApi.getBalance()));
      if (!this.balance()) {
        this.balanceError.set(
          'The service answered but did not report a balance. It may have changed its account API.',
        );
      }
    } catch (error: unknown) {
      this.diagnostics.error('Twitter', 'balance:error', error);
      this.balanceError.set(error instanceof Error ? error.message : 'Could not read the balance.');
    } finally {
      this.balanceLoading.set(false);
    }
  }

  // ------------------------------------------------------------- paste a list

  protected readonly pasteDraft = signal('');
  protected readonly pasteResult = signal<string | null>(null);

  /** Live preview of what the paste would follow, so it is checkable first. */
  protected readonly pastePreview = computed(() => parseHandles(this.pasteDraft()));

  /** First few handles, for a preview line that stays one line. */
  protected readonly pastePreviewLabel = computed(() => {
    const handles = this.pastePreview();
    const shown = handles.slice(0, 6).map((h) => '@' + h);
    return handles.length > shown.length
      ? `${shown.join(', ')} and ${handles.length - shown.length} more`
      : shown.join(', ');
  });

  protected followPasted(): void {
    const result = this.importer.followPasted(this.pasteDraft());
    const parts = [`Followed ${result.added}.`];
    if (result.already) {
      parts.push(`${result.already} already followed.`);
    }
    if (result.invalid) {
      // Say so rather than silently dropping: a line that did not look like a
      // handle is usually a paste that brought along a name or a stray word.
      parts.push(`${result.invalid} did not look like handles and were ignored.`);
    }
    if (result.capped) {
      parts.push(`${result.capped} did not fit under the ${TWITTER_FOLLOW_LIMIT} limit.`);
    }
    this.pasteResult.set(parts.join(' '));
    this.pasteDraft.set('');
  }

  // ------------------------------------------------------------- bulk import

  protected readonly importer = inject(TwitterImport);
  protected readonly importHandle = signal('');
  protected readonly importStopAfter = signal(TWITTER_FOLLOW_LIMIT);
  protected readonly importInactiveDays = signal(DEFAULT_INACTIVE_DAYS);
  protected readonly importResult = signal<string | null>(null);

  /**
   * Wall clock for the liveness pass, in whatever unit reads honestly.
   *
   * Minutes were hardcoded when the pace was: the free tier's one-request-per-
   * five-seconds made everything minutes. A paid plan finishes the same work in
   * seconds, and "~1 min" for a six-second job is a worse estimate than no
   * estimate. The pacer's live interval drives this, so it also updates if the
   * service starts throttling mid-run.
   */
  protected readonly importDuration = computed(() => {
    const seconds = this.importer.checkSeconds();
    if (seconds < 60) {
      return `${Math.max(1, seconds)} sec`;
    }
    return `${Math.round(seconds / 60)} min`;
  });

  protected async startImport(): Promise<void> {
    this.importResult.set(null);
    await this.importer.list(
      stripAt(this.importHandle()),
      Math.max(1, Math.min(this.importStopAfter(), TWITTER_FOLLOW_LIMIT)),
    );
  }

  protected async checkLiveness(): Promise<void> {
    this.importResult.set(null);
    await this.importer.checkLiveness(Math.max(1, this.importInactiveDays()));
  }

  protected applyImport(): void {
    const result = this.importer.apply();
    const parts = [`Imported ${result.added}.`];
    if (result.already) {
      parts.push(`${result.already} were already followed.`);
    }
    if (result.skipped) {
      parts.push(`${result.skipped} skipped.`);
    }
    if (result.capped) {
      // Say what was left out rather than reporting a complete import that
      // silently dropped people at the cap.
      parts.push(`${result.capped} did not fit under the ${TWITTER_FOLLOW_LIMIT} limit.`);
    }
    this.importResult.set(parts.join(' '));
    this.importer.reset();
    void this.syncStoredCount();
  }

  /** Forget every saved timeline. Costs nothing; spends nothing. */
  protected async clearCache(): Promise<void> {
    await this.feed.clear();
    await this.syncStoredCount();
    this.notice.set(
      'Saved posts cleared. The next visit to a followed account will spend one request.',
    );
  }

  private async syncStoredCount(): Promise<void> {
    this.storedCount.set(await this.feed.storedCount());
  }

  protected saveLimits(): void {
    this.usage.setLimits(Number(this.softDraft()), Number(this.hardDraft()));
    // Read back: setLimits clamps a soft limit above the hard one, and the form
    // should show what was actually stored rather than what was typed.
    this.softDraft.set(this.usage.softLimit());
    this.hardDraft.set(this.usage.hardLimit());
    this.notice.set('Daily limits updated.');
  }

  protected resetUsage(): void {
    this.usage.reset();
    this.notice.set('Request counters cleared. This does not refund anything already spent.');
  }

  /**
   * Refresh every enabled follow.
   *
   * The one genuinely expensive action on this page, so it states its cost on
   * the button and refuses outright when the daily limit could not cover it —
   * a fan-out that stops halfway has spent money for a partial answer nobody
   * can interpret.
   */
  protected refreshAll(): Promise<void> {
    return this.runRefresh('all', this.follows.enabled(), this.refreshCost());
  }

  /**
   * Refresh only the accounts that have gone longest without one.
   *
   * Rotation, and the answer to a large follow list. Refreshing everything is
   * mostly re-fetching accounts that were current a moment ago; refreshing the
   * stalest {@link rotationBatch} gets the feed most of the way fresh for a
   * fraction of the cost and the wait.
   *
   * Forced, unlike "Refresh all": these were chosen *because* they are the
   * oldest, so honouring the freshness TTL would be picking accounts and then
   * declining to fetch most of them.
   */
  protected refreshStalest(): Promise<void> {
    const targets = this.feed.stalest(this.follows.enabled(), this.rotationBatch);
    return this.runRefresh('rotation', targets, targets.length, true);
  }

  /**
   * Shared by both refresh buttons: check the daily limit, run sequentially,
   * report honestly.
   *
   * One path rather than two so the limit check and the "stopped early" message
   * cannot drift apart — the rotation button is the one people will press
   * often, and it is the one that must not quietly overspend.
   */
  private async runRefresh(
    mode: 'all' | 'rotation',
    targets: TwitterFollow[],
    cost: number,
    force = false,
  ): Promise<void> {
    if (!targets.length || this.refreshing()) {
      return;
    }
    if (cost > 0 && this.usage.check(cost) === 'hard-limit') {
      this.refreshResult.set({
        stopped: true,
        message:
          `Refreshing ${targets.length} ${targets.length === 1 ? 'account' : 'accounts'} needs ` +
          `${cost} requests, and only ${this.usage.remainingToday()} remain before today's limit. ` +
          'Raise the limit, or wait for midnight.',
      });
      return;
    }

    this.refreshing.set(mode);
    this.refreshResult.set(null);
    try {
      const result = await firstValueFrom(this.feed.refreshMany(targets, force));
      const parts = [`Loaded ${result.loaded} of ${targets.length}.`];
      if (result.failed.length) {
        parts.push(`Could not load: ${result.failed.map((u) => '@' + u).join(', ')}.`);
      }
      if (result.stopped) {
        parts.push(
          'Stopped early after a rate limit, rather than spending on requests that would also fail.',
        );
      }
      if (mode === 'rotation') {
        const left = Math.max(0, this.follows.enabled().length - targets.length);
        if (left) {
          parts.push(`${left} older ${left === 1 ? 'account' : 'accounts'} not refreshed yet.`);
        }
      }
      this.refreshResult.set({ stopped: result.stopped, message: parts.join(' ') });
      await this.syncStoredCount();
    } finally {
      this.refreshing.set(null);
    }
  }

  /** Forget this source entirely: key, probe verdict, and proxy consents. */
  protected forget(id: TwitterSourceId): void {
    this.settings.forget(id);
    this.consent.revokeAll(id);
    this.keyDraft.set('');
    this.lastProbe.set(null);
    this.notice.set('Disconnected. Your API key has been removed from this browser.');
    this.error.set(null);
  }

  /**
   * Where a provider's key lives, for the badge.
   *
   * Per provider, because this store is a keyed map: one vault address holds
   * every provider's key, and `needsFetch` lists exactly the ones this browser
   * is missing. Reads the connector's own facts rather than the vault's state —
   * a locked vault is not a locked credential. See `storage-badge.ts`.
   */
  protected where(id: TwitterSourceId) {
    return credentialLocation(
      this.bridge.syncs(TWITTER_KEY),
      this.settings.needsFetch().includes(id),
    );
  }
}
