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
  /** account key (see {@link moderationKey}) → entry */
  entries: Record<string, Entry>;
}

/**
 * A stable identity for an account across providers and read routes. The same
 * person reached through the anonymous provider's API vs RSS route, or across
 * page loads, keeps the same `acct` (`user@host`), so key on that first; fall
 * back to `url`, then the (route-specific, least stable) `id`. TrustedAccounts
 * keys on this too, so it must not change shape.
 */
export function accountKey(account: Pick<Account, 'acct' | 'url' | 'id'>): string {
  return (account.acct || account.url || account.id).toLowerCase();
}

/**
 * The mute list's key: {@link accountKey}, except that a bare `acct` — which
 * Mastodon gives accounts on the reader's own server (`mistersql`) — is
 * qualified with the host of the account's profile URL. A bare key would match
 * every `mistersql` on every server.
 */
export function moderationKey(account: Pick<Account, 'acct' | 'url' | 'id'>): string {
  const acct = account.acct ?? '';
  if (acct && !acct.includes('@') && account.url) {
    try {
      return `${acct}@${new URL(account.url).host}`.toLowerCase();
    } catch {
      // Fall through to the bare form.
    }
  }
  return accountKey(account);
}

/**
 * The key entries were stored under before bare accts were qualified. Still
 * read, so existing mutes keep working, and always cleared alongside the new key.
 */
const legacyKey = accountKey;

/** Who is reading: the signed-in session, and their own account if known. */
export interface ModerationViewer {
  /** Changes whenever the active account does (a token, or the provider kind). */
  key: string;
  self: Pick<Account, 'id' | 'acct'> | null;
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
  private viewerSource = signal<() => ModerationViewer>(() => ({ key: '', self: null }));
  /**
   * Who is reading, read lazily from what Auth hands over (see {@link useViewer})
   * so that asking never forces the signed-in account to resolve early.
   */
  readonly viewer = computed(() => this.viewerSource()());

  /** Auth supplies the reader; tests may supply their own. */
  useViewer(source: () => ModerationViewer): void {
    this.viewerSource.set(source);
  }
  /**
   * Authors the viewer muted or blocked *on their server* during this visit,
   * by viewer key. Never stored: the server is the record, and it filters
   * them from the next fetch. This only removes posts already on screen.
   */
  private session = signal<Record<string, ReadonlySet<string>>>({});

  /** Live view of the current entries (drives card/feed re-evaluation). */
  readonly entries = computed(() => this.state().entries);

  /** Every currently-suppressed account, for a management view. */
  readonly list = computed(() =>
    Object.entries(this.state().entries).map(([key, entry]) => ({ key, ...entry })),
  );

  /** The reader's own account is never hidden from them by this store. */
  private isSelf(account: Pick<Account, 'acct' | 'url' | 'id'>): boolean {
    const self = this.viewer().self;
    return (
      !!self &&
      !!account.id &&
      account.id === self.id &&
      (account.acct ?? '').toLowerCase() === (self.acct ?? '').toLowerCase()
    );
  }

  private entryFor(account: Pick<Account, 'acct' | 'url' | 'id'>): Entry | undefined {
    if (this.isSelf(account)) return undefined;
    const entries = this.state().entries;
    const entry = entries[moderationKey(account)] ?? entries[legacyKey(account)];
    return entry && entry.expiresAt > Date.now() ? entry : undefined;
  }

  /** True when this account's posts should be suppressed (blocked or muted). */
  isSuppressed(account: Pick<Account, 'acct' | 'url' | 'id'>): boolean {
    return !!this.entryFor(account) || this.hiddenThisSession(account);
  }

  /** Browser-local block (not a server block). */
  isBlocked(account: Pick<Account, 'acct' | 'url' | 'id'>): boolean {
    return this.entryFor(account)?.kind === 'block';
  }

  /** Browser-local mute (not a server mute). */
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

  /**
   * The viewer just muted or blocked this author on their server: hide what
   * is already on screen, for this account only, until the page reloads.
   * Any browser-local entry is dropped so there is only one mute to undo.
   */
  hideAfterServerAction(account: Pick<Account, 'acct' | 'url' | 'id'>): void {
    this.clear(account);
    const viewer = this.viewer().key;
    const key = moderationKey(account);
    this.session.update((all) => ({ ...all, [viewer]: new Set([...(all[viewer] ?? []), key]) }));
  }

  /** Lift any block/mute on this account, local or for this session. */
  clear(account: Pick<Account, 'acct' | 'url' | 'id'>): void {
    const keys = [moderationKey(account), legacyKey(account)];
    const viewer = this.viewer().key;
    if (this.session()[viewer]?.has(keys[0])) {
      this.session.update((all) => {
        const next = new Set(all[viewer]);
        next.delete(keys[0]);
        return { ...all, [viewer]: next };
      });
    }
    this.state.update((prev) => {
      if (!keys.some((key) => key in prev.entries)) {
        return prev;
      }
      const entries = { ...prev.entries };
      for (const key of keys) delete entries[key];
      return this.persist({ ...prev, entries });
    });
  }

  private hiddenThisSession(account: Pick<Account, 'acct' | 'url' | 'id'>): boolean {
    return (
      !this.isSelf(account) && !!this.session()[this.viewer().key]?.has(moderationKey(account))
    );
  }

  private put(account: Pick<Account, 'acct' | 'url' | 'id'>, entry: Entry): void {
    const key = moderationKey(account);
    const legacy = legacyKey(account);
    this.state.update((prev) => {
      const entries = { ...prev.entries, [key]: entry };
      if (legacy !== key) delete entries[legacy];
      return this.persist({ ...prev, entries });
    });
  }

  private persist(next: StoredState): StoredState {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      // Still applies for this page load without storage.
    }
    return next;
  }
}
