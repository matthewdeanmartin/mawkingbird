import { Injectable, computed, signal } from '@angular/core';
import { Account } from './models';

const STORE_KEY = 'mockingbird_local_moderation';
const STATE_VERSION = 1;

/** A far-future timestamp standing in for "no expiry" (block / mute forever). */
const FOREVER = Number.MAX_SAFE_INTEGER;

/** One suppressed account: why, and when the suppression lifts. */
interface Entry {
  /** 'block' hides the account entirely; 'mute' just filters their posts. */
  kind: 'block' | 'mute';
  /** Epoch-ms expiry; FOREVER means indefinite. Expired entries purge on load. */
  expiresAt: number;
  /** Display handle, kept so a management UI can show who's suppressed. */
  acct: string;
}

interface StoredState {
  version: typeof STATE_VERSION;
  /** account key (see {@link accountKey}) → entry */
  entries: Record<string, Entry>;
}

/**
 * A stable identity for an account across providers and read routes. The same
 * person reached through the anonymous provider's API vs RSS route, or across
 * page loads, keeps the same `acct` (`user@host`), so key on that first; fall
 * back to `url`, then the (route-specific, least stable) `id`.
 */
export function accountKey(account: Pick<Account, 'acct' | 'url' | 'id'>): string {
  return (account.acct || account.url || account.id).toLowerCase();
}

function load(): StoredState {
  const empty: StoredState = { version: STATE_VERSION, entries: {} };
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORE_KEY) ?? 'null',
    ) as Partial<StoredState> | null;
    if (
      parsed?.version !== STATE_VERSION ||
      typeof parsed.entries !== 'object' ||
      !parsed.entries
    ) {
      return empty;
    }
    const now = Date.now();
    const alive: Record<string, Entry> = {};
    for (const [key, entry] of Object.entries(parsed.entries)) {
      if (
        entry &&
        (entry.kind === 'block' || entry.kind === 'mute') &&
        typeof entry.expiresAt === 'number' &&
        entry.expiresAt > now
      ) {
        alive[key] = { kind: entry.kind, expiresAt: entry.expiresAt, acct: entry.acct ?? key };
      }
    }
    const next: StoredState = { version: STATE_VERSION, entries: alive };
    // Persist the purge so expired entries don't linger in storage.
    if (Object.keys(alive).length !== Object.keys(parsed.entries).length) {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    }
    return next;
  } catch {
    return empty;
  }
}

/**
 * Client-side block/mute of accounts, persisted in localStorage with timed
 * expiry. Mastodon has server-side block/mute, but they need write scope and
 * don't exist at all for the read-only Anonymous provider — so Mockingbird
 * keeps its own list that works against any instance and for anonymous browsing.
 *
 * A blocked or muted author's posts are filtered out of feeds client-side; the
 * difference is intent (block = "hide this person", mute = "not right now"),
 * surfaced in the UI. Mutes carry a duration; blocks are indefinite by default.
 * Expired entries purge on load and lazily on read.
 */
@Injectable({ providedIn: 'root' })
export class LocalModeration {
  private state = signal<StoredState>(load());

  /** Live view of the current entries (drives card/feed re-evaluation). */
  readonly entries = computed(() => this.state().entries);

  /** Every currently-suppressed account, for a management view. */
  readonly list = computed(() =>
    Object.entries(this.entries()).map(([key, entry]) => ({ key, ...entry })),
  );

  private entryFor(account: Pick<Account, 'acct' | 'url' | 'id'>): Entry | undefined {
    const entry = this.entries()[accountKey(account)];
    return entry && entry.expiresAt > Date.now() ? entry : undefined;
  }

  /** True when this account's posts should be suppressed (blocked or muted). */
  isSuppressed(account: Pick<Account, 'acct' | 'url' | 'id'>): boolean {
    return !!this.entryFor(account);
  }

  isBlocked(account: Pick<Account, 'acct' | 'url' | 'id'>): boolean {
    return this.entryFor(account)?.kind === 'block';
  }

  isMuted(account: Pick<Account, 'acct' | 'url' | 'id'>): boolean {
    return this.entryFor(account)?.kind === 'mute';
  }

  /** Block indefinitely (hide this person). */
  block(account: Pick<Account, 'acct' | 'url' | 'id'>): void {
    this.put(account, {
      kind: 'block',
      expiresAt: FOREVER,
      acct: account.acct || account.url || account.id,
    });
  }

  /** Mute for `seconds` (null = indefinitely). */
  mute(account: Pick<Account, 'acct' | 'url' | 'id'>, seconds: number | null): void {
    const expiresAt = seconds === null ? FOREVER : Date.now() + seconds * 1000;
    this.put(account, { kind: 'mute', expiresAt, acct: account.acct || account.url || account.id });
  }

  /** Lift any block/mute on this account. */
  clear(account: Pick<Account, 'acct' | 'url' | 'id'>): void {
    const key = accountKey(account);
    this.state.update((prev) => {
      if (!(key in prev.entries)) {
        return prev;
      }
      const entries = { ...prev.entries };
      delete entries[key];
      return this.persist({ ...prev, entries });
    });
  }

  private put(account: Pick<Account, 'acct' | 'url' | 'id'>, entry: Entry): void {
    const key = accountKey(account);
    this.state.update((prev) =>
      this.persist({ ...prev, entries: { ...prev.entries, [key]: entry } }),
    );
  }

  private persist(next: StoredState): StoredState {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
    return next;
  }
}
