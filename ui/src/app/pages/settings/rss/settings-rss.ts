import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ClientPrefs, RSS_CACHE_TTL_OPTIONS } from '../../../client-prefs';
import { CorsProxySettings } from '../../../providers/cors-proxy/cors-proxy-settings';
import { RssAddFeed } from '../../../providers/rss/rss-add-feed';
import { RssCache } from '../../../providers/rss/rss-cache';
import { RssFetch } from '../../../providers/rss/rss-fetch';
import {
  folderPathToName,
  RSS_SUBSCRIPTION_LIMIT,
  RSS_SUBSCRIPTION_LIMIT_MAX,
  RssFeedSub,
  RssSubscriptions,
} from '../../../providers/rss/rss-subscriptions';
import { buildOpml, opmlFilename, parseOpml } from '../../../providers/rss/opml';
import { FriendFeedsDialog } from '../../../friend-feeds-dialog/friend-feeds-dialog';
import { PageDiagnostics } from '../../../page-diagnostics';
import { RssReadState } from '../../../providers/rss/rss-read-state';

/**
 * What one OPML import did, reported in full.
 *
 * Every feed in the file lands in exactly one of these buckets, and they are
 * kept apart on purpose: "already subscribed" is a no-op, "over your limit" is
 * fixed by raising a number, and "failed" usually means CORS and may need a
 * proxy. Collapsing them into one "23 of 40 imported" would leave the user with
 * no idea which lever to pull.
 */
interface ImportReport {
  added: number;
  alreadySubscribed: number;
  skippedForLimit: number;
  failed: { url: string; reason: string }[];
  total: number;
}

/**
 * Settings → RSS feeds.
 *
 * This used to be a section on Connections, which was never quite right: a
 * connection is *one account* somewhere else, and RSS is a list of many feeds
 * carrying no credential at all. It has its own list management, its own
 * failure mode (CORS), and its own cap — so it gets its own page.
 *
 * The CORS proxy appears here only as a summary and a per-feed switch. Choosing
 * and authenticating a proxy is a browser-wide decision and lives on
 * Connections; what belongs on this page is the one question that is actually
 * about feeds — "should *this* feed go through it?".
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.rss.title: 📡 RSS feeds
// i18n settings.rss.intro: Any RSS or Atom feed becomes posts in your home feed, read-only, with an "Open original" link. No account, no credential — a feed URL is all it takes.
// i18n settings.rss.cors: Mawkingbird has no server, so a feed only works if its site allows browser (CORS) access. Plenty don't. You'll know right away when you add one, because adding it fetches it.
// i18n settings.rss.saved: {{count}} of {{limit}} feeds saved in this browser.
// i18n settings.rss.proxy.before: Feeds that block browser access can be routed through
// i18n settings.rss.proxy.after: , per feed, below.
// i18n settings.rss.proxy.incomplete: Your CORS proxy is selected but not finished — it still needs a key or a valid address.
// i18n settings.rss.proxy.none: No CORS proxy is set up. Without one, feeds that block browser access can't be read at all.
// i18n settings.rss.proxy.change: Change
// i18n settings.rss.proxy.setUp: Set one up
// i18n settings.rss.scrollRead: Mark items read as I scroll past them
// i18n settings.rss.scrollRead.hint: Off by default. Opening an item always marks it read regardless of this setting; this only covers items you scrolled past without opening, and waits until one has been on screen for a moment so a fast scroll to the bottom does not mark everything on the way.
// i18n settings.rss.readOne: {{count}} item marked read, {{starred}} starred.
// i18n settings.rss.readOther: {{count}} items marked read, {{starred}} starred.
// i18n settings.rss.clearHistory: Clear reading history
// i18n settings.rss.reuseFor: Reuse a fetched feed for
// i18n settings.rss.cache.hint: Feeds are re-read by every view that shows them. Without a cache that is a request per visit — enough to exhaust a free CORS proxy's rate limit just by reading. Cached feeds are kept in this browser's IndexedDB, which has room for feeds far too large for ordinary settings storage.
// i18n settings.rss.cachedOne: {{count}} feed cached in this browser.
// i18n settings.rss.cachedOther: {{count}} feeds cached in this browser.
// i18n settings.rss.cachedNone: Nothing cached yet.
// i18n settings.rss.clearCache: Clear cache
// i18n settings.rss.feedUrlPlaceholder: https://example.com/feed.xml
// i18n settings.rss.checking: Checking…
// i18n settings.rss.addFeed: Add feed
// i18n settings.rss.retryVia: Try again via {{proxy}}
// i18n settings.rss.proxyWarning: The proxy will see this feed's address and its contents.
// i18n settings.rss.opml: 📄 Import & export (OPML)
// i18n settings.rss.opml.hint: OPML is the subscription-list format every feed reader speaks. Export yours to move it somewhere else, or import a file from a reader you are leaving. Folders in an imported file are flattened — Mawkingbird has no folders yet.
// i18n settings.rss.maxFeeds: Maximum feeds
// i18n settings.rss.save: Save
// i18n settings.rss.maxFeeds.hint: We suggest no more than {{recommended}}. Every feed is re-read by every view that shows them, so a long list opens slower and uses more of a free CORS proxy's quota — but it is your reading list, so set it where you want it. Lowering this never deletes a feed you already have.
// i18n settings.rss.exportOpml: Export OPML
// i18n settings.rss.friendFeeds: Find friends’ blogs
// i18n settings.rss.importing: Importing…
// i18n settings.rss.importOpml: Import OPML
// i18n settings.rss.import.progress: Checking feed {{done}} of {{total}} — each one is fetched to prove this browser can actually read it.
// i18n settings.rss.import.added: Added {{added}} of {{total}} feeds.
// i18n settings.rss.import.already: {{count}} were already in your list.
// i18n settings.rss.import.overLimit: {{count}} went past your limit of {{limit}}. Raise it above and import the same file again to pick up the rest.
// i18n settings.rss.import.failed: {{count}} could not be read
// i18n settings.rss.import.corsHint.before: — usually this is CORS, which a
// i18n settings.rss.import.corsHint.link: CORS proxy
// i18n settings.rss.import.corsHint.after:  can fix.
// i18n settings.rss.import.whichFailed: Which ones failed
// i18n settings.rss.viaProxy: via proxy
// i18n settings.rss.viaProxy.title: Fetched through your CORS proxy
// i18n settings.rss.fetchThrough: Fetch through {{proxy}}
// i18n settings.rss.proxy: Proxy
// i18n settings.rss.open: Open
// i18n settings.rss.open.title: Open this feed's page
// i18n settings.rss.refresh: Refresh
// i18n settings.rss.refreshing: Refreshing…
// i18n settings.rss.refresh.title: Fetch this feed again now
// i18n settings.rss.remove: Remove
// i18n settings.rss.noFeeds: No feeds yet.
@Component({
  selector: 'app-settings-rss',
  imports: [FormsModule, FriendFeedsDialog, RouterLink, TranslocoPipe],
  templateUrl: './settings-rss.html',
  styleUrl: './settings-rss.css',
})
export class SettingsRss implements OnInit {
  /**
   * The friends'-blogs dialog. Mounted only while open — it pulls in the scan
   * machinery, which most visits to this page have no use for.
   */
  protected readonly showFriendFeeds = signal(false);

  private readonly diagnostics = inject(PageDiagnostics);
  private rssFetch = inject(RssFetch);
  private addFeedService = inject(RssAddFeed);
  protected subs = inject(RssSubscriptions);
  protected proxySettings = inject(CorsProxySettings);
  protected prefs = inject(ClientPrefs);
  protected readState = inject(RssReadState);
  private cache = inject(RssCache);

  protected readonly ttlOptions = RSS_CACHE_TTL_OPTIONS;
  /** URL of the feed currently being force-refreshed, if any. */
  protected refreshing = signal<string | null>(null);
  /** How much is cached, or null before the count comes back. */
  private transloco = inject(TranslocoService);

  protected cacheSummary = signal<string | null>(null);

  protected feedUrl = signal('');
  protected adding = signal(false);
  protected error = signal<string | null>(null);
  /**
   * The URL of a feed that just failed to add, when a proxy is configured and
   * might succeed where the direct fetch didn't.
   *
   * This is what keeps "no automatic fallback" from becoming a dead end: the
   * app never retries on its own, but once it knows a direct fetch failed it
   * can offer the one-click retry instead of leaving the user to guess.
   */
  protected retryable = signal<string | null>(null);

  /** The configured proxy's name, or null when there is none. */
  protected readonly proxyLabel = computed(() =>
    this.proxySettings.usable() ? (this.proxySettings.chosen()?.label ?? null) : null,
  );

  /**
   * True when a proxy is selected but not usable — a key-requiring proxy with
   * no key, or a custom one with a broken template. Worth saying out loud,
   * because the per-feed switches below are inert until it is fixed.
   */
  protected readonly proxyIncomplete = computed(
    () => this.proxySettings.currentId() !== null && !this.proxySettings.usable(),
  );

  ngOnInit(): void {
    // Not in the constructor: the lookup is asynchronous, and resolving it
    // after a spec's TestBed has been torn down triggers "cannot configure the
    // test module" in whatever test runs next.
    void this.loadCacheSummary();
  }

  addFeed(): void {
    const url = this.feedUrl().trim();
    if (!url || this.adding()) {
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      this.error.set('Feed URLs start with http:// or https://.');
      return;
    }
    if (this.subs.has(url)) {
      this.error.set("You're already subscribed to that feed.");
      return;
    }
    this.attemptAdd(url, false);
  }

  /** Retry the feed that just failed, this time through the proxy. */
  retryViaProxy(): void {
    const url = this.retryable();
    if (url) {
      this.attemptAdd(url, true);
    }
  }

  /**
   * Fetch a candidate feed and subscribe if it parses.
   *
   * Validating by actually fetching proves reachability, CORS and
   * parseability, and captures the title — and when `useProxy` is set it also
   * proves the proxy works for this feed before the subscription records that
   * it should be used.
   */
  private attemptAdd(url: string, useProxy: boolean): void {
    this.adding.set(true);
    this.error.set(null);
    this.retryable.set(null);

    this.addFeedService.add(url, useProxy).subscribe({
      next: () => {
        this.feedUrl.set('');
        this.adding.set(false);
      },
      error: (err: Error) => {
        // A Plus subscriber with no proxy configured yet is entitled to one
        // right now — adopt it and retry silently rather than surfacing a
        // failure for something their subscription should have prevented.
        // See add-feed-dialog.ts for the fuller rationale.
        if (!useProxy && this.proxySettings.missingEntitledProxy()) {
          this.proxySettings.adoptSupporterProxy();
          this.attemptAdd(url, true);
          return;
        }
        this.error.set(err.message);
        // Only offer the retry when it could plausibly help: a direct attempt
        // that failed, with a working proxy standing by.
        if (!useProxy && this.proxySettings.usable()) {
          this.retryable.set(url);
        }
        this.adding.set(false);
      },
    });
  }

  // --- OPML import / export ---

  protected readonly recommendedLimit = RSS_SUBSCRIPTION_LIMIT;
  protected readonly maxLimit = RSS_SUBSCRIPTION_LIMIT_MAX;

  /** Live progress while an import runs, or null when one isn't. */
  protected importProgress = signal<{ done: number; total: number } | null>(null);
  /** What the last import did, once it has finished. */
  protected importReport = signal<ImportReport | null>(null);
  protected importError = signal<string | null>(null);

  /** The limit box. Kept as a string so a half-typed value doesn't fight back. */
  protected limitDraft = signal(String(this.subs.limit()));

  /** Commit the typed limit. Invalid input snaps back to what is stored. */
  setLimit(): void {
    this.subs.setLimit(Number(this.limitDraft()));
    this.limitDraft.set(String(this.subs.limit()));
  }

  /** Download the current subscriptions as an OPML file. */
  openFriendFeeds(): void {
    this.showFriendFeeds.set(true);
  }

  exportOpml(): void {
    const blob = new Blob([buildOpml(this.subs.feeds())], {
      type: 'text/x-opml+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = opmlFilename();
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Import an OPML file, checking every feed as it goes.
   *
   * Each feed is fetched before it is subscribed, exactly as the add-feed form
   * does, because on this platform "is this a valid feed URL" and "can this
   * browser actually read it" are different questions and only the second one
   * matters. A file of forty feeds where twelve are CORS-blocked should say so
   * at import time rather than leaving twelve rows that silently render nothing.
   *
   * Sequential, not parallel: forty simultaneous cross-origin fetches is a
   * burst that free CORS proxies rate-limit outright, which would fail feeds
   * that are actually fine.
   *
   * Folders are preserved: each feed is filed under the folder path it sat in,
   * which is the organisation the person exporting the file already built and
   * the one thing an importer has no business inventing or discarding. Paths
   * deeper than `MAX_FOLDER_DEPTH` fold their tail into the last name rather
   * than losing it.
   */
  async importOpml(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset immediately, so picking the same file twice in a row still fires.
    input.value = '';
    if (!file || this.importProgress()) {
      return;
    }

    this.importError.set(null);
    this.importReport.set(null);

    let feeds;
    try {
      feeds = parseOpml(await file.text()).feeds;
    } catch (err) {
      this.diagnostics.error('RSS', 'opml:parse-error', err, { fileSize: file.size });
      this.importError.set((err as Error).message);
      return;
    }
    if (feeds.length === 0) {
      this.importError.set('That OPML file lists no feeds.');
      return;
    }

    const report: ImportReport = {
      added: 0,
      alreadySubscribed: 0,
      skippedForLimit: 0,
      failed: [],
      total: feeds.length,
    };
    this.importProgress.set({ done: 0, total: feeds.length });

    for (const feed of feeds) {
      if (this.subs.has(feed.url)) {
        report.alreadySubscribed += 1;
      } else if (this.subs.remaining() === 0) {
        // Everything from here on is over the ceiling. Keep counting rather
        // than breaking, so the report can say how many were left behind.
        report.skippedForLimit += 1;
      } else {
        await this.importOne(feed.url, folderPathToName(feed.folders), report);
      }
      this.importProgress.update((p) => (p ? { ...p, done: p.done + 1 } : p));
    }

    this.importProgress.set(null);
    this.importReport.set(report);
    void this.loadCacheSummary();
  }

  /**
   * Fetch one candidate and subscribe if it reads.
   *
   * Retries through the proxy when a direct fetch fails and a proxy is
   * available. That is the opposite of the *manual* add path, which never
   * retries on its own — and deliberately so: there, the user is watching one
   * feed and can press the button. Here they have handed over a file of forty
   * and asked for it to be dealt with, so silently making a feed work is what
   * was asked for. The subscription still records `useProxy` only when the
   * proxy is what actually worked.
   */
  private async importOne(
    url: string,
    folder: string | undefined,
    report: ImportReport,
  ): Promise<void> {
    for (const useProxy of this.proxySettings.usable() ? [false, true] : [false]) {
      try {
        const parsed = await firstValueFrom(this.rssFetch.fetchFeed(url, { useProxy }));
        const limitError = this.subs.add(url, parsed.title, useProxy, parsed.items.length, folder);
        if (limitError) {
          report.skippedForLimit += 1;
        } else {
          report.added += 1;
        }
        return;
      } catch (err) {
        // Only the last attempt's failure is worth reporting.
        if (useProxy || !this.proxySettings.usable()) {
          report.failed.push({ url, reason: (err as Error).message });
          this.diagnostics.warn('RSS', 'opml:feed-failed', {
            viaProxy: useProxy,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  remove(feed: RssFeedSub): void {
    this.subs.remove(feed.url);
    // Reclaim the cached copy too: an unsubscribed feed's megabytes have no
    // reason to keep sitting in IndexedDB.
    void this.cache.evict(feed.url).then(() => this.loadCacheSummary());
  }

  toggle(feed: RssFeedSub): void {
    this.subs.setEnabled(feed.url, !feed.enabled);
  }

  toggleProxy(feed: RssFeedSub): void {
    this.subs.setUseProxy(feed.url, feed.useProxy !== true);
  }

  /** Turn scroll-tracking on or off. */
  setScrollMarksRead(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.prefs.setRssScrollMarksRead(enabled);
    this.diagnostics.info('RSS', 'settings:scroll-marks-read', { enabled });
  }

  /** Forget every read and starred mark. Subscriptions are untouched. */
  clearReadState(): void {
    this.readState.clear();
    this.diagnostics.info('RSS', 'settings:clear-read-state', {});
  }

  /** The select hands back a string; the preference is a number of hours. */
  setTtl(hours: string | number): void {
    this.prefs.setRssCacheTtlHours(Number(hours));
  }

  /** Re-read one feed now, ignoring both the cache and any failure cooldown. */
  refresh(feed: RssFeedSub): void {
    if (this.refreshing()) {
      return;
    }
    this.refreshing.set(feed.url);
    this.error.set(null);
    this.rssFetch
      .fetchFeed(feed.url, { useProxy: feed.useProxy === true, forceRefresh: true })
      .subscribe({
        next: (parsed) => {
          this.subs.recordFetch(feed.url, parsed.title, parsed.items.length);
          this.refreshing.set(null);
          void this.loadCacheSummary();
        },
        error: (err: Error) => {
          this.error.set(err.message);
          this.refreshing.set(null);
        },
      });
  }

  async clearCache(): Promise<void> {
    await this.cache.clear();
    await this.loadCacheSummary();
  }

  /**
   * Count what's cached, for the line above the feed list.
   *
   * Deliberately a count and not a byte total: `entries()` would have to
   * deserialize every cached feed to measure it, which is exactly the work the
   * cache exists to avoid. The Observability page reports real IndexedDB usage.
   */
  private async loadCacheSummary(): Promise<void> {
    const entries = await this.cache.entries();
    const cached = entries.filter((entry) => entry.fetchedAt > 0).length;
    this.cacheSummary.set(
      cached
        ? this.transloco.translate<string>(
            cached === 1 ? 'settings.rss.cachedOne' : 'settings.rss.cachedOther',
            { count: cached },
          )
        : this.transloco.translate<string>('settings.rss.cachedNone'),
    );
  }
}
