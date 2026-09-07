import { computed, inject, Injectable, signal } from '@angular/core';
import { MediaAttachment } from './models';
import { accountScopeSuffix } from './account-scope';
import { Auth } from './auth';
import { Server } from './server';

/** Poll state carried in a draft (mirrors the composer's poll builder). */
export interface DraftPoll {
  options: string[];
  multiple: boolean;
  expiresIn: number;
}

/**
 * A saved composer state. Media attachments are deliberately absent: uploads
 * only exist server-side as transient ids, so they can't survive in a draft.
 */
export interface Draft {
  id: string;
  updatedAt: string;
  /** Thread segments; index 0 is the primary post. */
  segments: string[];
  spoilerText: string;
  sensitive: boolean;
  visibility: string;
  poll: DraftPoll | null;
  /** ISO 639-1 code, or empty/absent to let the server infer it. */
  postLanguage?: string;
  inReplyToId?: string;
  quotedStatusId?: string;
  /**
   * Publishing destination. Missing on drafts saved before provider-aware compose.
   *
   * Spelled out rather than importing `PostTarget`: compose imports *this*
   * module, so pointing back at it would make a cycle. Keep the two in step —
   * a target missing here is a compile error at the save site, which is the
   * right place to find out. A target that is no longer valid does not need
   * removing here, since restoring one is already filtered through
   * `Compose.restorableTarget`.
   */
  target?: 'fedi' | 'bsky' | 'both' | 'paste' | 'blog' | 'blogger' | 'hugo';
  /** Paste-service id, deliberately separate so another pastebin can be added later. */
  pasteProviderId?: string;
  pasteLanguage?: string;
  pasteExpiry?: string;
}

export type DraftSnapshot = Omit<Draft, 'id' | 'updatedAt'>;

// i18n drafts.saveFailed: Could not save the draft in this browser. The original has been kept. Free some browser storage and try again.
// i18n drafts.removeFailed: Could not remove the draft from this browser. Please try again.

/** Result of a local-storage mutation. Callers must not assume an attempted write was durable. */
export type DraftStorageOutcome = { durable: true } | { durable: false; error: unknown };

export type DraftSaveOutcome = DraftStorageOutcome & { id: string; updatedAt: string };
export type DraftUpdateOutcome = DraftStorageOutcome & {
  updated: boolean;
  updatedAt?: string;
  /** Another tab changed this row after this store loaded it. */
  conflict?: boolean;
};

/** Media carried across one in-app publish handoff; never written to localStorage. */
export interface DraftMedia {
  media: MediaAttachment;
  description: string;
  /** Original bytes, needed when a Bluesky leg uploads its own blob. */
  file?: File;
}

/** A post handed from /drafts to the composer by "Edit for post". */
export interface DraftHandoff {
  snapshot: DraftSnapshot;
  /**
   * Set when this came from a post-to-self draft. Publishing it for real leaves
   * a duplicate private copy sitting in the DM tab, so the composer offers to
   * delete that copy — but only *after* the publish succeeds. See the composer's
   * `pendingSelfCleanup`.
   */
  selfStatusId?: string;
  /** Uploaded/local media is safe only for the one live navigation. */
  media?: DraftMedia[];
  /** datetime-local value already reviewed in the writing wizard. */
  scheduleAt?: string;
  /** The destination choice was the final confirmation; send as soon as seeded. */
  publishImmediately?: boolean;
}

const DRAFTS_KEY = 'mockingbird_drafts';
const AUTOSAVE_KEY = 'mockingbird_compose_autosave';

/** True when a snapshot has anything worth keeping. */
export function draftHasContent(d: DraftSnapshot): boolean {
  return d.segments.some((s) => s.trim() !== '') || d.spoilerText.trim() !== '' || !!d.poll;
}

/**
 * A blank draft, ready to be typed into.
 *
 * Exists so "start writing" has one definition of empty rather than one per
 * caller: a snapshot built field-by-field at each call site drifts the moment
 * {@link Draft} grows a field, and the drift shows up as a draft that silently
 * loses a setting. Visibility is a parameter because the only sensible default
 * is the user's, which this module has no business reaching for.
 */
export function emptyDraftSnapshot(visibility: string): DraftSnapshot {
  return {
    segments: [''],
    spoilerText: '',
    sensitive: false,
    visibility,
    poll: null,
  };
}

/**
 * Drafts live in localStorage only — mainline Mastodon has no drafts API, and
 * Mockingbird must work unchanged against mastodon.social.
 *
 * Two stores: a named drafts list (explicit "Save draft", shown on /drafts),
 * and a per-context autosave slot so a stray reload never eats a half-written
 * post. Context keys are 'new', 'reply:<id>' or 'quote:<id>'.
 */
export class AccountDrafts {
  private readonly draftsKey: string;
  private readonly autosaveKey: string;
  readonly drafts;

  constructor(namespace: string) {
    this.draftsKey = `${DRAFTS_KEY}${namespace}`;
    this.autosaveKey = `${AUTOSAVE_KEY}${namespace}`;
    this.drafts = signal<Draft[]>(loadJson<Draft[]>(this.draftsKey) ?? []);
    window.addEventListener('storage', (event) => {
      if (event.storageArea === localStorage && event.key === this.draftsKey) {
        this.drafts.set(loadJson<Draft[]>(this.draftsKey) ?? []);
      }
    });
  }

  get(id: string): Draft | undefined {
    return this.drafts().find((d) => d.id === id);
  }

  /** Add a snapshot to the drafts list (newest first) and return its id. */
  save(snapshot: DraftSnapshot): DraftSaveOutcome {
    const draft: Draft = {
      ...snapshot,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      updatedAt: new Date().toISOString(),
    };
    // Re-read at mutation time. A store can live for hours while another tab
    // adds rows; writing its cached signal would replace that tab's whole list.
    const current = loadJson<Draft[]>(this.draftsKey) ?? this.drafts();
    const next = [draft, ...current.filter((item) => item.id !== draft.id)];
    const outcome = storeJson(this.draftsKey, next);
    if (outcome.durable) {
      this.drafts.set(next);
    }
    return { id: draft.id, updatedAt: draft.updatedAt, ...outcome };
  }

  /**
   * Overwrite an existing draft in place, keeping its id and list position.
   *
   * Without this, editing a saved draft and saving it again meant `save()` — a
   * second row with the same text, and no way to tell which one is current. The
   * writing workspace edits one draft over a long session, so "save" there has
   * to mean *this* draft rather than another copy of it.
   *
   * Position is preserved rather than bumping the draft to the top: in a list
   * you are working *through*, having the row you just touched jump out from
   * under the cursor is worse than having it stay put. `updatedAt` still
   * advances, so anything that sorts by time can order it however it likes.
   *
   * Returns false when the id is gone — deleted in another tab, or from
   * `/drafts` while the workspace held it — so the caller can save a fresh copy
   * rather than silently discarding the user's edit.
   */
  update(id: string, snapshot: DraftSnapshot, expectedUpdatedAt: string): DraftUpdateOutcome {
    const current = loadJson<Draft[]>(this.draftsKey) ?? this.drafts();
    const stored = current.find((draft) => draft.id === id);
    if (!stored) {
      return { durable: true, updated: false };
    }
    // Do not silently replace an edit made in another tab. The writing page
    // responds by saving this editor as a second draft, retaining both copies.
    if (expectedUpdatedAt !== stored.updatedAt) {
      this.drafts.set(current);
      return { durable: true, updated: false, conflict: true };
    }
    // Wall-clock resolution is only milliseconds. Two sequential tab writes in
    // one tick must still have distinct versions or the later editor cannot
    // detect that its baseline is stale.
    const updatedAt = new Date(
      Math.max(Date.now(), Date.parse(stored.updatedAt) + 1),
    ).toISOString();
    const next = current.map((draft) => (draft.id === id ? { ...snapshot, id, updatedAt } : draft));
    const outcome = storeJson(this.draftsKey, next);
    if (outcome.durable) {
      this.drafts.set(next);
    }
    return {
      updated: outcome.durable,
      updatedAt: outcome.durable ? updatedAt : undefined,
      ...outcome,
    };
  }

  remove(id: string): DraftStorageOutcome {
    const current = loadJson<Draft[]>(this.draftsKey) ?? this.drafts();
    const next = current.filter((draft) => draft.id !== id);
    const outcome = storeJson(this.draftsKey, next);
    if (outcome.durable) {
      this.drafts.set(next);
    }
    return outcome;
  }

  // --- composer handoff ---

  /**
   * A snapshot waiting to be picked up by the next composer that opens.
   *
   * "Edit for post" has to move a whole post — segments, spoiler, poll, paste
   * metadata — from /drafts across a route change into the composer. Putting
   * that in the URL is out (a 500-character post is not a query param), and
   * saving it as a real draft is out too, because the whole point is that the
   * source is left alone rather than converted. So it rides in memory for the
   * one navigation, and the composer drains it on seed.
   *
   * Deliberately not persisted: a snapshot that outlived a reload would
   * reappear in an unrelated composer later, which is worse than losing a
   * navigation that failed anyway.
   */
  private readonly handoffSlot = signal<DraftHandoff | null>(null);

  /** Whether a snapshot is waiting, without consuming it. */
  readonly hasHandoff = computed(() => this.handoffSlot() !== null);

  /** Park a snapshot for the next composer to open. */
  handoff(
    snapshot: DraftSnapshot,
    selfStatusId?: string,
    options: Omit<DraftHandoff, 'snapshot' | 'selfStatusId'> = {},
  ): void {
    this.handoffSlot.set({ snapshot, selfStatusId, ...options });
  }

  /** Take the parked handoff, if any, clearing it so it seeds exactly once. */
  takeHandoff(): DraftHandoff | null {
    const handoff = this.handoffSlot();
    if (handoff) {
      this.handoffSlot.set(null);
    }
    return handoff;
  }

  // --- autosave slots ---

  autosave(contextKey: string, snapshot: DraftSnapshot): DraftStorageOutcome {
    const slots = loadJson<Record<string, DraftSnapshot>>(this.autosaveKey) ?? {};
    if (draftHasContent(snapshot)) {
      slots[contextKey] = snapshot;
    } else {
      delete slots[contextKey];
    }
    return storeJson(this.autosaveKey, slots);
  }

  loadAutosave(contextKey: string): DraftSnapshot | null {
    const slots = loadJson<Record<string, DraftSnapshot>>(this.autosaveKey) ?? {};
    return slots[contextKey] ?? null;
  }

  clearAutosave(contextKey: string): DraftStorageOutcome {
    const slots = loadJson<Record<string, DraftSnapshot>>(this.autosaveKey) ?? {};
    if (contextKey in slots) {
      delete slots[contextKey];
      return storeJson(this.autosaveKey, slots);
    }
    return { durable: true };
  }
}

/** Root readers follow the active account; writing surfaces capture an owned store. */
@Injectable({ providedIn: 'root' })
export class Drafts {
  private readonly auth = inject(Auth);
  private readonly server = inject(Server);
  private readonly stores = new Map<string, AccountDrafts>();
  private readonly active = computed(() => {
    this.auth.kind();
    this.auth.token();
    this.auth.account();
    const server = encodeURIComponent(this.server.baseUrl() || location.origin);
    const namespace = `_${server}${accountScopeSuffix() || '_signed_out'}`;
    let store = this.stores.get(namespace);
    if (!store) {
      store = new AccountDrafts(namespace);
      this.stores.set(namespace, store);
    }
    return store;
  });
  readonly drafts = computed(() => this.active().drafts());
  readonly hasHandoff = computed(() => this.active().hasHandoff());

  forCurrentAccount(): AccountDrafts {
    return this.active();
  }
  get(id: string): Draft | undefined {
    return this.active().get(id);
  }
  save(snapshot: DraftSnapshot): DraftSaveOutcome {
    return this.active().save(snapshot);
  }
  update(id: string, snapshot: DraftSnapshot, expectedUpdatedAt: string): DraftUpdateOutcome {
    return this.active().update(id, snapshot, expectedUpdatedAt);
  }
  remove(id: string): DraftStorageOutcome {
    return this.active().remove(id);
  }
  autosave(contextKey: string, snapshot: DraftSnapshot): DraftStorageOutcome {
    return this.active().autosave(contextKey, snapshot);
  }
  loadAutosave(contextKey: string): DraftSnapshot | null {
    return this.active().loadAutosave(contextKey);
  }
  clearAutosave(contextKey: string): DraftStorageOutcome {
    return this.active().clearAutosave(contextKey);
  }
  handoff(
    snapshot: DraftSnapshot,
    selfStatusId?: string,
    options: Omit<DraftHandoff, 'snapshot' | 'selfStatusId'> = {},
  ): void {
    this.active().handoff(snapshot, selfStatusId, options);
  }
  takeHandoff(): DraftHandoff | null {
    return this.active().takeHandoff();
  }
}

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function storeJson(key: string, value: unknown): DraftStorageOutcome {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { durable: true };
  } catch (error: unknown) {
    return { durable: false, error };
  }
}
