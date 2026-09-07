import { computed, inject, Injectable, signal } from '@angular/core';
import { PageDiagnostics } from '../../page-diagnostics';
import { ProfileCollections } from './profile-collections';
import { isDurableBlock, WriteBlock, writeBlockFor } from './write-block';
import type { CollectionResult } from './profile-collections';
import type { TrustLevel } from '../../trusted-accounts';

/**
 * Trusted accounts, stored on a Mawkingbird Plus account.
 *
 * Mirrors {@link TrustedAccounts}, which keeps the same judgements in
 * localStorage per Mastodon persona. Both are per-persona: who you trust as your
 * main says nothing about who you trust as your alt, and the collection is
 * account-scoped on the server for the same reason.
 *
 * ## One object per trusted account, plus one for the settings
 *
 * Not one document holding everything, even though the local store is shaped
 * that way. An index is rewritten in full on every write, so a single document
 * would mean trusting one person rewrites the entire trust list; separate
 * objects mean it rewrites one small object and the index entry pointing at it.
 *
 * The level and the two "from anyone" flags are genuinely one decision, so they
 * share a single object under {@link SETTINGS_ID}. It is a reserved id, and an
 * entry can never collide with it because entry ids carry an `acct-` prefix.
 *
 * ## Trust is not a secret, but it is sensitive
 *
 * A list of people you have made a judgement about reads very differently out of
 * context, which is why the local key is classified `private`. Nothing here
 * changes that: it is stored under the user's own prefix and is never exported
 * into a portable config.
 */

const COLLECTION = 'trust';

/** The reserved object id holding the level and the global flags. */
export const SETTINGS_ID = 'settings';

/** One trusted account, as stored server-side. */
export interface ProfileTrustEntry {
  /** The account key this judgement is about. */
  key: string;
  /** Display handle, so a management list can name who is trusted. */
  acct: string;
  /** When they were trusted, epoch-ms. */
  since: number;
}

/** The level and flags that apply beyond the named list. */
export interface ProfileTrustSettings {
  level: TrustLevel;
  expandAllCw: boolean;
  showAllSensitive: boolean;
}

const DEFAULT_SETTINGS: ProfileTrustSettings = {
  level: 'none',
  expandAllCw: false,
  showAllSensitive: false,
};

@Injectable({ providedIn: 'root' })
export class ProfileTrust {
  private collections = inject(ProfileCollections);
  private diagnostics = inject(PageDiagnostics);

  private entryState = signal<ProfileTrustEntry[]>([]);
  private settingsState = signal<ProfileTrustSettings>({ ...DEFAULT_SETTINGS });
  private ready = signal(false);
  private failure = signal<string | null>(null);
  private writable = signal(true);
  private block = signal<WriteBlock | null>(null);

  readonly entries = computed(() => this.entryState());
  readonly settings = computed(() => this.settingsState());
  readonly count = computed(() => this.entryState().length);
  /** Whether the collection has been fetched. Distinct from "is empty". */
  readonly loaded = computed(() => this.ready());
  readonly error = computed(() => this.failure());
  readonly canWrite = computed(() => this.writable());

  /**
   * Why writes are blocked, or null.
   *
   * Exposed alongside `canWrite` so the UI can say what actually happened. A
   * bare boolean is what let three screens describe every refusal as a lapsed
   * subscription — the reason was thrown away before the template saw it.
   */
  readonly writeBlock = computed(() => this.block());

  trusts(key: string): boolean {
    return this.entryState().some((entry) => entry.key === key);
  }

  async load(): Promise<void> {
    const result = await this.collections.index<ProfileTrustEntry | ProfileTrustSettings>(
      COLLECTION,
    );
    if (result.kind === 'ok') {
      const items = result.value.index.items;
      this.entryState.set(
        items
          .filter((item) => item.id !== SETTINGS_ID)
          .map((item) => item.inline)
          .filter((entry): entry is ProfileTrustEntry => isEntry(entry)),
      );
      const stored = items.find((item) => item.id === SETTINGS_ID)?.inline;
      this.settingsState.set(isSettings(stored) ? stored : { ...DEFAULT_SETTINGS });
      this.ready.set(true);
      this.failure.set(null);
      this.writable.set(true);
      this.block.set(null);
      return;
    }
    if (result.kind === 'unchanged') {
      this.ready.set(true);
      return;
    }
    this.note(result);
  }

  /** Trust an account, or update the handle recorded for one already trusted. */
  async trust(key: string, acct: string): Promise<boolean> {
    const id = entryId(key);
    if (!id) {
      return false;
    }
    const entry: ProfileTrustEntry = {
      key,
      acct,
      // Kept from the existing entry when there is one: re-trusting somebody
      // already trusted is a handle refresh, not a new judgement, and moving the
      // date would reorder a list that sorts by it.
      since: this.entryState().find((existing) => existing.key === key)?.since ?? Date.now(),
    };
    const previous = this.entryState();
    this.entryState.set([...previous.filter((existing) => existing.key !== key), entry]);

    const result = await this.collections.put(COLLECTION, id, entry);
    if (result.kind !== 'ok') {
      this.entryState.set(previous);
      this.note(result);
      return false;
    }
    return true;
  }

  async untrust(key: string): Promise<boolean> {
    const id = entryId(key);
    if (!id) {
      return false;
    }
    const previous = this.entryState();
    this.entryState.set(previous.filter((entry) => entry.key !== key));

    const result = await this.collections.remove(COLLECTION, id);
    if (result.kind !== 'ok') {
      this.entryState.set(previous);
      this.note(result);
      return false;
    }
    return true;
  }

  async saveSettings(settings: ProfileTrustSettings): Promise<boolean> {
    const previous = this.settingsState();
    this.settingsState.set(settings);

    const result = await this.collections.put(COLLECTION, SETTINGS_ID, settings);
    if (result.kind !== 'ok') {
      this.settingsState.set(previous);
      this.note(result);
      return false;
    }
    return true;
  }

  /**
   * Upload a whole local trust list in one write.
   *
   * One batch rather than N puts racing for the index, the same as
   * `ProfileLists.copyIn`. Entries already stored under the same account key are
   * replaced rather than duplicated: a judgement about a person is not something
   * you can hold twice.
   */
  async replaceAll(entries: ProfileTrustEntry[], settings: ProfileTrustSettings): Promise<boolean> {
    const operations = entries
      .map((entry) => ({ entry, id: entryId(entry.key) }))
      .filter((pair): pair is { entry: ProfileTrustEntry; id: string } => pair.id !== null)
      .map(({ entry, id }) => ({ op: 'put' as const, id, value: entry as unknown }));
    operations.push({ op: 'put' as const, id: SETTINGS_ID, value: settings as unknown });

    const result = await this.collections.batch(COLLECTION, operations);
    if (result.kind !== 'ok') {
      this.note(result);
      return false;
    }
    await this.load();
    this.diagnostics.info('ProfileTrust', 'trust:upload', { count: entries.length });
    return true;
  }

  private note(result: CollectionResult<unknown>): void {
    if (result.kind === 'ok' || result.kind === 'unchanged') {
      return;
    }
    const blocked = writeBlockFor(result);
    if (blocked) {
      this.block.set(blocked);
      // Only a durable refusal latches read-only. A transport failure that
      // flipped this would leave the UI making a claim about the account long
      // after the network came back.
      if (isDurableBlock(blocked)) {
        this.writable.set(false);
      }
    }
    if (result.kind === 'absent') {
      // Nothing stored is not a failure; it is an empty collection.
      this.ready.set(true);
      this.failure.set(null);
      return;
    }
    this.failure.set(result.message);
    this.diagnostics.info('ProfileTrust', 'request:failed', { kind: result.kind });
  }

  /** Reset to construction state. For tests and for signing out. */
  reset(): void {
    this.entryState.set([]);
    this.settingsState.set({ ...DEFAULT_SETTINGS });
    this.ready.set(false);
    this.failure.set(null);
    this.writable.set(true);
    this.block.set(null);
  }
}

/**
 * A legal object id for an account key.
 *
 * Account keys look like `mastodon:example.social/alice` — the colon and the
 * slash are both illegal in an object id, and the slash would additionally put a
 * path segment into an R2 key. Hashed for the same reasons as `feedId`: always
 * legal, always the same length, and the readable form is stored inside the
 * object anyway.
 *
 * The `acct-` prefix is what keeps an entry from ever colliding with
 * {@link SETTINGS_ID}.
 */
export function entryId(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) {
    return null;
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i);
    // The FNV prime via shifts: a plain multiply exceeds 2^53 and silently
    // loses the low bits that make the hash a hash.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return `acct-${hash.toString(36)}-${trimmed.length.toString(36)}`;
}

function isEntry(value: unknown): value is ProfileTrustEntry {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ProfileTrustEntry>;
  return (
    typeof candidate.key === 'string' &&
    typeof candidate.acct === 'string' &&
    typeof candidate.since === 'number'
  );
}

function isSettings(value: unknown): value is ProfileTrustSettings {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ProfileTrustSettings>;
  return (
    typeof candidate.level === 'string' &&
    typeof candidate.expandAllCw === 'boolean' &&
    typeof candidate.showAllSensitive === 'boolean'
  );
}
