import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RssFetch } from '../rss/rss-fetch';
import { RssSubscriptions } from '../rss/rss-subscriptions';
import { HugoSettings } from './hugo-settings';

/**
 * Subscribing to your own blog, which is an ordinary RSS feed and is treated as
 * one (roadmap decision 7).
 *
 * There is deliberately **no Hugo feed provider**: no entry in `ProviderId`, no
 * adapter, no merge code. The site's `index.xml` goes into `RssSubscriptions`
 * like any other feed and the existing RSS provider does the rest — which is
 * why this file is small and why the blog gets the `📡` badge and read-only
 * cards for free.
 *
 * The irony worth keeping in mind: *publishing* to Hugo needs no CORS proxy,
 * because `api.github.com` is CORS-open, while *reading the result back* might,
 * because the user's own site is not guaranteed to be. GitHub Pages sends
 * `access-control-allow-origin: *`; a custom domain behind a CDN may not.
 */

/** Hugo's default feed location, relative to the site root. */
const DEFAULT_FEED = 'index.xml';

/** Other names themes and `outputs` config commonly produce. */
const FALLBACK_FEEDS = ['feed.xml', 'rss.xml', 'atom.xml', 'index.rss'];

export interface FeedProbeResult {
  /** The feed that actually parsed, or null if none did. */
  url: string | null;
  /** How many items it held, for the "added N posts" confirmation. */
  itemCount: number;
  /** Why it failed, phrased for someone who is not thinking about CORS. */
  problem: string | null;
}

@Injectable({ providedIn: 'root' })
export class HugoFeed {
  private readonly settings = inject(HugoSettings);
  private readonly subs = inject(RssSubscriptions);
  private readonly fetch = inject(RssFetch);

  /** Whether the blog's feed is already in the user's subscriptions. */
  subscribed(): boolean {
    const url = this.settings.feedUrl();
    return !!url && this.subs.has(url);
  }

  /**
   * Find the site's feed by trying the conventional names in order.
   *
   * `index.xml` is Hugo's default and is right the overwhelming majority of the
   * time; the fallbacks cost a request each and only run when the previous name
   * failed. A site whose feed is somewhere else entirely is a manual add on the
   * Feeds page, which is why the failure message points there.
   */
  async probe(): Promise<FeedProbeResult> {
    const base = this.settings.siteUrl();
    if (!base) {
      return {
        url: null,
        itemCount: 0,
        problem: 'Add your site address above first, so we know where to look for the feed.',
      };
    }

    const candidates = [DEFAULT_FEED, ...FALLBACK_FEEDS].map((name) => resolve(base, name));
    let firstError: unknown = null;
    for (const url of candidates) {
      try {
        const feed = await firstValueFrom(this.fetch.fetchFeed(url, { useProxy: false }));
        // Remember which name won, so the profile feed and the subscribed check
        // both ask about the real URL rather than re-deriving the default.
        this.settings.setFeedUrl(url);
        return { url, itemCount: feed.items.length, problem: null };
      } catch (error: unknown) {
        firstError ??= error;
      }
    }
    return { url: null, itemCount: 0, problem: describeFeedFailure(base, firstError) };
  }

  /**
   * Probe, then subscribe.
   *
   * Returns a message to show either way — this is a button, and a button that
   * does nothing visible is indistinguishable from a broken one.
   */
  async subscribe(): Promise<{ ok: boolean; message: string }> {
    const probe = await this.probe();
    if (!probe.url) {
      return { ok: false, message: probe.problem ?? 'Could not find a feed for your site.' };
    }
    if (this.subs.has(probe.url)) {
      return { ok: true, message: 'Your blog is already in your feeds.' };
    }
    // The repo name is a better feed title than the URL, and matches what the
    // rest of the app shows for this blog.
    const title = this.settings.slug() ?? 'My blog';
    const error = this.subs.add(probe.url, title, false, probe.itemCount);
    if (error) {
      return { ok: false, message: error };
    }
    return {
      ok: true,
      message: probe.itemCount
        ? `Added your blog to your feeds — ${probe.itemCount} post${probe.itemCount === 1 ? '' : 's'} found.`
        : 'Added your blog to your feeds. It has no posts yet.',
    };
  }

  /** Remove the blog's feed, leaving every other subscription alone. */
  unsubscribe(): void {
    const url = this.settings.feedUrl();
    if (url) {
      this.subs.remove(url);
    }
  }
}

function resolve(base: string, name: string): string {
  return new URL(name, base.endsWith('/') ? base : `${base}/`).toString();
}

/**
 * Turn a feed failure into something the user can act on.
 *
 * The two cases are genuinely different and look identical from here without
 * this: a site that does not exist, and a site that exists but will not let a
 * browser on another origin read it. The second is the one that surprises
 * people, because the URL works perfectly when they paste it into a tab.
 */
function describeFeedFailure(siteUrl: string, error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 404) {
    return `We looked for a feed at ${siteUrl} and did not find one. If your theme puts it somewhere unusual, add the URL by hand on the RSS feeds page.`;
  }
  // status 0 is the browser refusing to show us a cross-origin failure, which
  // in practice means no CORS headers.
  if (status === 0 || status === undefined) {
    return `We reached ${siteUrl} but it does not allow other sites to read it from a browser. GitHub Pages allows this by default; a custom domain may need a header. You can also add the feed on the RSS feeds page and turn on the CORS proxy for it.`;
  }
  return `Your site returned HTTP ${status} when we asked for its feed.`;
}
