import { Injectable, signal } from '@angular/core';
import { CorsProxyId } from './cors-proxy/cors-proxy-catalog';
import { ShortenerId } from './shortener/shortener-provider';
import { TwitterSourceId } from './twitter/twitter-source';

/**
 * Records that the user knowingly agreed to send a connector's traffic through
 * a named CORS proxy. That traffic may carry an API key.
 *
 * Generalized from `shortener/proxy-consent.ts`, which was the same thing keyed
 * to `ShortenerId` alone. The reasoning there applies unchanged and is worth
 * restating, because it is the whole justification for storing this at all:
 *
 * `cors-proxy.ts` refuses, by design, to proxy anything carrying a credential.
 * That refusal is correct — a proxy sees every header it is given. But some APIs
 * are server-to-server by construction and do not answer browsers, so for those
 * a proxy is the only way the feature exists. The resolution is not to weaken
 * the rule but to make the exception explicit, narrow, and the user's own
 * decision — which means recording it, or the app is either asking on every
 * request (so the user clicks through without reading) or deciding silently.
 *
 * ## What a consent is scoped to
 *
 * A `(connector, proxy)` pair, both halves load-bearing:
 *
 * - Changing proxy means a *different company* now sees the key. The earlier
 *   answer said nothing about this one, so it is asked again.
 * - Changing connector means a different key with different powers is at stake.
 *   Someone may accept the risk for a throwaway T.LY token and refuse it for a
 *   key that spends money.
 *
 * ## Why the Twitter data services raised the stakes
 *
 * The shortener case disclosed a key that creates and deletes links. A Twitter data
 * service key **spends the user's credit balance**, and — because every lookup
 * goes through the proxy — the proxy operator also learns *every profile,
 * search and post the user reads*. That is a reading-history disclosure the
 * shortener case did not have, and the dialog must say so. See
 * {@link ProxyConsentSubject}.
 *
 * ## Storage migration
 *
 * The old key held the same records under the same `id:proxy` shape, so it is
 * read once and folded in. Users keep grants they already made rather than
 * being re-asked because a type widened.
 */

const STORAGE_KEY = 'mockingbird_proxy_consent';
const LEGACY_SHORTENER_KEY = 'mockingbird_shortener_proxy_consent';

/** Anything that can hold a key and need a proxy to use it. */
export type ProxyConsentSubjectId = ShortenerId | TwitterSourceId | 'mataroa';

export interface ProxyConsentRecord {
  /** The connector whose traffic is covered. */
  subject: ProxyConsentSubjectId;
  proxy: CorsProxyId;
  /** Epoch ms when the user accepted. Shown on the connector page. */
  grantedAt: number;
}

/** A consent key. Not a display string — never rendered. */
function pairKey(subject: ProxyConsentSubjectId, proxy: CorsProxyId): string {
  return `${subject}:${proxy}`;
}

/**
 * Legacy records used `shortener` where this uses `subject`. Normalized on read
 * so one shape reaches the rest of the code.
 */
interface LegacyRecord {
  shortener?: ShortenerId;
  subject?: ProxyConsentSubjectId;
  proxy: CorsProxyId;
  grantedAt: number;
}

function readKey(key: string): Record<string, ProxyConsentRecord> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const out: Record<string, ProxyConsentRecord> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, LegacyRecord>)) {
      const subject = value?.subject ?? value?.shortener;
      if (subject && value?.proxy && typeof value.grantedAt === 'number') {
        out[id] = { subject, proxy: value.proxy, grantedAt: value.grantedAt };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function load(): Record<string, ProxyConsentRecord> {
  // Legacy first so a current record wins on collision.
  return { ...readKey(LEGACY_SHORTENER_KEY), ...readKey(STORAGE_KEY) };
}

@Injectable({ providedIn: 'root' })
export class ProxyConsent {
  private records = signal<Record<string, ProxyConsentRecord>>(load());

  /** Whether this exact pairing has been agreed to. */
  granted(subject: ProxyConsentSubjectId, proxy: CorsProxyId): boolean {
    return pairKey(subject, proxy) in this.records();
  }

  /** The record for a pairing, for UI that shows when consent was given. */
  record(subject: ProxyConsentSubjectId, proxy: CorsProxyId): ProxyConsentRecord | null {
    return this.records()[pairKey(subject, proxy)] ?? null;
  }

  /** Every consent on file, newest first, for the connector pages to list. */
  all(): ProxyConsentRecord[] {
    return Object.values(this.records()).sort((a, b) => b.grantedAt - a.grantedAt);
  }

  /** Consents for one connector, for a page that shows only its own. */
  forSubject(subject: ProxyConsentSubjectId): ProxyConsentRecord[] {
    return this.all().filter((record) => record.subject === subject);
  }

  /**
   * Record an acceptance.
   *
   * Called only from the dialog that presented the risk in full. Nothing else
   * should call this — a consent granted without the user having read the
   * disclosure is worse than no consent, because it looks like one.
   */
  grant(subject: ProxyConsentSubjectId, proxy: CorsProxyId): void {
    const record: ProxyConsentRecord = { subject, proxy, grantedAt: Date.now() };
    this.write({ ...this.records(), [pairKey(subject, proxy)]: record });
  }

  /** Withdraw one consent. The next request through that pair asks again. */
  revoke(subject: ProxyConsentSubjectId, proxy: CorsProxyId): void {
    const next = { ...this.records() };
    delete next[pairKey(subject, proxy)];
    this.write(next);
  }

  /** Withdraw everything, or everything for one connector when disconnecting it. */
  revokeAll(subject?: ProxyConsentSubjectId): void {
    if (!subject) {
      this.write({});
      return;
    }
    this.write(
      Object.fromEntries(
        Object.entries(this.records()).filter(([, record]) => record.subject !== subject),
      ),
    );
  }

  private write(next: Record<string, ProxyConsentRecord>): void {
    this.records.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      // The legacy key is now a stale duplicate. Removing it keeps a revoke from
      // being silently undone by the merge on next load.
      localStorage.removeItem(LEGACY_SHORTENER_KEY);
    } catch {
      // Honoured for this session; the user is re-asked in the next one, which
      // is the safe direction to fail.
    }
  }
}
