import { computed, inject, Injectable, signal } from '@angular/core';
import {
  credentialExpiresAt,
  ExpiringConnection,
  ExpiringCredential,
  stampCredential,
} from '../credential-lifetime';
import { VaultBridge, type SyncOutcome } from '../vault/vault-bridge';
import { storedOutcome, type VaultReconcileOutcome } from '../vault/vault-reconcile';
import { TwitterSourceEntry, TwitterSourceId, twitterSourceEntry } from './twitter-source';

/**
 * Which Twitter data service this browser uses, and the key for it.
 *
 * Modelled directly on {@link ShortenerSettings}, including the split storage:
 *
 * - `mockingbird_twitter` — the active source id and the recorded verdict of the
 *   direct-reachability probe. Ordinary configuration, exportable.
 * - `mockingbird_twitter_keys` — the API keys, one per source. Secrets: never
 *   exported, and governed by the credential retention policy.
 *
 * ## Why the key is not account-scoped
 *
 * Same reasoning as OpenRouter, the CORS proxy and the shorteners: a paid API
 * subscription belongs to the *human* holding the credit balance, not to a
 * Mastodon persona. Re-pasting it per alt would be busywork protecting nothing,
 * since either alt reads the other's copy out of the same localStorage. The
 * *follows* built on top of it are account-scoped — those are a persona's
 * reading list — but the key is not.
 *
 * ## Why the probe verdict is persisted
 *
 * These services cannot be called from a browser at all: their preflight demands
 * the very API-key header a preflight is forbidden to carry. Re-discovering that
 * on every request would mean a guaranteed-failing request, and several seconds
 * of waiting, before every real one. So the connector page probes *once*, the
 * verdict is recorded here, and the transport reads it instead of re-testing.
 *
 * It lives with the config rather than the key because it is a fact about the
 * *service*, not about the user's credential: it stays true when the key is
 * rotated, and it must survive the key ageing out.
 *
 * ## How the vault sees this store
 *
 * The **whole key map** goes into the vault under one address, exactly as
 * {@link ShortenerSettings} does, and for the same reason: the vault merges at
 * the granularity of a registry base, so the per-source union lives here in
 * {@link mergeKeys} rather than being faked with several addresses.
 *
 * The probe verdict deliberately does **not** sync. It is a fact about *this
 * browser's* network path — a corporate proxy, an extension, a captive portal —
 * and carrying one device's verdict to another would record a block somewhere it
 * was never observed.
 */

const CONFIG_KEY = 'mockingbird_twitter';
const SECRET_KEY = 'mockingbird_twitter_keys';

/** What a direct (unproxied) browser request to a source was observed to do. */
export type DirectReachability =
  /** Never tested from this browser. */
  | 'untested'
  /** A direct request reached the service. Astonishing, but honour it. */
  | 'reachable'
  /** A direct request could not reach it — the expected result. */
  | 'blocked';

/** The non-secret half: which source, and what we learned about reaching it. */
interface StoredTwitterConfig {
  active: TwitterSourceId | null;
  /** Probe verdict per source. */
  direct?: Partial<Record<TwitterSourceId, DirectReachability>>;
}

/** One source's key. */
interface StoredTwitterKey extends ExpiringCredential {
  key: string;
}

type StoredKeys = Partial<Record<TwitterSourceId, StoredTwitterKey>>;

/** The encrypted cross-device record. Reachability remains device-local. */
interface VaultedTwitterSettings {
  v: 1;
  keys: StoredKeys;
  active: TwitterSourceId | null;
}

/** Everything the transport needs to build a request. */
export interface TwitterConfig {
  entry: TwitterSourceEntry;
  /** The auth header to send. Never null: every source here requires a key. */
  auth: { header: string; value: string };
}

@Injectable({ providedIn: 'root' })
export class TwitterSettings implements ExpiringConnection {
  private bridge = inject(VaultBridge);
  private config = signal<StoredTwitterConfig>(readConfig());
  private keys = signal<StoredKeys>(readKeys());

  /**
   * Sources whose keys the vault holds but this browser does not.
   *
   * Populated when local retention expired vaulted keys. Rendered as locked
   * rather than missing — these keys cost money to re-issue, so telling someone
   * to replace one that is still stored is worse here than the usual case.
   */
  readonly needsFetch = signal<TwitterSourceId[]>([]);

  /** The active source's catalog entry, or null when none is chosen. */
  readonly chosen = computed<TwitterSourceEntry | null>(
    () => twitterSourceEntry(this.config().active) ?? null,
  );

  /** Whether the active source is configured well enough to be used. */
  readonly usable = computed(() => this.resolve() !== null);

  /** Source ids holding a key, so the picker can mark them up. */
  readonly configured = computed<TwitterSourceId[]>(
    () =>
      Object.keys(this.keys()).filter(
        (id) => this.keys()[id as TwitterSourceId]?.key,
      ) as TwitterSourceId[],
  );

  constructor() {
    this.enforceLifetime();
  }

  activeId(): TwitterSourceId | null {
    return this.config().active;
  }

  /** Whether a key is stored for a source, without exposing it. */
  hasKey(id: TwitterSourceId): boolean {
    return (this.keys()[id]?.key ?? '') !== '';
  }

  /** What the direct-reachability probe last observed for a source. */
  directReachability(id: TwitterSourceId): DirectReachability {
    return this.config().direct?.[id] ?? 'untested';
  }

  /**
   * Record what a direct probe observed.
   *
   * Called only by {@link TwitterReachability}, after an actual request. The
   * app must never write `blocked` from a guess — the whole point is that the
   * user watched it happen.
   */
  recordDirectReachability(id: TwitterSourceId, verdict: DirectReachability): void {
    const direct = { ...this.config().direct, [id]: verdict };
    this.writeConfig({ ...this.config(), direct });
  }

  /**
   * Everything needed to talk to the active source, or null when it cannot be
   * used yet.
   *
   * Null rather than a half-built config when the key is missing, so callers
   * produce "finish setting up TwitterAPI.io" instead of firing a request that
   * can only 401 — and, since every call costs money, one that would be billed.
   */
  resolve(): TwitterConfig | null {
    const entry = this.chosen();
    if (!entry) {
      return null;
    }
    const key = this.keyFor(entry.id);
    if (!key) {
      return null;
    }
    return {
      entry,
      auth: { header: entry.authHeader, value: `${entry.authPrefix}${key}` },
    };
  }

  /** Why {@link resolve} returned null, phrased for the user. Null when it did not. */
  blockedReason(): string | null {
    const entry = this.chosen();
    if (!entry) {
      return 'No Twitter data service is connected yet.';
    }
    if (!this.hasKey(entry.id)) {
      return `Add your ${entry.label} API key to start reading Twitter data.`;
    }
    return null;
  }

  /** Make a source the active one. Leaves every stored key in place. */
  activate(id: TwitterSourceId): void {
    this.writeConfig({ ...this.config(), active: id });
    void this.syncToVault();
  }

  /** Stop using any source, keeping keys so switching back is cheap. */
  deactivate(): void {
    this.writeConfig({ ...this.config(), active: null });
    void this.syncToVault();
  }

  /**
   * Store a source's key, stamped for the retention policy.
   *
   * An empty key clears the stored one rather than persisting a blank, so the
   * field doubles as the way to remove a key.
   */
  setKey(id: TwitterSourceId, key: string): void {
    const trimmed = key.trim();
    if (!trimmed) {
      this.clearKey(id);
      return;
    }
    const next = { ...this.keys(), [id]: stampCredential({ key: trimmed }) };
    this.writeKeys(next);
    this.needsFetch.update((ids) => ids.filter((pending) => pending !== id));
    // Not awaited: pasting a key should feel instant. Failures are observable
    // via `syncToVault()`, which the settings page calls when the user opts in.
    void this.bridge.writeThrough(SECRET_KEY, serializeVaulted(next, this.activeId()));
  }

  /**
   * One source's key, falling back to the vault on a local miss.
   *
   * `localStorage` first, always — this connector worked before the vault
   * existed and must keep working with it locked, unavailable or never set up.
   *
   * A hit rehydrates the whole map, because the vault stores it as one value and
   * there is no cheaper read.
   */
  private keyFor(id: TwitterSourceId): string {
    const local = this.keys()[id]?.key ?? '';
    if (local) {
      return local;
    }
    const fromVault = this.bridge.readThrough(SECRET_KEY);
    if (!fromVault) {
      return '';
    }
    const remote = parseVaulted(fromVault);
    if (!remote) {
      return '';
    }
    // Merge rather than replace: a key added on this device seconds ago must not
    // be discarded by a stale remote map.
    const merged = mergeKeys(this.keys(), remote.keys);
    this.writeKeys(merged);
    this.needsFetch.set([]);
    return merged[id]?.key ?? '';
  }

  clearKey(id: TwitterSourceId): void {
    const next = { ...this.keys() };
    delete next[id];
    this.writeKeys(next);
    this.needsFetch.update((ids) => ids.filter((pending) => pending !== id));
    if (this.config().active === id) {
      this.writeConfig({ ...this.config(), active: null });
    }
    // The stored copy follows the local one, or clearing a key here is undone by
    // the next sync from another device.
    void this.pushOrRemove(next);
  }

  /**
   * Forget a source entirely: its key and its probe verdict.
   *
   * The verdict goes too, because "forget this service" should leave no trace
   * that it was ever configured — and because a user who disconnects and
   * reconnects is often doing so precisely to re-test it.
   */
  forget(id: TwitterSourceId): void {
    const direct = { ...this.config().direct };
    delete direct[id];
    this.writeConfig({
      active: this.config().active === id ? null : this.config().active,
      direct,
    });
    const keys = { ...this.keys() };
    delete keys[id];
    this.writeKeys(keys);
    this.needsFetch.update((ids) => ids.filter((pending) => pending !== id));
    void this.pushOrRemove(keys);
  }

  /**
   * {@link ExpiringConnection}: apply the local retention policy.
   *
   * Expired keys leave this browser either way; what differs is what that
   * *means*. A vaulted key is locked — the plaintext goes, the source stays
   * configured, and the next {@link resolve} pulls it back. A non-vaulted one is
   * gone, and an active source that just lost its only key is deactivated.
   *
   * The vault copy is deliberately not touched: local expiry is a statement
   * about this browser, and the stored copy has its own clock on the server.
   */
  enforceLifetime(): void {
    const keys = this.keys();
    const kept: StoredKeys = {};
    const locked: TwitterSourceId[] = [];
    let expired = false;

    for (const [id, stored] of Object.entries(keys) as [TwitterSourceId, StoredTwitterKey][]) {
      const verdict = this.bridge.verdictFor(SECRET_KEY, stored?.connectedAt);
      if (verdict.kind === 'keep') {
        kept[id] = stored;
        continue;
      }
      expired = true;
      if (verdict.kind === 'lock') {
        locked.push(id);
      }
    }

    if (!expired) {
      return;
    }
    this.writeKeys(kept);
    this.needsFetch.set(locked);
    const active = this.config().active;
    // A locked source is still connected. Deactivating it would tell the user to
    // reconnect something the next resolve() would have restored on its own.
    if (active && !kept[active] && !locked.includes(active)) {
      this.deactivate();
    }
  }

  /** Push the current key map to the vault and report what happened. */
  async syncToVault(): Promise<SyncOutcome> {
    const keys = this.keys();
    return Object.keys(keys).length
      ? this.bridge.writeThrough(SECRET_KEY, serializeVaulted(keys, this.activeId()))
      : { kind: 'skipped' };
  }

  /**
   * Reconcile the whole provider-key map.
   *
   * Keys union per provider. An empty local provider choice adopts the remote
   * one; two explicit choices remain different rather than one silently
   * replacing the other. Old key-map-only vault records are upgraded here.
   */
  async reconcileVault(): Promise<VaultReconcileOutcome> {
    const localKeys = this.keys();
    const localActive = this.activeId();
    const remoteRaw = this.bridge.readThrough(SECRET_KEY);
    if (!remoteRaw) {
      return Object.keys(localKeys).length
        ? storedOutcome(await this.syncToVault())
        : { kind: 'skipped' };
    }
    const remote = parseVaulted(remoteRaw);
    if (!remote) {
      return { kind: 'failed', message: 'The encrypted Twitter record is unreadable.' };
    }
    const keyConflicts = conflictingSources(localKeys, remote.keys);
    if (keyConflicts.length > 0) {
      return {
        kind: 'conflict',
        message: `Twitter has different non-empty keys for ${keyConflicts.join(', ')} here and in Mawkingbird; neither copy was replaced.`,
      };
    }

    const mergedKeys = mergeKeys(localKeys, remote.keys);
    const inferred = inferSingleSource(mergedKeys);
    const nextLocalActive = localActive ?? remote.active ?? inferred;
    const nextVaultActive = remote.active ?? localActive ?? inferred;
    const localChanged =
      JSON.stringify(mergedKeys) !== JSON.stringify(localKeys) || nextLocalActive !== localActive;

    if (JSON.stringify(mergedKeys) !== JSON.stringify(localKeys)) {
      this.writeKeys(mergedKeys);
      this.needsFetch.set([]);
    }
    if (nextLocalActive !== localActive && nextLocalActive) {
      this.writeConfig({ ...this.config(), active: nextLocalActive });
    }

    const remoteChanged =
      remote.legacy ||
      JSON.stringify(mergedKeys) !== JSON.stringify(remote.keys) ||
      nextVaultActive !== remote.active;
    if (remoteChanged) {
      const stored = await this.bridge.writeThrough(
        SECRET_KEY,
        serializeVaulted(mergedKeys, nextVaultActive),
      );
      if (stored.kind === 'failed') {
        return stored;
      }
    }

    if (Object.keys(localKeys).length === 0 && Object.keys(mergedKeys).length > 0) {
      return { kind: 'restored' };
    }
    return localChanged || remoteChanged ? { kind: 'merged' } : { kind: 'unchanged' };
  }

  /**
   * Mirror a key-map change to the vault.
   *
   * An emptied map removes the stored copy rather than storing an empty object,
   * so disconnecting everything reaches the server instead of leaving a husk
   * that still counts on the settings page.
   */
  private pushOrRemove(next: StoredKeys): Promise<SyncOutcome> {
    return Object.keys(next).length
      ? this.bridge.writeThrough(SECRET_KEY, serializeVaulted(next, this.activeId()))
      : this.bridge.removeThrough(SECRET_KEY);
  }

  /** {@link ExpiringConnection}: when the *active* key ages out. */
  expiresAt(): number | null {
    const active = this.config().active;
    return active ? credentialExpiresAt(this.keys()[active]?.connectedAt) : null;
  }

  private writeConfig(next: StoredTwitterConfig): void {
    this.config.set(next);
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    } catch {
      // Non-persistent, but honour it for this session.
    }
  }

  private writeKeys(next: StoredKeys): void {
    this.keys.set(next);
    try {
      if (Object.keys(next).length) {
        localStorage.setItem(SECRET_KEY, JSON.stringify(next));
      } else {
        localStorage.removeItem(SECRET_KEY);
      }
    } catch {
      // Honoured for this session only.
    }
  }
}

function readConfig(): StoredTwitterConfig {
  const empty: StoredTwitterConfig = { active: null };
  let raw: string | null;
  try {
    raw = localStorage.getItem(CONFIG_KEY);
  } catch {
    return empty;
  }
  if (!raw) {
    return empty;
  }
  try {
    const parsed = JSON.parse(raw) as StoredTwitterConfig;
    // A source we no longer ship is discarded rather than kept dangling.
    const active = twitterSourceEntry(parsed?.active) ? parsed.active : null;
    return { active, direct: parsed?.direct ?? {} };
  } catch {
    return empty;
  }
}

/**
 * Parse a key map read back out of the vault.
 *
 * Same validation as {@link readKeys} — an unknown source id is dropped rather
 * than trusted — without the localStorage backfill, since this map came from
 * another device and is not what this browser has stored.
 */
function parseKeys(raw: string): StoredKeys | null {
  try {
    const parsed = JSON.parse(raw) as StoredKeys;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const kept: StoredKeys = {};
    for (const [id, stored] of Object.entries(parsed)) {
      if (
        twitterSourceEntry(id as TwitterSourceId) &&
        typeof stored?.key === 'string' &&
        stored.key
      ) {
        kept[id as TwitterSourceId] = stored;
      }
    }
    return kept;
  } catch {
    return null;
  }
}

function parseVaulted(raw: string): (VaultedTwitterSettings & { legacy: boolean }) | null {
  try {
    const parsed = JSON.parse(raw) as Partial<VaultedTwitterSettings>;
    if (parsed?.v === 1 && parsed.keys && typeof parsed.keys === 'object') {
      const keys = parseKeys(JSON.stringify(parsed.keys));
      if (!keys) {
        return null;
      }
      const active = twitterSourceEntry(parsed.active as TwitterSourceId)
        ? (parsed.active as TwitterSourceId)
        : null;
      return { v: 1, keys, active, legacy: false };
    }
    if (raw.trimStart().startsWith('{') && 'v' in parsed) {
      return null;
    }
  } catch {
    return null;
  }
  const keys = parseKeys(raw);
  return keys ? { v: 1, keys, active: null, legacy: true } : null;
}

function serializeVaulted(keys: StoredKeys, active: TwitterSourceId | null): string {
  const record: VaultedTwitterSettings = {
    v: 1,
    keys,
    active: active && keys[active] ? active : null,
  };
  return JSON.stringify(record);
}

function inferSingleSource(keys: StoredKeys): TwitterSourceId | null {
  const ids = Object.keys(keys) as TwitterSourceId[];
  return ids.length === 1 ? ids[0] : null;
}

function conflictingSources(mine: StoredKeys, theirs: StoredKeys): TwitterSourceId[] {
  return (Object.keys(mine) as TwitterSourceId[]).filter(
    (id) => mine[id]?.key && theirs[id]?.key && mine[id]?.key !== theirs[id]?.key,
  );
}

/**
 * Union two key maps, per source.
 *
 * Same rules as the shortener merge, and the same reason: a union loses neither
 * device's source, and a genuine same-source conflict takes the newer
 * `connectedAt`. Ours wins a tie and wins an unreadable stamp, because the local
 * copy is the one the user can see in front of them.
 */
function mergeKeys(mine: StoredKeys, theirs: StoredKeys): StoredKeys {
  const merged: StoredKeys = { ...theirs, ...mine };
  for (const id of Object.keys(merged) as TwitterSourceId[]) {
    const ours = mine[id];
    const remote = theirs[id];
    if (!ours || !remote) {
      continue;
    }
    const ourTime = ours.connectedAt ?? NaN;
    const theirTime = remote.connectedAt ?? NaN;
    if (Number.isFinite(theirTime) && !(ourTime >= theirTime)) {
      merged[id] = remote;
    }
  }
  return merged;
}

function readKeys(): StoredKeys {
  let raw: string | null;
  try {
    raw = localStorage.getItem(SECRET_KEY);
  } catch {
    return {};
  }
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as StoredKeys;
    const kept: StoredKeys = {};
    for (const [id, stored] of Object.entries(parsed ?? {})) {
      if (
        twitterSourceEntry(id as TwitterSourceId) &&
        typeof stored?.key === 'string' &&
        stored.key
      ) {
        kept[id as TwitterSourceId] = stored;
      }
    }
    // Backfill stamps on records written before the retention policy existed.
    let backfilled = false;
    for (const id of Object.keys(kept) as TwitterSourceId[]) {
      const record = kept[id];
      if (record && typeof record.connectedAt !== 'number') {
        kept[id] = { ...record, connectedAt: Date.now() };
        backfilled = true;
      }
    }
    if (backfilled) {
      try {
        localStorage.setItem(SECRET_KEY, JSON.stringify(kept));
      } catch {
        // The in-memory stamps still bound this session.
      }
    }
    return kept;
  } catch {
    try {
      localStorage.removeItem(SECRET_KEY);
    } catch {
      // Unreadable and unremovable is still "no keys" in memory.
    }
    return {};
  }
}
