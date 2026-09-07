import { Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';
import { ArticleDiagnosis } from './article-models';

/**
 * What this device has learned about which hosts refuse to be read.
 *
 * ## The other half of `UNLIKELY_HOSTS`
 *
 * `article-diagnosis.ts` ships a starter list of publishers where expansion
 * reliably fails, each with a reason. That list is right and stays: it works on
 * the first attempt, before anything has been observed, and it is reviewable by
 * a human. What it cannot do is learn. The web has more paywalls than anyone
 * will hand-maintain, and the reader who keeps hitting one gets no benefit from
 * our not knowing about it.
 *
 * This is the observed half. It records what actually happened, per host, and
 * after enough failures with no successes it warns before the next attempt
 * spends quota. The wording is the shipped list's wording, so the two sources
 * are indistinguishable to the reader — which is the point. A hint is a hint
 * whether it came from a table or from experience.
 *
 * ## Nothing is sent anywhere
 *
 * This is a local record of the reader's own browsing, and it stays on the
 * device. It is exportable as JSON so it can be read, and so its contents can
 * be pasted into the proxy's own table later if that is ever wanted — but the
 * proxy does not collect it, and teaching it to is future work with its own
 * consent question. Notably `mawkingbird_cors_proxy` has already argued the
 * client is the right place for exactly this (`config.ts`: a server-side
 * negative cache would have to guess a TTL, and the client knows more about
 * whether a reader is retrying deliberately).
 */
export interface HostRecord {
  attempts: number;
  failures: number;
  /** The most recent host-attributable verdict. */
  lastDiagnosis: ArticleDiagnosis | null;
  /** For the LRU, and so an export can be read chronologically. */
  lastSeen: number;
}

export type HostMap = Record<string, HostRecord>;

export const OBSERVED_FAILURES_KEY_BASE = 'mockingbird_article_observed_failures';

/**
 * How many hosts to remember.
 *
 * A map of every host a reader ever touched is unbounded by construction — a
 * year of following links is thousands of domains, most visited once. 200 is
 * comfortably more than the set anyone returns to often enough for a hint to
 * matter, and small enough to be invisible in the storage budget.
 */
export const OBSERVED_HOSTS_MAX = 200;

/**
 * Failures before the warning appears.
 *
 * Three, not one: sites have bad days, and a single refusal is at least as
 * likely to be the moment as the publisher. Three consecutive failures with
 * nothing to set against them is a pattern.
 */
export const FAILURES_BEFORE_WARNING = 3;

/**
 * Verdicts that say something about the *host*.
 *
 * The distinction this list draws is the whole correctness of the feature. A
 * paywall, a bot check, a consent wall, a JS-only page, a refused destination
 * and a site-side rate limit are all facts about the publisher, and they will
 * be just as true tomorrow.
 *
 * `network` and `rate-limited` are not. They are facts about *us* or about the
 * moment — our proxy was busy, the device was offline, the request timed out on
 * our side. Counting those would teach the reader that a perfectly good site is
 * hopeless, on evidence that had nothing to do with it. `junk`, `not-html` and
 * `too-large` are excluded for a related reason: they are facts about one URL
 * rather than about the host, and one PDF does not make a domain unreadable.
 */
const HOST_ATTRIBUTABLE: readonly ArticleDiagnosis[] = [
  'paywall',
  'bot-check',
  'consent-wall',
  'needs-js',
  'blocked-destination',
  'site-rate-limited',
];

export function isHostAttributable(diagnosis: ArticleDiagnosis): boolean {
  return HOST_ATTRIBUTABLE.includes(diagnosis);
}

/** The host of a URL, lower-cased, or null when it has none. */
export function hostOf(rawUrl: string): string | null {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is HostRecord {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const r = value as Partial<HostRecord>;
  return (
    typeof r.attempts === 'number' &&
    Number.isFinite(r.attempts) &&
    typeof r.failures === 'number' &&
    Number.isFinite(r.failures) &&
    typeof r.lastSeen === 'number' &&
    Number.isFinite(r.lastSeen)
  );
}

/** Tolerant load, in the house style: a bad entry costs that entry. */
function load(key: string): HostMap {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: HostMap = {};
    for (const [host, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isRecord(value)) {
        out[host] = {
          attempts: Math.max(0, Math.floor(value.attempts)),
          failures: Math.max(0, Math.floor(value.failures)),
          lastDiagnosis: typeof value.lastDiagnosis === 'string' ? value.lastDiagnosis : null,
          lastSeen: value.lastSeen,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Evict least-recently-seen hosts down to `max`.
 *
 * Pure and exported so the bound can be tested by overfilling it, which is the
 * only way to know a cap works.
 */
export function evictLeastRecent(map: HostMap, max = OBSERVED_HOSTS_MAX): HostMap {
  const hosts = Object.keys(map);
  if (hosts.length <= max) {
    return map;
  }
  const kept = hosts
    .sort((a, b) => map[b].lastSeen - map[a].lastSeen)
    .slice(0, max)
    .sort();
  const out: HostMap = {};
  for (const host of kept) {
    out[host] = map[host];
  }
  return out;
}

@Injectable({ providedIn: 'root' })
export class ObservedFailures {
  private readonly key = scopedKey(OBSERVED_FAILURES_KEY_BASE);
  private readonly hosts = signal<HostMap>(load(this.key));

  /** How many hosts are on record. For Storage Diagnostics. */
  readonly size = signal(0);

  constructor() {
    this.size.set(Object.keys(this.hosts()).length);
  }

  get(host: string): HostRecord | undefined {
    return this.hosts()[host.toLowerCase()];
  }

  /**
   * Whether we should warn before fetching from this URL.
   *
   * Deliberately silent about *why* beyond the diagnosis: the caller shows the
   * shipped list's wording, and a reader should not be able to tell whether a
   * hint came from the table or from their own history.
   */
  warnFor(rawUrl: string): ArticleDiagnosis | null {
    const host = hostOf(rawUrl);
    if (!host) {
      return null;
    }
    const record = this.hosts()[host];
    if (!record || record.failures < FAILURES_BEFORE_WARNING) {
      return null;
    }
    // A single success is enough to clear the record entirely (see `record`),
    // so a surviving record with successes cannot exist. Checked anyway,
    // because a store loaded from an older build might hold one.
    return record.attempts > record.failures ? null : record.lastDiagnosis;
  }

  /**
   * Note what happened on one attempt.
   *
   * A success **clears** the host rather than decrementing it: the evidence is
   * that the site works, and a reader who just read an article there should not
   * still be warned about it because of last month. That also keeps the store
   * to hosts that have actually been a problem, which is what makes an export
   * of it worth reading.
   */
  record(rawUrl: string, diagnosis: ArticleDiagnosis, at = Date.now()): void {
    const host = hostOf(rawUrl);
    if (!host) {
      return;
    }
    const succeeded = diagnosis === 'ok' || diagnosis === 'partial';
    if (succeeded) {
      if (!this.hosts()[host]) {
        return;
      }
      const next = { ...this.hosts() };
      delete next[host];
      this.persist(next);
      return;
    }
    if (!isHostAttributable(diagnosis)) {
      // About us or about the moment. Recording it would poison a host record
      // on evidence that says nothing about the host.
      return;
    }
    const existing = this.hosts()[host];
    const record: HostRecord = {
      attempts: (existing?.attempts ?? 0) + 1,
      failures: (existing?.failures ?? 0) + 1,
      lastDiagnosis: diagnosis,
      lastSeen: at,
    };
    this.persist(evictLeastRecent({ ...this.hosts(), [host]: record }));
  }

  /** Forget one host, for a reader who disagrees with the record. */
  forget(host: string): void {
    const key = host.toLowerCase();
    if (!this.hosts()[key]) {
      return;
    }
    const next = { ...this.hosts() };
    delete next[key];
    this.persist(next);
  }

  clear(): void {
    this.persist({});
  }

  /** The whole record, for export. Nothing sends it anywhere. */
  snapshot(): HostMap {
    return { ...this.hosts() };
  }

  /** The export as it is offered for download: stable key order, readable. */
  exportJson(): string {
    const map = this.snapshot();
    const ordered = Object.keys(map)
      .sort()
      .reduce<HostMap>((out, host) => {
        out[host] = map[host];
        return out;
      }, {});
    return JSON.stringify(ordered, null, 2);
  }

  private persist(map: HostMap): void {
    this.hosts.set(map);
    this.size.set(Object.keys(map).length);
    localStorage.setItem(this.key, JSON.stringify(map));
  }
}
