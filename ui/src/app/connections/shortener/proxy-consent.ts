import { inject, Injectable } from '@angular/core';
import { CorsProxyId } from '../cors-proxy/cors-proxy-catalog';
import { ProxyConsent, ProxyConsentRecord } from '../proxy-consent-store';
import { ShortenerId } from './shortener-provider';

/**
 * The shortener's view of the shared {@link ProxyConsent} store.
 *
 * ## Why this still exists
 *
 * The consent machinery was originally written here, keyed to `ShortenerId`.
 * The Twitter data services need exactly the same thing — a recorded, revocable,
 * per-`(connector, proxy)` grant — so the implementation moved to
 * `providers/proxy-consent-store.ts` and widened its key type.
 *
 * This class stays as a *narrowing* facade rather than being deleted, for two
 * reasons that outlast the refactor:
 *
 * - **Type safety at the call site.** `ShortenerTransport` and the link
 *   shortener page can only ever mean a shortener. Keeping their dependency
 *   typed to `ShortenerId` means a Twitter id cannot be passed by mistake, which
 *   a widened `ProxyConsentSubjectId` parameter would happily accept.
 * - **`revokeAll()` means something different per connector.** Disconnecting the
 *   shortener must not revoke the user's X consents.
 *
 * There is no second store and no second copy of the storage format — every
 * method here delegates. Records written before the generalization are migrated
 * on read by the shared store.
 */
@Injectable({ providedIn: 'root' })
export class ShortenerProxyConsent {
  private store = inject(ProxyConsent);

  /** Whether this exact pairing has been agreed to. */
  granted(shortener: ShortenerId, proxy: CorsProxyId): boolean {
    return this.store.granted(shortener, proxy);
  }

  /** The record for a pairing, for UI that shows when consent was given. */
  record(shortener: ShortenerId, proxy: CorsProxyId): ProxyConsentRecord | null {
    return this.store.record(shortener, proxy);
  }

  /**
   * Every shortener consent on file, newest first.
   *
   * Filtered to shorteners: the link shortener page lists what it can revoke,
   * and an X consent is neither its business nor revocable from there.
   */
  all(): ProxyConsentRecord[] {
    return this.store.all().filter((record) => isShortener(record.subject));
  }

  /**
   * Record an acceptance.
   *
   * Called only from the dialog that presented the risk in full. Nothing else
   * should call this — a consent granted without the user having read the
   * disclosure is worse than no consent, because it looks like one.
   */
  grant(shortener: ShortenerId, proxy: CorsProxyId): void {
    this.store.grant(shortener, proxy);
  }

  /** Withdraw one consent. The next request through that pair asks again. */
  revoke(shortener: ShortenerId, proxy: CorsProxyId): void {
    this.store.revoke(shortener, proxy);
  }

  /**
   * Withdraw shortener consents — one provider's, or all of them.
   *
   * Scoped to shorteners even in the "all" case. Disconnecting the link
   * shortener is not a statement about the user's Twitter data connection.
   */
  revokeAll(shortener?: ShortenerId): void {
    if (shortener) {
      this.store.revokeAll(shortener);
      return;
    }
    for (const record of this.all()) {
      this.store.revoke(record.subject, record.proxy);
    }
  }
}

const SHORTENER_IDS: readonly string[] = ['dub', 'shortio', 'tly', 'rebrandly', 'tinyurl', 'isgd'];

function isShortener(subject: string): subject is ShortenerId {
  return SHORTENER_IDS.includes(subject);
}
