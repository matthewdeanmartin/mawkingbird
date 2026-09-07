import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CorsProxy } from '../cors-proxy/cors-proxy';
import { CorsProxyBatchFetch } from '../cors-proxy/cors-proxy-batch-fetch';
import { PageDiagnostics } from '../../page-diagnostics';
import { RssSubscriptions } from './rss-subscriptions';

/** A feed found on somebody's site, and how we got there. */
export interface DiscoveredFeed {
  /** The feed URL, absolute. */
  url: string;
  /** The feed's own title, from the `<link>` element, or the site's host. */
  title: string;
  /** The page the feed was declared on. */
  siteUrl: string;
  /** Handle of the followed account whose post linked here. */
  via: string;
  /**
   * The declared feed MIME type, when the page gave one.
   *
   * Carried so a caller can collapse the same feed published in two formats —
   * see `collapseFormats` in `feed-ranking.ts`.
   */
  type?: string;
}

/**
 * How many distinct sites one discovery run will probe.
 *
 * Each probe is a full cross-origin fetch of somebody's homepage through the
 * shared CORS proxy — the same budget article expansion spends. Ten is enough to
 * turn up something useful from a timeline and small enough that running this
 * cannot quietly become the most expensive thing the app does.
 */
const MAX_SITES_PER_RUN = 10;

/** Feed types worth following, in `<link rel="alternate">`. */
const FEED_TYPES = ['application/rss+xml', 'application/atom+xml', 'application/feed+json'];

/**
 * Reduce a URL to the site it belongs to.
 *
 * Someone links to an *article*; what we want is whether the *site* publishes a
 * feed. Probing the article URL would work for most blogs — a post page usually
 * carries the same `<link rel=alternate>` — but it means fetching a different
 * page per link to the same site and finding the same feed each time.
 */
function siteRootOf(link: string): string | null {
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    return `${url.protocol}//${url.host}/`;
  } catch {
    return null;
  }
}

/**
 * Find the feeds a page declares.
 *
 * Exported for testing: parsing is the part with edge cases, fetching is not.
 */
export function feedLinksIn(
  html: string,
  baseUrl: string,
): { url: string; title: string; type: string }[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: { url: string; title: string; type: string }[] = [];
  const seen = new Set<string>();

  for (const link of Array.from(doc.querySelectorAll('link[rel~="alternate"][href]'))) {
    const type = (link.getAttribute('type') ?? '').toLowerCase().trim();
    if (!FEED_TYPES.includes(type)) {
      continue;
    }
    const href = link.getAttribute('href')?.trim();
    if (!href) {
      continue;
    }
    let resolved: URL;
    try {
      // Feed hrefs are routinely relative ("/feed.xml"); resolve against the
      // page they were declared on, not against this app.
      resolved = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
      continue;
    }
    const url = resolved.toString();
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    out.push({
      url,
      title: link.getAttribute('title')?.trim() || resolved.host.replace(/^www\./, ''),
      // Carried through rather than discarded: two declarations of the same
      // content in different formats are a choice nobody should be asked to
      // make, and the format is what tells them apart. See `collapseFormats`.
      type,
    });
  }
  return out;
}

/**
 * Find RSS/Atom feeds on sites that people you follow have linked to.
 *
 * ## What this is, and what it deliberately is not
 *
 * It is: take links already on screen in your own timeline, reduce them to
 * sites, fetch each site's homepage through the CORS proxy, and read its
 * `<link rel="alternate">` declarations. Everything found is a *suggestion* —
 * nothing subscribes on the user's behalf, because a reading list somebody did
 * not choose is not a reading list.
 *
 * It is not general feed discovery ("paste any URL, find its feeds") — that is
 * {@link PasteResolve}, which handles the caching, the rate limiting and the
 * sites that declare twenty feeds. The two share {@link feedLinksIn} and differ
 * in what starts them: this one sweeps a timeline nobody curated, so it only
 * ever suggests; the resolver acts on a URL somebody deliberately pasted.
 *
 * ## Cost
 *
 * Every probe is a third-party fetch on the shared proxy — the same budget
 * article expansion draws on. Hence {@link MAX_SITES_PER_RUN}, one probe per
 * *site* rather than per link, and a run that only ever happens because someone
 * pressed a button. Nothing here runs in the background.
 */
@Injectable({ providedIn: 'root' })
export class RssDiscovery {
  private proxy = inject(CorsProxy);
  private batchFetch = inject(CorsProxyBatchFetch);
  private subs = inject(RssSubscriptions);
  private diagnostics = inject(PageDiagnostics);

  readonly running = signal(false);
  readonly found = signal<DiscoveredFeed[]>([]);
  /** How many sites the last run looked at, for the "checked N sites" line. */
  readonly checked = signal(0);
  /** Set when a run could not happen at all. */
  readonly error = signal<string | null>(null);

  /** Whether discovery can run — it needs a proxy, like every outbound fetch. */
  available(): boolean {
    return this.proxy.available();
  }

  /**
   * Probe the sites behind `links` and collect whatever feeds they declare.
   *
   * `links` comes from the caller's own timeline (see `outboundLinks`), paired
   * with the handle that posted each one so a suggestion can say where it came
   * from — "because @alice linked it" is the whole reason to trust a suggestion
   * from this list over a random feed directory.
   */
  async discover(links: readonly { url: string; via: string }[]): Promise<DiscoveredFeed[]> {
    if (this.running()) {
      return this.found();
    }
    if (!this.available()) {
      this.error.set('Finding feeds needs a CORS proxy.');
      return [];
    }

    this.running.set(true);
    this.error.set(null);
    this.found.set([]);

    try {
      // One probe per site, keeping the first handle that linked it: ten links
      // to the same blog is one fetch, and the attribution stays truthful.
      const sites = new Map<string, string>();
      for (const link of links) {
        const root = siteRootOf(link.url);
        if (root && !sites.has(root)) {
          sites.set(root, link.via);
        }
      }
      const targets = [...sites.entries()].slice(0, MAX_SITES_PER_RUN);
      this.checked.set(targets.length);

      const results: DiscoveredFeed[] = [];
      const probed = await Promise.all(
        targets.map(async ([siteUrl, via]) => ({ siteUrl, via, feeds: await this.probe(siteUrl) })),
      );
      for (const { siteUrl, via, feeds } of probed) {
        for (const feed of feeds) {
          // Already subscribed is not a suggestion.
          if (this.subs.has(feed.url) || results.some((r) => r.url === feed.url)) {
            continue;
          }
          results.push({ ...feed, siteUrl, via });
        }
      }

      this.found.set(results);
      this.diagnostics.info('RSS', 'discovery:done', {
        sites: targets.length,
        found: results.length,
      });
      return results;
    } finally {
      this.running.set(false);
    }
  }

  /** Fetch one site and read its feed declarations. Failures are not fatal. */
  private async probe(siteUrl: string): Promise<{ url: string; title: string; type: string }[]> {
    try {
      const html = await firstValueFrom(this.batchFetch.text(siteUrl, 'article'));
      return feedLinksIn(html ?? '', siteUrl);
    } catch (err) {
      // A site that will not load is the common case, not an exception: it is
      // paywalled, or blocks the proxy, or simply is not there any more.
      this.diagnostics.info('RSS', 'discovery:site-failed', {
        site: siteUrl,
        reason: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }
}
