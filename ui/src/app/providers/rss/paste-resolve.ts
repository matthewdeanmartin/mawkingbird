import { inject, Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../api';
import { Account } from '../../models';
import { PageDiagnostics } from '../../page-diagnostics';
import { CorsProxy } from '../cors-proxy/cors-proxy';
import { CorsProxyBatchFetch } from '../cors-proxy/cors-proxy-batch-fetch';
import { CorsProxySettings } from '../cors-proxy/cors-proxy-settings';
import { FeedCandidate, collapseFormats, rankFeeds } from './feed-ranking';
import { feedLinksIn } from './rss-discovery';
import { RssFetch } from './rss-fetch';

/**
 * What a pasted string turned out to be.
 *
 * `account` is deliberately first-class rather than a special case of `feeds`:
 * pasting a fediverse handle into a fediverse client should offer a *follow*,
 * and modelling that as "a feed we happen to render differently" is how it would
 * quietly degrade back into an RSS subscription.
 */
export type PasteResolution =
  | { kind: 'feeds'; feeds: FeedCandidate[]; siteUrl: string; needsProxy: boolean }
  | { kind: 'account'; account: Account; rssUrl: string }
  | { kind: 'suggestion'; url: string }
  /**
   * Nothing to subscribe to.
   *
   * `reached` says whether the site actually answered. For the paste box the
   * distinction is cosmetic — either way there is no feed to offer — but a bulk
   * caller must not cache "we never got through" as "this site has no feed":
   * see `friend-feed-scan.ts`, where a rate-limited run would otherwise mark
   * hundreds of friends as blogless, permanently.
   *
   * `rateLimited` narrows that further: the proxy answered 429, so the right
   * response is to wait rather than to keep asking. Surfaced here because this
   * is the only layer that sees the status code — below it the failure is an
   * empty body, and above it there is nothing left to distinguish.
   */
  | { kind: 'none'; reason: string; reached?: boolean; rateLimited?: boolean };

/** URL shapes that are probably already a feed, so try fetching one first. */
const FEEDISH = /(\.(xml|rss|atom)(\?|$))|(\/(feed|rss|atom|feeds)\/?(\?|$))/i;

/** `@user@host`, `user@host`, `https://host/@user`, `https://host/users/user`. */
const HANDLE_AT = /^@?([a-z0-9_.-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i;
const HANDLE_URL = /^https?:\/\/([a-z0-9.-]+)\/(?:@|users\/)([a-z0-9_.-]+)\/?$/i;
/**
 * `@localuser` — someone on this server.
 *
 * The leading `@` is required, which is what keeps this from swallowing every
 * bare word typed into the box: `@grace` is unambiguously a handle, where
 * `grace` is a search term, a typo, or a domain someone forgot to finish.
 */
const HANDLE_LOCAL = /^@([a-z0-9_.-]+)$/i;

/** A bare domain someone typed without a scheme: `example.com`. */
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/**
 * Work out what a pasted string is, and what can be done with it.
 *
 * ## Why this exists
 *
 * Finding a site's feed URL currently means opening view-source. That is a step
 * only a developer can perform, and it gates every RSS feature in the app behind
 * being a developer. This is the front door that removes it: one box, anything
 * in it, the app works out the rest.
 *
 * ## Cost discipline
 *
 * Each probe is a cross-origin fetch on the shared CORS-proxy budget — the same
 * one article expansion and friend-link discovery draw on. So: never on
 * keystroke (callers resolve on submit, not on input), batch simultaneous bulk
 * resolves, and keep a session cache keyed by input, because pasting the same
 * URL twice while trying to make something work is the common case, not the
 * exception.
 *
 * The cache is in-memory and per-session on purpose. "Which feeds does this site
 * declare" is exactly the kind of fact that goes stale invisibly, and a
 * persisted wrong answer would be undiagnosable.
 */
@Injectable({ providedIn: 'root' })
export class PasteResolve {
  private proxy = inject(CorsProxy);
  private batchFetch = inject(CorsProxyBatchFetch);
  private proxySettings = inject(CorsProxySettings);
  private api = inject(Api);
  private feeds = inject(RssFetch);
  private diagnostics = inject(PageDiagnostics);

  readonly running = signal(false);

  private cache = new Map<string, PasteResolution>();
  private active = 0;

  /**
   * Resolve `input`.
   *
   * Never throws: every failure is a {@link PasteResolution} the UI can render,
   * because "that didn't work" is a normal outcome here and an exception would
   * make the caller invent the copy for it.
   */
  async resolve(input: string): Promise<PasteResolution> {
    const trimmed = input.trim();
    if (!trimmed) {
      return { kind: 'none', reason: 'Paste a link to get started.' };
    }
    const cached = this.cache.get(trimmed);
    if (cached) {
      return cached;
    }
    this.active++;
    this.running.set(true);
    try {
      const result = await this.classify(trimmed);
      // Only cache real answers. Caching "no proxy configured" would keep
      // failing after the user goes and configures one.
      if (result.kind !== 'none') {
        this.cache.set(trimmed, result);
      }
      this.diagnostics.info('RSS', 'paste:resolved', { kind: result.kind });
      return result;
    } finally {
      this.active--;
      this.running.set(this.active > 0);
    }
  }

  private async classify(input: string): Promise<PasteResolution> {
    // 1. A fediverse handle: our own API, no proxy, and the answer is a follow.
    const handle = handleIn(input);
    if (handle) {
      const account = await this.lookup(handle);
      if (account) {
        return { kind: 'account', account, rssUrl: rssUrlFor(account) };
      }
      // Not a real account — fall through. `user@host` is also what an email
      // address looks like, and a handle URL is still a URL worth probing.
    }

    let url: URL;
    try {
      url = new URL(input);
    } catch {
      // A bare domain is offered, not fetched: turning `foo` into `https://foo/`
      // and requesting it is a network call the user never asked for.
      if (BARE_DOMAIN.test(input)) {
        return { kind: 'suggestion', url: `https://${input}` };
      }
      return {
        kind: 'none',
        reason: 'That doesn’t look like a link. Try a site address like https://example.com.',
      };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { kind: 'none', reason: 'Only http and https links can be checked.' };
    }

    // 2. Looks like a feed already — try that before fetching a page. The
    //    extension is evidence, not proof, so a failure falls through to the
    //    page probe: plenty of sites serve HTML from /feed.
    const feedish = FEEDISH.test(url.pathname + url.search);
    if (feedish) {
      const direct = await this.tryFeed(url.toString());
      if (direct) {
        return direct;
      }
    }

    // 3. YouTube: a channel URL carries its id, and the feed URL is stable.
    //    Anything else falls through to the generic probe, which works because
    //    YouTube declares its feed the ordinary way.
    const youtube = youtubeFeedFor(url);
    if (youtube) {
      return {
        kind: 'feeds',
        feeds: [youtube],
        siteUrl: url.toString(),
        needsProxy: false,
      };
    }

    // 4. The general case: fetch the page and read what it declares.
    const probed = await this.probePage(url.toString());
    if (probed.kind !== 'none' || !feedish) {
      return probed;
    }

    // A feed-ish URL whose feed fetch failed *and* whose page probe found
    // nothing. Hand the URL back as the candidate anyway rather than reporting
    // the page failure: the user pasted something that looks like a feed, so
    // the honest next step is to let the subscribe path try it and show its own
    // error — which is also where the entitled-proxy retry lives.
    return {
      kind: 'feeds',
      feeds: [{ url: url.toString(), title: hostOf(url.toString()) }],
      siteUrl: url.toString(),
      // The direct attempt already failed above, so if there is a proxy to use,
      // use it — retrying direct would repeat a fetch we know does not work.
      needsProxy: this.proxy.available(),
    };
  }

  /** Try `url` as a feed. Null when it isn't one. */
  private async tryFeed(url: string): Promise<PasteResolution | null> {
    for (const useProxy of [false, true]) {
      if (useProxy && !this.proxy.available()) {
        break;
      }
      try {
        const feed = await firstValueFrom(this.feeds.fetchFeed(url, { useProxy, noCache: true }));
        return {
          kind: 'feeds',
          feeds: [{ url, title: feed.title || hostOf(url) }],
          siteUrl: url,
          needsProxy: useProxy,
        };
      } catch {
        // Direct failing is the ordinary CORS case; retry through the proxy.
      }
    }
    return null;
  }

  /** Fetch a page and rank the feeds it declares. */
  private async probePage(pageUrl: string): Promise<PasteResolution> {
    // A Plus subscriber who has never configured a proxy is entitled to one, and
    // "needs a CORS proxy" is a dead end for someone who already paid for it.
    // The add path does the same adoption on a failed fetch; doing it here too
    // means the *resolve* step doesn't stop them one screen earlier.
    if (!this.proxy.available() && this.proxySettings.missingEntitledProxy()) {
      this.proxySettings.adoptSupporterProxy();
    }
    if (!this.proxy.available()) {
      return {
        kind: 'none',
        reason: 'Checking a site for feeds needs a CORS proxy. Set one up in Settings → RSS.',
        reached: false,
      };
    }

    let html: string;
    // Kept out of the empty-body signal: a 429 and a site that served nothing
    // are both "no HTML", and only the status tells them apart.
    let rateLimited = false;
    try {
      html = (await firstValueFrom(this.batchFetch.text(pageUrl, 'article'))) ?? '';
    } catch (error: unknown) {
      rateLimited = error instanceof HttpErrorResponse && error.status === 429;
      html = '';
    }

    if (!html) {
      return {
        kind: 'none',
        reason: rateLimited
          ? 'The CORS proxy is rate-limiting you. Wait a little and try again.'
          : 'Couldn’t reach that site.',
        reached: false,
        ...(rateLimited ? { rateLimited: true } : {}),
      };
    }

    // The response may itself be a feed — a URL with no feed-ish extension that
    // serves XML anyway. Hand it to the feed path rather than parsing XML as
    // HTML and finding no <link> elements.
    if (looksLikeFeedDocument(html)) {
      const asFeed = await this.tryFeed(pageUrl);
      if (asFeed) {
        return asFeed;
      }
    }

    const found = feedLinksIn(html, pageUrl);
    if (!found.length) {
      // Reached, read, and it declares nothing — the one `none` a bulk caller
      // may safely remember, because asking again would get the same answer.
      return {
        kind: 'none',
        reason: 'No feed found on that page. It may not publish one.',
        reached: true,
      };
    }
    return {
      kind: 'feeds',
      // Rank first, then collapse: the collapse keeps the order it is given, so
      // ranking decides which content wins and the collapse only decides which
      // *format* of a given content survives. A site publishing three sections
      // in two formats each becomes a three-way choice rather than a six-way
      // one — and one section in two formats stops being a choice at all.
      feeds: collapseFormats(rankFeeds(found, titleOf(html))),
      siteUrl: pageUrl,
      // These came off a page we could only read through the proxy, but the feed
      // itself may well be CORS-friendly — the subscribe path tries direct first.
      needsProxy: false,
    };
  }

  private async lookup(acct: string): Promise<Account | null> {
    try {
      return await firstValueFrom(this.api.lookupAccount(acct));
    } catch {
      return null;
    }
  }
}

/** The handle in `input`, in `user@host` form, or null. */
export function handleIn(input: string): string | null {
  const at = HANDLE_AT.exec(input);
  if (at) {
    return `${at[1]}@${at[2]}`;
  }
  const url = HANDLE_URL.exec(input);
  if (url) {
    return `${url[2]}@${url[1]}`;
  }
  // Someone on this server: `lookupAccount` takes a bare username for a local
  // account, so there is no host to add.
  const local = HANDLE_LOCAL.exec(input);
  return local ? local[1] : null;
}

/** A Mastodon account's own RSS feed — the secondary offer on the account path. */
export function rssUrlFor(account: Account): string {
  return `${account.url.replace(/\/$/, '')}.rss`;
}

/**
 * The channel feed for a YouTube URL, when the id is in the URL itself.
 *
 * Only `/channel/UC…` carries the id; `@handle`, `/c/` and video URLs do not,
 * and are left to the generic page probe rather than given a bespoke scraper
 * aimed at markup a third party can change whenever they like.
 */
export function youtubeFeedFor(url: URL): FeedCandidate | null {
  if (!/(^|\.)youtube\.com$/i.test(url.hostname)) {
    return null;
  }
  const channel = /^\/channel\/(UC[a-z0-9_-]+)/i.exec(url.pathname);
  if (!channel) {
    return null;
  }
  return {
    url: `https://www.youtube.com/feeds/videos.xml?channel_id=${channel[1]}`,
    title: 'YouTube channel',
  };
}

function looksLikeFeedDocument(text: string): boolean {
  const head = text.slice(0, 500).toLowerCase();
  return head.includes('<rss') || head.includes('<feed') || head.includes('<rdf:rdf');
}

function titleOf(html: string): string {
  return /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}
