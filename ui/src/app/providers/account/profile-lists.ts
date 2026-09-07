import { computed, inject, Injectable, signal } from '@angular/core';
import { ClientList } from '../../lists/client-lists';
import { PageDiagnostics } from '../../page-diagnostics';
import { ProfileCollections } from './profile-collections';
import { isDurableBlock, WriteBlock, writeBlockFor } from './write-block';
import type { CollectionResult } from './profile-collections';

/**
 * Lists stored on a Mawkingbird Plus account.
 *
 * The same shape as {@link ClientLists}, so a caller does not learn where its
 * lists live — which is what makes this a *provider* rather than a feature. The
 * differences are the ones that cannot be hidden:
 *
 * - **Loading is real.** `ClientLists` reads localStorage in its constructor and
 *   is never not-ready. This one starts empty and fills in, so `loaded()` exists
 *   and a caller that renders "no lists" before checking it will lie to the user.
 * - **Writes can fail.** Offline, lapsed, or signed out. Mutations return a
 *   result rather than being fire-and-forget.
 * - **There is no local copy.** Nothing is mirrored to localStorage, on purpose.
 *   A mirror is the seed of exactly the divergence the provider model was chosen
 *   to avoid.
 *
 * ## Optimism, and why it is bounded
 *
 * Mutators update the signal immediately and reconcile on failure by reloading
 * from the server. The alternative — awaiting a round trip before the list moves
 * — makes every interaction feel broken on a slow connection. The bound is that
 * a failure never leaves an invented local state behind: it refetches, so the
 * signal always ends up agreeing with the server rather than with our hopes.
 */

const COLLECTION = 'lists';

/**
 * What a copy can end as.
 *
 * Narrower than {@link CollectionResult} on purpose: a batch write cannot come
 * back `absent` or `unchanged`, and leaving those in the type forces every
 * caller to handle two states that never occur — or, worse, to reach for
 * `.message` on one that has none.
 */
export type CopyOutcome =
  | { kind: 'ok'; value: { written: number } }
  | { kind: 'payment-required'; message: string }
  | { kind: 'unauthenticated'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'no-account'; message: string }
  | { kind: 'failed'; message: string };

/** A list as stored server-side. Identical to a local one by design. */
export type ProfileList = ClientList;

@Injectable({ providedIn: 'root' })
export class ProfileLists {
  private collections = inject(ProfileCollections);
  private diagnostics = inject(PageDiagnostics);

  private state = signal<ProfileList[]>([]);
  private ready = signal(false);
  private failure = signal<string | null>(null);
  private writable = signal(true);
  private block = signal<WriteBlock | null>(null);

  readonly lists = computed(() => this.state());
  readonly count = computed(() => this.state().length);

  /**
   * Whether the collection has been fetched.
   *
   * Distinct from "is empty". A caller showing "you have no lists" before this
   * is true is showing an empty state for data that is still arriving.
   */
  readonly loaded = computed(() => this.ready());

  /** The last error, or null. Shown rather than swallowed. */
  readonly error = computed(() => this.failure());

  /**
   * False when the account cannot write — lapsed, or signed out.
   *
   * Driven by an actual refusal rather than guessed from tier, so the UI goes
   * read-only for the same reason the server does.
   */
  readonly canWrite = computed(() => this.writable());

  /**
   * Why writes are blocked, or null.
   *
   * Exposed alongside `canWrite` so the UI can say what actually happened. A
   * bare boolean is what let three screens describe every refusal as a lapsed
   * subscription — the reason was thrown away before the template saw it.
   */
  readonly writeBlock = computed(() => this.block());

  get(id: string): ProfileList | null {
    return this.state().find((list) => list.id === id) ?? null;
  }

  listsWith(handle: string): ProfileList[] {
    const needle = handle.toLowerCase();
    return this.state().filter((list) => list.memberHandles.includes(needle));
  }

  hasMember(id: string, handle: string): boolean {
    return this.get(id)?.memberHandles.includes(handle.toLowerCase()) ?? false;
  }

  /**
   * Fetch the collection.
   *
   * Safe to call repeatedly — a page that loads lists on entry should just call
   * it. Reloading is one small request when nothing changed.
   */
  async load(): Promise<void> {
    const result = await this.collections.index<ProfileList>(COLLECTION);
    if (result.kind === 'ok') {
      this.state.set(
        result.value.index.items
          .map((item) => item.inline)
          .filter((list): list is ProfileList => isList(list)),
      );
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

  async create(title: string): Promise<ProfileList | null> {
    const list: ProfileList = {
      // Prefixed so an id cannot be mistaken for a local one if the two are ever
      // seen side by side, and because the copy flow keeps ids distinct.
      id: `mwk-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(),
      memberHandles: [],
      createdAt: new Date().toISOString(),
    };
    const previous = this.state();
    this.state.set([...previous, list]);

    const result = await this.collections.put(COLLECTION, list.id, list);
    if (result.kind !== 'ok') {
      this.state.set(previous);
      this.note(result);
      return null;
    }
    this.diagnostics.info('ProfileLists', 'list:create', { id: list.id });
    return list;
  }

  async rename(id: string, title: string): Promise<boolean> {
    const next = title.trim();
    const list = this.get(id);
    if (!next || !list) {
      return false;
    }
    return this.write({ ...list, title: next });
  }

  async remove(id: string): Promise<boolean> {
    const previous = this.state();
    this.state.set(previous.filter((list) => list.id !== id));

    const result = await this.collections.remove(COLLECTION, id);
    if (result.kind !== 'ok') {
      this.state.set(previous);
      this.note(result);
      return false;
    }
    this.diagnostics.info('ProfileLists', 'list:remove', { id });
    return true;
  }

  async setMember(id: string, handle: string, member: boolean): Promise<boolean> {
    const list = this.get(id);
    if (!list) {
      return false;
    }
    const handles = new Set(list.memberHandles);
    const needle = handle.toLowerCase();
    if (member) {
      handles.add(needle);
    } else {
      handles.delete(needle);
    }
    return this.write({ ...list, memberHandles: [...handles] });
  }

  /**
   * Copy lists in from another store, without touching what is already here.
   *
   * Copy, never move: the source keeps its lists. Someone trying Plus who then
   * cancels should find their local lists exactly where they left them, and a
   * "helpful" cleanup would be the one irreversible step in an otherwise
   * reversible feature.
   *
   * Ids are regenerated so running this twice produces duplicates rather than
   * silently overwriting a list the user has since edited on the server. Noisy
   * and recoverable beats quiet and lossy.
   */
  async copyIn(lists: ProfileList[]): Promise<CopyOutcome> {
    if (lists.length === 0) {
      return { kind: 'ok', value: { written: 0 } };
    }
    const copies = lists.map((list) => ({
      ...list,
      id: `mwk-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    }));

    // One index write rather than N racing each other.
    const result = await this.collections.batch(
      COLLECTION,
      copies.map((list) => ({ op: 'put' as const, id: list.id, value: list })),
    );
    if (result.kind !== 'ok') {
      this.note(result);
      // Mapped rather than passed through: `batch` is typed for the whole
      // collection API, and the two states it cannot return here would otherwise
      // leak into every caller's branching.
      return result.kind === 'absent' || result.kind === 'unchanged'
        ? { kind: 'failed', message: 'The profile service gave an unexpected answer.' }
        : result;
    }
    await this.load();
    this.diagnostics.info('ProfileLists', 'list:copy-in', { copied: copies.length });
    return { kind: 'ok', value: { written: result.value.written } };
  }

  /**
   * Write lists through as they are, keeping their ids.
   *
   * The counterpart to {@link copyIn}, and deliberately not the same thing.
   * `copyIn` regenerates ids so that running it twice duplicates rather than
   * silently overwriting — right when the user is *copying* lists in. This is
   * for reconciliation, where a list carrying an id the account already knows is
   * the same list and must land on top of it.
   *
   * One batch, so N lists cost one index write rather than N racing each other.
   */
  async writeAll(lists: ProfileList[]): Promise<boolean> {
    if (lists.length === 0) {
      return true;
    }
    const result = await this.collections.batch(
      COLLECTION,
      lists.map((list) => ({ op: 'put' as const, id: list.id, value: list })),
    );
    if (result.kind !== 'ok') {
      this.note(result);
      return false;
    }
    await this.load();
    this.diagnostics.info('ProfileLists', 'list:write-all', { count: lists.length });
    return true;
  }

  /** Replace one list, rolling back if the write is refused. */
  private async write(list: ProfileList): Promise<boolean> {
    const previous = this.state();
    this.state.set(previous.map((existing) => (existing.id === list.id ? list : existing)));

    const result = await this.collections.put(COLLECTION, list.id, list);
    if (result.kind !== 'ok') {
      this.state.set(previous);
      this.note(result);
      return false;
    }
    this.failure.set(null);
    return true;
  }

  /**
   * Record why something failed, and go read-only when that is the reason.
   *
   * A lapsed subscription is not an error to retry — it is a state — so it sets
   * `canWrite` false rather than leaving the UI to discover it one refused write
   * at a time.
   */
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
    this.diagnostics.info('ProfileLists', 'request:failed', { kind: result.kind });
  }

  /** Reset to construction state. For tests and for signing out. */
  reset(): void {
    this.state.set([]);
    this.ready.set(false);
    this.failure.set(null);
    this.writable.set(true);
    this.block.set(null);
  }
}

function isList(value: unknown): value is ProfileList {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ProfileList>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    Array.isArray(candidate.memberHandles)
  );
}
