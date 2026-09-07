import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CorsProxySettings } from '../cors-proxy/cors-proxy-settings';
import { PageDiagnostics } from '../../page-diagnostics';
import { RssAddFeed } from './rss-add-feed';
import { RssStarterKit } from './rss-starter-kits';
import { RssSubscriptions } from './rss-subscriptions';

/** What installing one kit did, per feed. */
export interface KitInstallReport {
  kitSlug: string;
  added: number;
  alreadySubscribed: number;
  skippedForLimit: number;
  failed: { title: string; reason: string }[];
  total: number;
}

/** Live progress while a kit installs, for the button's own label. */
export interface KitInstallProgress {
  kitSlug: string;
  done: number;
  total: number;
}

/**
 * Subscribe to every feed in a starter kit, in one click.
 *
 * ## Why this fetches instead of just writing subscriptions
 *
 * `RssSubscriptions.adoptAll` would write all N rows instantly, and the sprint
 * doc originally suggested it. It is the wrong tool here: it records
 * subscriptions without proving any of them can actually be read, and **most
 * feeds worth putting in a starter kit send no `Access-Control-Allow-Origin`**
 * (checked by hand when the kit list was built: 15 of 19). A browser cannot
 * fetch those directly. Adopting blind would hand a brand-new user a rail full
 * of feeds that all fail on first read — the worst possible first impression,
 * and precisely the "people won't evaluate the feature" problem the kits exist
 * to solve.
 *
 * So each feed goes through {@link RssAddFeed}, the same validate-by-fetching
 * path the manual add uses, including the proxy fallback: try direct, and on
 * failure retry through the CORS proxy (adopting an entitled-but-unconfigured
 * Mawkingbird proxy first, exactly as the add-feed dialog learned to do). A feed
 * is only recorded once a fetch has actually worked, and `useProxy` is recorded
 * only when the proxy is what worked.
 *
 * ## Sequential, not parallel
 *
 * Same reasoning as the OPML importer: a burst of simultaneous cross-origin
 * fetches is what free CORS proxies rate-limit, which would fail feeds that are
 * fine. A kit is at most six feeds, so the wait is short either way.
 */
@Injectable({ providedIn: 'root' })
export class RssStarterKitInstall {
  private addFeed = inject(RssAddFeed);
  private subs = inject(RssSubscriptions);
  private proxySettings = inject(CorsProxySettings);
  private diagnostics = inject(PageDiagnostics);

  /** The kit currently installing, or null. Also gates the buttons. */
  readonly progress = signal<KitInstallProgress | null>(null);

  /** The last install's outcome, for the summary line. */
  readonly report = signal<KitInstallReport | null>(null);

  /** Whether every feed in a kit is already subscribed. */
  installed(kit: RssStarterKit): boolean {
    return kit.feeds.every((feed) => this.subs.has(feed.url));
  }

  /** How many of a kit's feeds are not yet subscribed. */
  remaining(kit: RssStarterKit): number {
    return kit.feeds.filter((feed) => !this.subs.has(feed.url)).length;
  }

  async install(kit: RssStarterKit): Promise<KitInstallReport> {
    const report: KitInstallReport = {
      kitSlug: kit.slug,
      added: 0,
      alreadySubscribed: 0,
      skippedForLimit: 0,
      failed: [],
      total: kit.feeds.length,
    };
    this.report.set(null);
    this.progress.set({ kitSlug: kit.slug, done: 0, total: kit.feeds.length });
    this.diagnostics.info('RSS', 'starter-kit:install-start', {
      kit: kit.slug,
      feeds: kit.feeds.length,
    });

    for (const feed of kit.feeds) {
      if (this.subs.has(feed.url)) {
        report.alreadySubscribed += 1;
      } else if (this.subs.remaining() === 0) {
        // Keep counting rather than breaking, so the report can say how many
        // were left behind by the ceiling instead of just stopping quietly.
        report.skippedForLimit += 1;
      } else {
        await this.installOne(feed.url, feed.title, kit.folder, report);
      }
      this.progress.update((p) => (p ? { ...p, done: p.done + 1 } : p));
    }

    this.progress.set(null);
    this.report.set(report);
    this.diagnostics.info('RSS', 'starter-kit:install-done', {
      kit: kit.slug,
      added: report.added,
      failed: report.failed.length,
      skippedForLimit: report.skippedForLimit,
    });
    return report;
  }

  /**
   * One feed: direct first, then through the proxy.
   *
   * Mirrors the OPML importer's retry rather than the manual add's: the user
   * asked for a whole kit and is not sitting there able to press a per-feed
   * "try the proxy" button, so making a feed work silently is what was asked
   * for.
   */
  private async installOne(
    url: string,
    title: string,
    folder: string,
    report: KitInstallReport,
  ): Promise<void> {
    // Adopt an entitled-but-unconfigured proxy before the first attempt needs
    // it — a Plus subscriber should never see a kit half-fail on CORS for a
    // proxy they are already paying for.
    if (this.proxySettings.missingEntitledProxy()) {
      this.proxySettings.adoptSupporterProxy();
    }
    const attempts = this.proxySettings.usable() ? [false, true] : [false];
    for (const useProxy of attempts) {
      try {
        await firstValueFrom(this.addFeed.add(url, useProxy, folder));
        report.added += 1;
        return;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        // Only the last attempt's failure is worth reporting to the user.
        if (useProxy || attempts.length === 1) {
          report.failed.push({ title, reason });
          this.diagnostics.warn('RSS', 'starter-kit:feed-failed', {
            viaProxy: useProxy,
            reason,
          });
        }
      }
    }
  }
}
