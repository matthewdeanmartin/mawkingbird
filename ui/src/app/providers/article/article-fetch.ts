import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { PageDiagnostics } from '../../page-diagnostics';
import { CorsProxy } from '../cors-proxy/cors-proxy';
import { CorsProxyRoute } from '../cors-proxy/cors-proxy-catalog';
import { externalFetch } from '../external-fetch';
import { ArticleCache } from './article-cache';
import { countWords, inspectUrl } from './article-diagnosis';
import { extractArticle } from './article-extract';
import { ArticleDebug, ArticleDiagnosis, ArticleResult } from './article-models';

/**
 * Fetches a remote page and turns it into something the reader can show.
 *
 * The one thing the UI talks to. Everything sharp lives behind it: the proxy,
 * the cache, the extractor, and the decision not to bother.
 *
 * ## Quota is deliberately not enforced here
 *
 * {@link ArticleQuota} is checked and consumed by the *caller*, after a result
 * comes back, because only the caller knows whether an article was actually
 * rendered. Doing it here would charge for cache hits and for failures, which
 * is exactly what makes a metered feature feel dishonest.
 */

/** The header the proxy uses to report where a redirect chain ended. */
const FINAL_URL_HEADER = 'X-Proxy-Final-Url';

/** Whether a response was written by the proxy or relayed from the target. */
const SOURCE_HEADER = 'X-Proxy-Source';

/** The target's own status, when the proxy relayed a failure. */
const UPSTREAM_STATUS_HEADER = 'X-Proxy-Upstream-Status';

/**
 * What went wrong, in enough detail to act on.
 *
 * The reason this is a record rather than a bare enum: "couldn't fetch" is not
 * a diagnosis, and the first real failure proved it. A news site's own bot
 * protection answered `520`; the proxy relayed it verbatim; the client mapped
 * it to `network` and told the reader "Couldn't reach this page" — when the
 * page had been reached, and had deliberately refused. Everything needed to say
 * so was on the wire and nothing carried it to the surface.
 */
export interface ArticleFailure {
  diagnosis: ArticleDiagnosis;
  /** HTTP status the browser saw. */
  status: number;
  /** Who produced it: the proxy, the target site, or unknown. */
  source: 'proxy' | 'upstream' | 'unknown';
  /** The target's own status, when the proxy relayed one. */
  upstreamStatus: number | null;
  /** The proxy's own sentence, when it wrote one. */
  detail: string | null;
}

/** Read the proxy's `error` sentence out of whatever shape the body arrived in. */
function proxyDetail(error: HttpErrorResponse): string | null {
  const body: unknown = error.error;

  // Angular hands back raw text for a `responseType: 'text'` request even when
  // the body is JSON, so parse before giving up on it.
  let parsed: unknown = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      // Not JSON. Fall through to the raw-text handling below.
    }
  }

  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;

    // The `article` route's buffered failure: the proxy already did this work,
    // quoting the site's own words into a field. Preferred over everything else
    // because it is the one shape we can rely on.
    const upstreamMessage = record['upstreamMessage'];
    if (typeof upstreamMessage === 'string' && upstreamMessage.trim()) {
      return upstreamMessage.slice(0, 300);
    }

    // Our own proxy's shape: `{error, source}`.
    if (typeof record['error'] === 'string') {
      return record['error'];
    }

    // A relayed error body, which belongs to the site rather than to us. We
    // cannot rewrite it — a relay that edits bodies is not a relay — but we can
    // read it, and the good ones say something worth repeating. Cloudflare's
    // origin-error pages (the 520 family, which is how a lot of bot protection
    // answers) carry a plain-English `title`, and naming the `zone` tells the
    // reader *whose* infrastructure refused rather than leaving them to guess.
    const title = record['title'];
    if (typeof title === 'string' && title.trim()) {
      const zone = record['zone'];
      return typeof zone === 'string' && zone.trim() ? `${title} (${zone})` : title;
    }
    // RFC 7807 and several APIs use `message` or `detail` instead.
    for (const key of ['message', 'detail']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.slice(0, 300);
      }
    }
    return null;
  }

  if (typeof body === 'string' && body.trim()) {
    // Unstructured. Worth showing, but a relayed body can be a whole HTML page,
    // so only the opening — and never markup, which would be noise.
    const text = body
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text ? text.slice(0, 200) : null;
  }
  return null;
}

/**
 * Map a transport failure onto something the reader can explain.
 *
 * The `source` header does the work that guessing from a status cannot: the
 * proxy and the target draw from the same status space, so a relayed `520` and
 * a proxy-authored `502` are indistinguishable without being told which is
 * which.
 */
export function diagnoseHttpError(error: HttpErrorResponse): ArticleFailure {
  const headerSource = error.headers?.get(SOURCE_HEADER);
  const source: ArticleFailure['source'] =
    headerSource === 'proxy' || headerSource === 'upstream' ? headerSource : 'unknown';
  const rawUpstream = error.headers?.get(UPSTREAM_STATUS_HEADER);
  const upstreamStatus = rawUpstream ? Number(rawUpstream) : null;
  const detail = proxyDetail(error);

  const failure = (diagnosis: ArticleDiagnosis): ArticleFailure => ({
    diagnosis,
    status: error.status,
    source,
    upstreamStatus,
    detail,
  });

  // A status 0 means the request never completed — offline, DNS, or a CORS
  // rejection. Distinguished first because no header survives it.
  if (error.status === 0) {
    return failure('network');
  }

  // The proxy's own refusals name themselves. Matching on its sentences is
  // deliberate and slightly brittle; the `source` header is what makes it safe,
  // since these patterns are only consulted for proxy-authored bodies.
  if (source === 'proxy' && detail) {
    if (/redirected more than/i.test(detail)) {
      return failure('redirect-loop');
    }
    if (/byte limit|over this route's/i.test(detail)) {
      return failure('too-large');
    }
    if (/content type|Disallowed content/i.test(detail)) {
      return failure('not-html');
    }
    if (/does not reach|cannot be proxied/i.test(detail)) {
      return failure('blocked-destination');
    }
    if (/did not respond within/i.test(detail)) {
      return failure('upstream-timeout');
    }
  }

  // A rate limit from the proxy is ours to explain; one relayed from the site
  // is theirs, and the advice differs — wait a minute versus this site throttles
  // automated readers.
  if (error.status === 429) {
    return failure(source === 'upstream' ? 'site-rate-limited' : 'rate-limited');
  }

  // The classic anti-bot answers. 520/521/522/523/525/526 are Cloudflare's
  // origin-error family, which is what a site's bot protection returns when it
  // will not serve a non-browser — the case that started all this.
  if ([401, 403, 406, 451].includes(error.status)) {
    return failure('bot-check');
  }
  if (error.status >= 520 && error.status <= 527) {
    return failure(source === 'upstream' ? 'bot-check' : 'network');
  }

  if (error.status === 404 || error.status === 410) {
    // A 404 *from the proxy* naming an unknown route is a deploy-order problem,
    // not a missing page: the app shipped ahead of the Worker. Distinguished so
    // the caller can retry on `feeds` rather than telling the reader their
    // article is gone.
    if (source === 'proxy' && detail && /No such route/i.test(detail)) {
      return failure('route-unavailable');
    }
    return failure('not-found');
  }
  if (error.status === 415) {
    return failure('not-html');
  }
  if (error.status === 504) {
    return failure('upstream-timeout');
  }
  if (error.status >= 500) {
    return failure(source === 'upstream' ? 'site-error' : 'network');
  }

  return failure('network');
}

/** One transport attempt: either the bytes, or why not. */
type FetchOutcome =
  | { ok: true; html: string; finalUrl: string; status: number }
  | { ok: false; failure: ArticleFailure };

@Injectable({ providedIn: 'root' })
export class ArticleFetch {
  private http = inject(HttpClient);
  private proxy = inject(CorsProxy);
  private cache = inject(ArticleCache);
  private diagnostics = inject(PageDiagnostics);

  /** Whether expansion can be offered at all. */
  available(): boolean {
    return this.proxy.available();
  }

  /** Read locally without authorizing or making a network request. */
  async cached(url: string): Promise<ArticleResult | null> {
    const result = await this.cache.get(url);
    return result ? { ...result, fromCache: true } : null;
  }

  /**
   * Expand one URL.
   *
   * Always resolves — never rejects — because every failure mode here is one
   * the reader is expected to show rather than one to handle. A caller reads
   * {@link ArticleResult.diagnosis} to find out what happened.
   *
   * @param force skip the cache, for an explicit "re-fetch".
   */
  async expand(url: string, force = false): Promise<ArticleResult> {
    const startedAt = Date.now();
    const empty = (diagnosis: ArticleDiagnosis, debug: ArticleDebug = {}): ArticleResult => ({
      requestedUrl: url,
      finalUrl: url,
      card: null,
      article: null,
      diagnosis,
      fetchedAt: new Date().toISOString(),
      debug: { elapsedMs: Date.now() - startedAt, ...debug },
    });

    // Tier 0: refuse what cannot work, before spending a request on it.
    const urlVerdict = inspectUrl(url);
    if (urlVerdict && !urlVerdict.worthTrying) {
      this.diagnostics.info('Article', 'refused before fetching', {
        url,
        diagnosis: urlVerdict.diagnosis,
        reason: 'URL shape or a known-unreadable host',
      });
      return empty(urlVerdict.diagnosis, { detail: 'Refused before fetching.' });
    }

    if (!force) {
      const cached = await this.cached(url);
      if (cached) {
        this.diagnostics.info('Article', 'cache hit', { url, diagnosis: cached.diagnosis });
        return cached;
      }
    }

    if (!this.proxy.available()) {
      this.diagnostics.warn('Article', 'no proxy configured', { url });
      return empty('network', { detail: 'No CORS proxy is configured.' });
    }

    // The `article` route rather than `feeds`: it caps smaller, allows only
    // page content types, caches longer, and — the reason it exists — replaces
    // a failed upstream's body with a document we can actually parse. `feeds`
    // stays available and is still right for a known-friendly source where a
    // plain relay is all that is wanted.
    let fetched = await this.fetchVia('article', url);

    // Deploy-order tolerance: the app can ship before the Worker does. Falling
    // back keeps expansion working through that window instead of failing
    // every article until the proxy catches up.
    if (!fetched.ok && fetched.failure.diagnosis === 'route-unavailable') {
      this.diagnostics.warn('Article', 'article route unavailable, retrying on feeds', { url });
      fetched = await this.fetchVia('feeds', url);
    }

    if (!fetched.ok) {
      const { failure } = fetched;
      // `warn`, not `info`: this is the event someone is trying to explain
      // after the fact, and it should stand out from the ordinary chatter.
      this.diagnostics.warn('Article', 'fetch failed', {
        url,
        diagnosis: failure.diagnosis,
        status: failure.status,
        source: failure.source,
        upstreamStatus: failure.upstreamStatus,
        detail: failure.detail,
        elapsedMs: Date.now() - startedAt,
      });
      const result = empty(failure.diagnosis, {
        status: failure.status,
        source: failure.source,
        upstreamStatus: failure.upstreamStatus ?? undefined,
        detail: failure.detail ?? undefined,
      });
      await this.cache.put(url, result);
      return result;
    }

    const { html, finalUrl, status: httpStatus } = fetched;
    if (finalUrl !== url) {
      this.diagnostics.info('Article', 'followed redirect', { from: url, to: finalUrl });
    }

    const result = extractArticle(html, finalUrl, url);
    const elapsedMs = Date.now() - startedAt;

    // Extraction failures need their own explanation: the fetch worked, so the
    // status says 200 and nothing about the transport is wrong. What matters
    // here is how much text arrived and whether any of it looked like an
    // article.
    if (!result.article) {
      const documentWords = countWords(
        new DOMParser().parseFromString(html, 'text/html').body?.textContent ?? '',
      );
      this.diagnostics.warn('Article', 'nothing to read', {
        url,
        finalUrl,
        diagnosis: result.diagnosis,
        documentWords,
        bytes: html.length,
        hadMetadata: result.card !== null,
        elapsedMs,
      });
      result.debug = {
        status: httpStatus,
        source: 'upstream',
        documentWords,
        hadMetadata: result.card !== null,
        elapsedMs,
      };
    } else {
      this.diagnostics.info('Article', 'extracted', {
        url,
        diagnosis: result.diagnosis,
        words: result.article.metrics.wordCount,
        linkDensity: Number(result.article.metrics.linkDensity.toFixed(3)),
        quality: result.article.quality,
        elapsedMs,
      });
    }

    await this.cache.put(url, result);
    return result;
  }

  /**
   * One attempt at getting the bytes, over a named proxy route.
   *
   * Separate from {@link expand} so that a retry on a different route is a
   * second call rather than duplicated transport code — the shape that made
   * deploy-order tolerance cheap enough to be worth having.
   *
   * Never throws: a failure is a value, because every failure here is one the
   * reader is meant to see rather than one to handle.
   */
  private async fetchVia(route: CorsProxyRoute, url: string): Promise<FetchOutcome> {
    try {
      const request = this.proxy.proxyRequest(url, route);
      this.diagnostics.info('Article', 'fetching', { url, proxy: this.proxy.label(), route });
      const response = await this.http
        .get(request.url, {
          headers: request.headers,
          context: externalFetch(),
          responseType: 'text',
          observe: 'response',
        })
        .toPromise();

      const status = response?.status ?? 0;
      if (!response?.body) {
        // A 200 with nothing in it. Not a network failure, and retrying will
        // not help, so it gets its own message rather than a generic one.
        this.diagnostics.warn('Article', 'empty response body', { url, status, route });
        return {
          ok: false,
          failure: {
            diagnosis: 'site-error',
            status,
            source: 'upstream',
            upstreamStatus: null,
            detail: 'The site returned an empty response.',
          },
        };
      }

      return {
        ok: true,
        html: response.body,
        // Where the bytes actually came from, when the proxy followed a
        // redirect. Everything relative in the body resolves against this, so
        // getting it wrong breaks every image on a shortened link.
        finalUrl: response.headers.get(FINAL_URL_HEADER) ?? url,
        status,
      };
    } catch (error) {
      if (!(error instanceof HttpErrorResponse)) {
        // A CorsProxyRefusal, or a bug. Either way the message is ours and is
        // safe to show — it says which rule refused and why.
        const detail = error instanceof Error ? error.message : String(error);
        this.diagnostics.error('Article', 'fetch threw', error, { url, route });
        return {
          ok: false,
          failure: {
            diagnosis: 'blocked-destination',
            status: 0,
            source: 'proxy',
            upstreamStatus: null,
            detail,
          },
        };
      }
      return { ok: false, failure: diagnoseHttpError(error) };
    }
  }

  /** Drop a cached article so the next expand re-fetches it. */
  async forget(url: string): Promise<void> {
    await this.cache.remove(url);
  }
}
