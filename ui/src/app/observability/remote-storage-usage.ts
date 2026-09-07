import { Injectable, signal } from '@angular/core';
import type { BillingTier } from './mawkingbird-metrics';

/**
 * How much this account is storing on Mawkingbird's profile service.
 *
 * ## Why this is measured and not estimated
 *
 * The service keeps a per-user byte counter in KV and reports it on every
 * `GET /manifest` as `quota: { used, limit }`. That is the number it actually
 * enforces against, so anything computed on this side — summing the settings
 * document, guessing at overheads — would be a second opinion that disagrees
 * with the one that decides whether a write succeeds. There is no reason to
 * hold a worse copy of a number the server hands over for free.
 *
 * ## Why it is stored at all
 *
 * The figure arrives on a request the app already makes for other reasons, and
 * a signed-out or offline visit makes no such request. Without a cached copy
 * the Storage Diagnostics page would show "unknown" for anyone who had not
 * happened to sync in this session, which reads as broken rather than stale.
 * So the last known figure is kept, and shown with the time it was taken —
 * a number with a date on it is honest in a way that a blank is not.
 *
 * The tier is stored alongside it because the allowance depends on it, and
 * because "you are using 40 MB of your free allowance" and "…of your paid
 * allowance" are different sentences.
 */

/** The last known remote storage figure. */
export interface RemoteStorage {
  /** Bytes stored, as the service counts them. */
  used: number;
  /** The allowance in bytes, as the service enforces it. */
  limit: number;
  /** Which tier the reading was taken under. */
  tier: BillingTier;
  /** Epoch ms the figure was read. */
  at: number;
}

const STORAGE_KEY = 'mockingbird_remote_storage_usage';

@Injectable({ providedIn: 'root' })
export class RemoteStorageUsage {
  /** The last known figure, or null if this browser has never seen one. */
  readonly usage = signal<RemoteStorage | null>(read());

  /** Bank a quota reading from a manifest response. */
  record(quota: { used: number; limit: number }, tier: BillingTier): void {
    const next: RemoteStorage = {
      used: numberOr(quota.used),
      limit: numberOr(quota.limit),
      tier,
      at: Date.now(),
    };
    this.usage.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // A cached diagnostic; losing it costs nothing but a blank cell.
    }
  }

  /** Fraction of the allowance used, or null when the limit is unknown. */
  ratio(): number | null {
    const u = this.usage();
    if (!u || u.limit <= 0) {
      return null;
    }
    return Math.min(1, u.used / u.limit);
  }

  reset(): void {
    this.usage.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // As above.
    }
  }
}

function read(): RemoteStorage | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<RemoteStorage>;
    if (typeof parsed.used !== 'number' || typeof parsed.limit !== 'number') {
      return null;
    }
    return {
      used: numberOr(parsed.used),
      limit: numberOr(parsed.limit),
      tier: parsed.tier === 'paid' ? 'paid' : 'free',
      at: numberOr(parsed.at),
    };
  } catch {
    return null;
  }
}

function numberOr(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}
