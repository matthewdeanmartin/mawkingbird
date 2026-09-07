import { Injectable, signal } from '@angular/core';
import { LinkKind, ShortenerId, ShortLink } from './shortener-provider';

/**
 * Every short link this browser created, kept locally.
 *
 * ## Why a local history exists alongside provider list APIs
 *
 * Three reasons, and only the first is obvious:
 *
 * 1. **Coverage.** The pre-existing TinyURL shortener has no account and no list
 *    API at all. A link created there exists only if this browser remembers it.
 * 2. **Continuity.** A key that ages out under the retention policy, or a
 *    provider you switch away from, takes its list API with it. The links are
 *    still live on the internet and the user still wants to see them.
 * 3. **Ordering.** Provider list endpoints disagree about sort order and none of
 *    them knows when *you* made the link versus when it was last touched. The
 *    local `createdAt` is the only consistent axis across providers.
 *
 * The history is not authoritative. Where a provider can list, its answer wins
 * on every field — a link edited on the provider's own website should show the
 * new destination here. See {@link mergeLinks}.
 *
 * ## What is deliberately not stored
 *
 * Link passwords. The spec calls them secrets and they are: a password stored
 * next to the short URL it protects defeats the point of setting one. If the
 * user sets a password at create time it goes to the provider and is forgotten
 * here.
 */

const STORAGE_KEY = 'mockingbird_short_links';

/** How many links to keep before evicting the oldest. */
const MAX_RECORDS = 500;

/**
 * Who created a link, for history purposes.
 *
 * Wider than {@link ShortenerId} by exactly one member. `tinyurl` is not a
 * shortening *provider* in this app — it has no key, no list API, and cannot
 * shorten an arbitrary URL on request; it belongs to the paste feature, which
 * uses it to encode a whole message into a redirect target. But the links it
 * produces are short links the user made, and the Links page shows them.
 *
 * Modelling that as a widened union rather than casting `'tinyurl'` into
 * `ShortenerId` keeps the lie out of the type system: code that needs a real
 * provider (create, update, delete) still cannot be handed a TinyURL record by
 * accident, because {@link ShortenerId} does not include it.
 */
export type LinkOrigin = ShortenerId | 'tinyurl';

/**
 * A link as this browser recorded it.
 *
 * A structural subset of {@link ShortLink} minus `raw`, which is a whole
 * provider response and would blow the localStorage budget within a few dozen
 * links for no benefit — nothing reads `raw` off a history record.
 */
export interface ShortLinkRecord extends Omit<ShortLink, 'raw' | 'provider'> {
  provider: LinkOrigin;
  /**
   * Whether this is an ordinary shortened link or a message-in-a-URL.
   *
   * Absent on records written before the distinction existed, which are all
   * shortened links — the message links came from the Pastes feature and were
   * never in this store. Read it through {@link linkKind}, which supplies that
   * default in one place.
   */
  kind?: LinkKind;
  /** When this browser created it. ISO. The one consistent sort key. */
  recordedAt: string;
  /**
   * Whether this app can edit or delete it. True for anonymous links (is.gd,
   * token-less TinyURL) and for message links, so the page renders the row
   * without controls that could only fail.
   */
  readOnly?: boolean;
}

/** A record's kind, defaulting older records to the ordinary case. */
export function linkKind(record: ShortLinkRecord): LinkKind {
  return record.kind ?? 'shortened';
}

function load(): ShortLinkRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as ShortLinkRecord[]) : [];
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class ShortenerHistory {
  readonly records = signal<ShortLinkRecord[]>(load());

  /** Records for one provider, newest first. */
  forProvider(provider: ShortenerId): ShortLinkRecord[] {
    return this.records().filter((record) => record.provider === provider);
  }

  /**
   * Record a link this app just created.
   *
   * `readOnly` is supplied by the caller rather than inferred from the provider,
   * because it is a fact about *this link* and not about the service. A TinyURL
   * link made anonymously stays permanent even after the user adds a token
   * later — the token grants no authority over links it did not create.
   */
  add(link: ShortLink, options: { readOnly?: boolean } = {}): ShortLinkRecord {
    const { raw, ...rest } = link;
    void raw;
    const record: ShortLinkRecord = {
      ...rest,
      // Everything created through this store is an ordinary shortened link;
      // message links come from the Pastes feature and are never added here.
      kind: 'shortened',
      recordedAt: new Date().toISOString(),
      ...(options.readOnly ? { readOnly: true } : {}),
    };
    // Replace rather than duplicate when the same link is created twice — which
    // Short.io does deliberately, handing back the existing link for a repeated
    // destination.
    const others = this.records().filter(
      (existing) =>
        !(existing.provider === record.provider && existing.providerId === record.providerId),
    );
    this.persist([record, ...others]);
    return record;
  }

  update(provider: ShortenerId, providerId: string, changes: Partial<ShortLinkRecord>): void {
    this.persist(
      this.records().map((record) =>
        record.provider === provider && record.providerId === providerId
          ? { ...record, ...changes }
          : record,
      ),
    );
  }

  remove(provider: ShortenerId, providerId: string): void {
    this.persist(
      this.records().filter(
        (record) => !(record.provider === provider && record.providerId === providerId),
      ),
    );
  }

  /** Drop every record for one provider — used when it is forgotten in settings. */
  clearProvider(provider: ShortenerId): void {
    this.persist(this.records().filter((record) => record.provider !== provider));
  }

  private persist(records: ShortLinkRecord[]): void {
    const bounded = records.slice(0, MAX_RECORDS);
    this.records.set(bounded);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
    } catch {
      // Unlike a paste, a short link is recoverable: it is still listed on the
      // provider, and the page shows the provider's copy. Losing the local
      // record costs ordering, not the link, so a quota failure is not escalated
      // to the user the way `PasteHistory` must escalate its own.
    }
  }
}

/**
 * Combine what the provider reports with what this browser remembers.
 *
 * The provider wins on every field it supplies, because it is the live state:
 * a link edited elsewhere, or expired, or deleted, should read that way here.
 * The local record contributes two things the provider cannot — links it has no
 * API to report, and `recordedAt` for stable ordering.
 *
 * Deleted-on-the-provider links are a deliberate exception to "provider wins".
 * A link that is missing from a *filtered or paginated* list is not evidence it
 * was deleted, so absence never removes a local record; only an explicit delete
 * through this app does.
 */
export function mergeLinks(
  fromProvider: readonly ShortLink[],
  fromHistory: readonly ShortLinkRecord[],
): ShortLinkRecord[] {
  const merged = new Map<string, ShortLinkRecord>();

  for (const record of fromHistory) {
    merged.set(`${record.provider}:${record.providerId}`, record);
  }

  for (const link of fromProvider) {
    const key = `${link.provider}:${link.providerId}`;
    const existing = merged.get(key);
    const { raw, ...rest } = link;
    void raw;
    merged.set(key, {
      ...rest,
      // Keep the local creation time when there is one; otherwise fall back to
      // the provider's, and finally to now so sorting never sees undefined.
      recordedAt: existing?.recordedAt ?? link.createdAt ?? new Date().toISOString(),
    });
  }

  return [...merged.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}
