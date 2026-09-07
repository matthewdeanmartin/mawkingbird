/**
 * What Mawkingbird Plus is actually holding, and what it has actually done.
 *
 * ## Why this exists
 *
 * Sync is invisible when it works. Settings save, collections match, and
 * nothing anywhere says whether a single byte reached the server — so
 * "is this doing anything at all?" had no answer outside the unit tests. That
 * is a bad place for a paid feature to be: it is indistinguishable from broken,
 * and the only person who can tell the difference is the one reading the code.
 *
 * Two sections, because there are two different questions and conflating them
 * serves neither:
 *
 * - **{@link storage} — is it working?** Local versus remote, side by side,
 *   with the drift between them named. This is diagnostics in the ordinary
 *   sense: something to look at when you suspect a problem.
 * - **{@link usage} — is it worth it?** What the subscription has actually
 *   done. A renewal decision turns on this and on nothing in the section above.
 *
 * ## Why nothing here writes
 *
 * Reading diagnostics must never change what it reports. `inspect()` on the
 * adoption runner adopts whatever it can settle, which would make opening this
 * panel a mutation — and one that silently resolves the very difference the
 * user opened the panel to look at. So this uses the read-only halves: the
 * manifest, `localCount()`, and each collection's loaded count. Acting on a
 * difference is a separate, deliberate button.
 */

import { computed, inject, Injectable, signal } from '@angular/core';
import { exportPortableConfig, portableKeys } from '../../portable-config';
import { CollectionAdoptionRunner, type AdoptableCollection } from './collection-adoption-runner';
import { ProfileClient, type ProfileManifest } from './profile-client';
import { ProfileAccountKey } from './profile-account-key';
import { ProfileFeeds } from './profile-feeds';
import { ProfileLists } from './profile-lists';
import { ProfileSync } from './profile-sync';
import { ProfileTrust } from './profile-trust';
import { PageDiagnostics } from '../../page-diagnostics';

/** One collection, both sides. */
export interface CollectionRow {
  collection: AdoptableCollection;
  label: string;
  local: number;
  /** Null when the account's copy could not be read. */
  remote: number | null;
  /**
   * Why the account's copy could not be read, when it could not.
   *
   * Carried to the row rather than logged only. A cell reading "0" for a
   * collection whose read actually failed is a quiet lie, and it is the lie
   * that makes someone press Sync to fix a problem that is not the one they
   * have.
   */
  error?: string;
}

/** The settings document, both sides. */
export interface SettingsRow {
  /** Keys this browser would upload, and their size. */
  localKeys: number;
  localBytes: number;
  /** What the account holds, or null when nothing is stored. */
  remoteBytes: number | null;
  remoteRevision: number | null;
  remoteUpdatedAt: string | null;
  /** True when this browser has changes it has not pushed. */
  dirty: boolean;
}

/** One social persona stored beneath the global Plus identity. */
export interface AccountCollectionRow {
  accountKey: string;
  label: string;
  active: boolean;
  /** False when the active persona has not written any collection index yet. */
  stored: boolean;
  trust: number;
  feeds: number;
  lists: number;
}

export type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

const COLLECTION_LABELS: Record<AdoptableCollection, string> = {
  trust: 'Trusted accounts',
  feeds: 'RSS subscriptions',
  lists: 'Client lists',
};

@Injectable({ providedIn: 'root' })
export class PlusDiagnostics {
  private client = inject(ProfileClient);
  private sync = inject(ProfileSync);
  private adoption = inject(CollectionAdoptionRunner);
  private profileTrust = inject(ProfileTrust);
  private profileFeeds = inject(ProfileFeeds);
  private profileLists = inject(ProfileLists);
  private accountKey = inject(ProfileAccountKey);
  /**
   * Console logging, the same as everywhere else in this module.
   *
   * This panel exists because sync is invisible when it works. A panel that is
   * *itself* invisible when it misbehaves would have the same problem one level
   * up — so every read logs what it found, and a bug report can be a console
   * paste rather than a description.
   */
  private log = inject(PageDiagnostics);

  readonly state = signal<LoadState>('idle');
  readonly error = signal<string | null>(null);

  private manifest = signal<ProfileManifest | null>(null);
  private collections = signal<CollectionRow[]>([]);
  private activeAccount = signal<string | null>(null);

  /** The settings document, local against remote. */
  readonly settings = computed<SettingsRow>(() => {
    // The same export the pusher would send, so the local figure is what would
    // actually go up rather than a count of everything in localStorage.
    const local = exportPortableConfig(localStorage, true);
    const localBytes = new Blob([JSON.stringify(local)]).size;
    const stored = this.manifest()?.settings;
    return {
      localKeys: Object.keys(local.values ?? {}).length,
      localBytes,
      remoteBytes: stored?.size ?? null,
      remoteRevision: stored?.revision ?? null,
      remoteUpdatedAt: stored?.updatedAt ?? null,
      dirty: this.sync.record().dirty === true,
    };
  });

  readonly collectionRows = computed(() => this.collections());

  /** A recognisable name for the persona Sync now will affect. */
  readonly activeAccountLabel = computed(() => accountLabel(this.activeAccount()));

  /**
   * All collection namespaces held by the Plus identity, plus the active
   * persona when it has never saved anything yet.
   */
  readonly accountRows = computed<AccountCollectionRow[]>(() => {
    const active = this.activeAccount();
    const rows = (this.manifest()?.accounts ?? []).map((account) => ({
      accountKey: account.accountKey,
      label: accountLabel(account.accountKey),
      active: account.accountKey === active,
      stored: true,
      trust: account.collections['trust']?.count ?? 0,
      feeds: account.collections['feeds']?.count ?? 0,
      lists: account.collections['lists']?.count ?? 0,
    }));
    if (active !== null && !rows.some((row) => row.accountKey === active)) {
      rows.push({
        accountKey: active,
        label: accountLabel(active),
        active: true,
        stored: false,
        trust: 0,
        feeds: 0,
        lists: 0,
      });
    }
    return rows.sort(
      (a, b) => Number(b.active) - Number(a.active) || a.label.localeCompare(b.label),
    );
  });

  /** Personas that have actually written at least one remote collection index. */
  readonly storedAccountCount = computed(() => (this.manifest()?.accounts ?? []).length);

  /** How many keys this browser considers portable at all. */
  readonly portableKeyCount = computed(() => portableKeys('private').length);

  readonly quota = computed(() => this.manifest()?.quota ?? null);
  readonly conflicts = computed(() => this.manifest()?.conflicts ?? null);

  /**
   * The account is reachable but refuses writes.
   *
   * Straight from the manifest, so it reflects what the *server* thinks rather
   * than what a token claim says. Those can disagree — a `tier: 'plus'` mint
   * against a Worker that answers `readOnly: true` is exactly the contradiction
   * this field exists to make visible instead of leaving it to be discovered by
   * pressing a button that then 402s.
   */
  readonly readOnly = computed(() => this.manifest()?.readOnly === true);

  /**
   * Why a sync cannot be attempted, or null when it can.
   *
   * Separate from {@link drifted}: something can genuinely differ *and* be
   * impossible to fix, and reporting the difference while hiding the reason is
   * how a user ends up pressing a button that quietly does nothing. That was a
   * real reported bug, not a hypothetical.
   */
  readonly blocked = computed<string | null>(() => {
    if (this.state() !== 'ready') {
      return null;
    }
    if (this.readOnly()) {
      return (
        'Your account is reachable but is refusing writes — the server does not ' +
        'currently consider it a supporter. Nothing can be uploaded until that is ' +
        'resolved, and nothing already stored has been lost.'
      );
    }
    return null;
  });

  /**
   * Whether anything looks out of step, so the UI can offer to fix it.
   *
   * Deliberately conservative about what counts as drift. An unpushed local
   * change is drift; a collection whose remote copy could not be read is
   * **not**, because a failed read is a fact about the network rather than
   * about the data, and offering to "fix" it would push over a copy nobody has
   * seen.
   */
  readonly drifted = computed(() => {
    if (this.settings().dirty) {
      return true;
    }
    if (this.settings().remoteBytes === null && this.settings().localKeys > 0) {
      // Nothing stored at all while this browser has settings to store.
      return true;
    }
    return this.collections().some((row) => row.remote !== null && row.remote !== row.local);
  });

  /**
   * Read everything, changing nothing.
   *
   * One manifest request plus one read per collection. Called when the panel is
   * opened rather than on a timer: this is a page someone visits when they are
   * suspicious, and polling it would add background requests to answer a
   * question nobody is asking most of the time.
   */
  async load(): Promise<void> {
    this.state.set('loading');
    this.error.set(null);
    this.activeAccount.set(this.accountKey.current());

    this.log.info('PlusDiagnostics', 'load:start', {
      syncState: this.sync.record().state,
      syncing: this.sync.syncing(),
      dirty: this.sync.record().dirty === true,
      revision: this.sync.record().revision ?? null,
      etag: this.sync.record().etag ?? null,
    });

    const manifest = await this.client.manifest({ includeAccounts: true });
    if (manifest.kind === 'ok') {
      this.log.info('PlusDiagnostics', 'load:manifest', {
        hasSettings: manifest.value.settings !== undefined,
        revision: manifest.value.settings?.revision ?? null,
        size: manifest.value.settings?.size ?? null,
        quotaUsed: manifest.value.quota.used,
        conflicts: manifest.value.conflicts,
        readOnly: manifest.value.readOnly,
        accounts: (manifest.value.accounts ?? []).map((account) => ({
          accountKey: account.accountKey,
          collections: account.collections,
        })),
      });
      this.manifest.set(manifest.value);
    } else if (manifest.kind === 'absent') {
      this.log.info('PlusDiagnostics', 'load:manifest-absent', {});
      // Nothing stored yet is a legitimate answer, not a failure.
      this.manifest.set(null);
    } else {
      this.log.warn('PlusDiagnostics', 'load:manifest-failed', {
        kind: manifest.kind,
        message: describe(manifest),
      });
      this.manifest.set(null);
      this.error.set(describe(manifest));
      this.state.set('failed');
      return;
    }

    const rows: CollectionRow[] = [];
    for (const collection of ['trust', 'feeds', 'lists'] as AdoptableCollection[]) {
      const remote = this.remoteFor(collection);
      await remote.load();
      const failure = remote.error();
      if (failure) {
        // Logged per collection: "could not read" on screen is one cell, and
        // which collection failed and why is the part a report needs.
        this.log.warn('PlusDiagnostics', 'load:collection-failed', {
          collection,
          message: failure,
        });
      }
      rows.push({
        collection,
        label: COLLECTION_LABELS[collection],
        local: this.adoption.localCount(collection),
        ...(failure ? { error: failure } : {}),
        // Null rather than zero on a failed read. Zero would read as "the
        // account holds nothing", which is a different and much more alarming
        // claim than "this could not be checked".
        remote: failure ? null : remote.count(),
      });
    }
    this.collections.set(rows);
    this.state.set('ready');
    this.log.info('PlusDiagnostics', 'load:ready', {
      collections: rows.map((row) => ({
        collection: row.collection,
        local: row.local,
        remote: row.remote,
      })),
      settings: this.settings(),
      drifted: this.drifted(),
    });
  }

  private remoteFor(collection: AdoptableCollection) {
    switch (collection) {
      case 'trust':
        return this.profileTrust;
      case 'feeds':
        return this.profileFeeds;
      case 'lists':
        return this.profileLists;
    }
  }
}

function describe(result: { kind: string; message?: string }): string {
  return result.message ?? 'The account could not be reached.';
}

/** Human-readable without losing the stable key used by the service. */
export function accountLabel(key: string | null): string {
  if (key === null) {
    return 'the current account';
  }
  if (key === 'anonymous') {
    return 'Anonymous';
  }
  if (key.startsWith('mastodon:')) {
    const identity = key.slice('mastodon:'.length);
    const slash = identity.indexOf('/');
    if (slash > 0 && slash < identity.length - 1) {
      return `@${identity.slice(slash + 1)}@${identity.slice(0, slash)}`;
    }
  }
  if (key.startsWith('bsky:')) {
    return `Bluesky · ${key.slice('bsky:'.length)}`;
  }
  return key;
}
