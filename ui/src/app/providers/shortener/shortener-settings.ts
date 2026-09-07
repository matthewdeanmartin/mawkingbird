import { computed, inject, Injectable, signal } from '@angular/core';
import {
  credentialExpiresAt,
  ExpiringConnection,
  ExpiringCredential,
  stampCredential,
} from '../credential-lifetime';
import { VaultBridge, type SyncOutcome } from '../vault/vault-bridge';
import { storedOutcome, type VaultReconcileOutcome } from '../vault/vault-reconcile';
import { ShortenerCatalogEntry, shortenerEntry } from './shortener-catalog';
import { ShortenerId } from './shortener-provider';

/**
 * Which shortener this browser uses, and the key for it.
 *
 * Modelled directly on {@link CorsProxySettings}, including the split storage:
 *
 * - `mockingbird_shortener` — the active provider id and its non-secret options
 *   (the short domain). Ordinary configuration, exportable.
 * - `mockingbird_shortener_keys` — the API keys, one per provider. Secrets:
 *   never exported, and governed by the credential retention policy.
 *
 * ## Why keys are kept per provider while only one is active
 *
 * The spec asks for several services configured with exactly one active. Wiping
 * a key every time you switch would make "try Dub for a week, switch back" mean
 * re-issuing tokens, so keys persist per provider and the active id is a
 * separate, cheap choice. The cost is that a disused key keeps sitting in
 * localStorage, which is precisely what the retention policy is for — each key
 * carries its own `connectedAt` and ages out on its own schedule, whether or not
 * it is the active one.
 *
 * ## Precedence
 *
 * The spec says "when a provider with a key is active, that one takes
 * precedence". Every provider here needs a key, so precedence reduces to: the
 * active provider is used when its key is present, and otherwise the app has no
 * shortener and says so. The pre-existing key-free TinyURL shortener is
 * deliberately *not* a fallback for these — it encodes a whole message into a
 * redirect target and cannot shorten an arbitrary URL on request. It stays in
 * the paste providers where it belongs, and only its history is shared with the
 * Links page.
 *
 * ## Why the key is not account-scoped
 *
 * Same reasoning as OpenRouter and the CORS proxy: a shortener subscription
 * belongs to the human paying for it, not to a Mastodon persona. Re-pasting it
 * per alt would be busywork protecting nothing, since either alt can read the
 * other's copy out of the same localStorage.
 *
 * ## How the vault sees this store
 *
 * The **whole map** goes into the vault under one address, not one entry per
 * provider. The vault's merge granularity is the registry base, so splitting
 * providers across addresses would buy nothing the map does not already give —
 * and the realistic conflict (desktop adds Dub, phone adds Short.io) is settled
 * by {@link mergeKeys} here, which unions the two maps per provider rather than
 * letting the newer whole-map write discard the other's provider.
 *
 * That per-provider union is why the vault read path merges instead of
 * replacing. Taking the remote map wholesale would silently drop a key the user
 * added on this device thirty seconds ago.
 */

const CONFIG_KEY = 'mockingbird_shortener';
const SECRET_KEY = 'mockingbird_shortener_keys';

/** The non-secret half: which provider, and the short domain per provider. */
interface StoredShortenerConfig {
  active: ShortenerId | null;
  /** Short domain per provider. Not a secret — it is in every link you publish. */
  domains?: Partial<Record<ShortenerId, string>>;
}

/** One provider's key. */
interface StoredShortenerKey extends ExpiringCredential {
  key: string;
}

type StoredKeys = Partial<Record<ShortenerId, StoredShortenerKey>>;

/** The encrypted cross-device record required to make a restored key usable. */
interface VaultedShortenerSettings {
  v: 1;
  keys: StoredKeys;
  active: ShortenerId | null;
  domains: Partial<Record<ShortenerId, string>>;
}

/** Everything an adapter needs to build a request. */
export interface ShortenerConfig {
  entry: ShortenerCatalogEntry;
  /**
   * The auth header to send, or null when this request carries no credential.
   *
   * Null is the normal state for is.gd (no accounts exist) and for TinyURL
   * before a token is added. It is not an error case, and the difference matters
   * beyond the header: the proxy disclosure talks about the destination URL,
   * not a credential the request does not carry.
   */
  auth: { header: string; value: string } | null;
  /** The configured short domain, or '' when the provider's default is used. */
  domain: string;
}

@Injectable({ providedIn: 'root' })
export class ShortenerSettings implements ExpiringConnection {
  private bridge = inject(VaultBridge);
  private config = signal<StoredShortenerConfig>(readConfig());
  private keys = signal<StoredKeys>(readKeys());

  /**
   * Providers whose keys the vault holds but this browser does not.
   *
   * Populated when local retention expired vaulted keys. The settings page
   * renders these as locked rather than missing — telling someone to re-paste a
   * key that is still stored is how they go and re-issue a token needlessly.
   */
  readonly needsFetch = signal<ShortenerId[]>([]);

  /** The active provider's catalog entry, or null when none is chosen. */
  readonly chosen = computed<ShortenerCatalogEntry | null>(
    () => shortenerEntry(this.config().active) ?? null,
  );

  /** Whether the active provider is configured well enough to be used. */
  readonly usable = computed(() => this.resolve() !== null);

  /** Provider ids holding a key, so the picker can mark them up. */
  readonly configured = computed<ShortenerId[]>(
    () =>
      Object.keys(this.keys()).filter((id) => this.keys()[id as ShortenerId]?.key) as ShortenerId[],
  );

  constructor() {
    this.enforceLifetime();
  }

  activeId(): ShortenerId | null {
    return this.config().active;
  }

  /** Whether a key is stored for a provider, without exposing it. */
  hasKey(id: ShortenerId): boolean {
    return (this.keys()[id]?.key ?? '') !== '';
  }

  /** The stored short domain for a provider, for the settings form to prefill. */
  domain(id: ShortenerId): string {
    return this.config().domains?.[id] ?? '';
  }

  /**
   * Everything needed to talk to the active provider, or null when it cannot be
   * used yet.
   *
   * Null rather than a half-built config when a *required* key is missing, or
   * when the provider requires a short domain and none is set. Short.io is the
   * case that matters: its create endpoint rejects a request with no domain, and
   * failing here produces "finish setting up Short.io" instead of a validation
   * error from the provider that reads like the destination URL was wrong.
   *
   * A key-less provider resolves happily with `auth: null`. is.gd has no
   * accounts to require one from, and TinyURL works anonymously until a token is
   * added — treating either as unconfigured would make the two zero-setup
   * options the only ones you have to set up.
   */
  resolve(): ShortenerConfig | null {
    const entry = this.chosen();
    if (!entry) {
      return null;
    }
    const key = this.keyFor(entry.id);
    if (entry.keyPolicy === 'required' && !key) {
      return null;
    }
    const domain = this.domain(entry.id);
    if (entry.domainRequired && !domain) {
      return null;
    }
    // `none` never authenticates even if a key somehow got stored against it.
    const usesKey = key && entry.keyPolicy !== 'none' && entry.auth.header;
    return {
      entry,
      auth: usesKey ? { header: entry.auth.header, value: `${entry.auth.prefix}${key}` } : null,
      domain,
    };
  }

  /** Why {@link resolve} returned null, phrased for the user. Null when it did not. */
  blockedReason(): string | null {
    const entry = this.chosen();
    if (!entry) {
      return 'No link shortener is connected yet.';
    }
    if (entry.keyPolicy === 'required' && !this.hasKey(entry.id)) {
      return `Add your ${entry.label} ${entry.keyLabel} to start shortening links.`;
    }
    if (entry.domainRequired && !this.domain(entry.id)) {
      return `${entry.label} needs the short domain from your account before it can create links.`;
    }
    return null;
  }

  /** Make a provider the active one. Leaves every stored key in place. */
  activate(id: ShortenerId): void {
    this.writeConfig({ ...this.config(), active: id });
    void this.syncToVault();
  }

  /** Stop using any shortener, keeping keys so switching back is cheap. */
  deactivate(): void {
    this.writeConfig({ ...this.config(), active: null });
    void this.syncToVault();
  }

  setDomain(id: ShortenerId, domain: string): void {
    const domains = { ...this.config().domains, [id]: domain.trim() };
    this.writeConfig({ ...this.config(), domains });
    void this.syncToVault();
  }

  /**
   * Store a provider's key, stamped for the retention policy.
   *
   * An empty key clears the stored one rather than persisting a blank, so the
   * field doubles as the way to remove a key.
   */
  setKey(id: ShortenerId, key: string): void {
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
    void this.bridge.writeThrough(
      SECRET_KEY,
      serializeVaulted(next, this.activeId(), this.config().domains ?? {}),
    );
  }

  /**
   * One provider's key, falling back to the vault on a local miss.
   *
   * `localStorage` first, always — this connector worked before the vault
   * existed and must keep working with it locked, unavailable or never set up.
   *
   * A hit rehydrates the *whole* map rather than the one provider, because the
   * vault stores it as one value and there is no cheaper read. That also
   * restores the other providers' keys in the same pass, which is what the user
   * expects after unlocking on a second device.
   */
  private keyFor(id: ShortenerId): string {
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

  clearKey(id: ShortenerId): void {
    const next = { ...this.keys() };
    delete next[id];
    this.writeKeys(next);
    this.needsFetch.update((ids) => ids.filter((pending) => pending !== id));
    if (this.config().active === id) {
      this.writeConfig({ ...this.config(), active: null });
    }
    // The stored copy follows the local one. Otherwise clearing a key here is
    // undone by the next sync from another device.
    void this.pushOrRemove(next);
  }

  /** Forget a provider entirely: its key and its domain. */
  forget(id: ShortenerId): void {
    const domains = { ...this.config().domains };
    delete domains[id];
    this.writeConfig({
      active: this.config().active === id ? null : this.config().active,
      domains,
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
   * The keyed-map version of the lock-vs-disconnect split. Expired keys leave
   * this browser either way; what differs is what that *means*. A vaulted key
   * is locked — the plaintext goes, the provider stays configured, and the next
   * {@link resolve} pulls it back. A non-vaulted one is gone for good, and an
   * active provider that just lost its only key is deactivated.
   *
   * The vault copy is deliberately **not** touched here. Local expiry is a
   * statement about this browser, not about the stored copy, which has its own
   * clock on the server.
   */
  enforceLifetime(): void {
    const keys = this.keys();
    const kept: StoredKeys = {};
    const locked: ShortenerId[] = [];
    let expired = false;

    for (const [id, stored] of Object.entries(keys) as [ShortenerId, StoredShortenerKey][]) {
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
    // Only deactivate a provider whose key is really gone. A locked one is still
    // connected, and deactivating it would tell the user to reconnect something
    // the next resolve() would have restored on its own.
    if (active && !kept[active] && !locked.includes(active)) {
      this.deactivate();
    }
  }

  /** Push the current key map to the vault and report what happened. */
  async syncToVault(): Promise<SyncOutcome> {
    const keys = this.keys();
    return Object.keys(keys).length
      ? this.bridge.writeThrough(
          SECRET_KEY,
          serializeVaulted(keys, this.activeId(), this.config().domains ?? {}),
        )
      : { kind: 'skipped' };
  }

  /** Reconcile provider keys plus the non-secret choice/domain needed to use them. */
  async reconcileVault(): Promise<VaultReconcileOutcome> {
    const localKeys = this.keys();
    const localConfig = this.config();
    const remoteRaw = this.bridge.readThrough(SECRET_KEY);
    if (!remoteRaw) {
      return Object.keys(localKeys).length
        ? storedOutcome(await this.syncToVault())
        : { kind: 'skipped' };
    }
    const remote = parseVaulted(remoteRaw);
    if (!remote) {
      return { kind: 'failed', message: 'The encrypted link-shortener record is unreadable.' };
    }
    const keyConflicts = conflictingProviders(localKeys, remote.keys);
    if (keyConflicts.length > 0) {
      return {
        kind: 'conflict',
        message: `Link shorteners have different non-empty keys for ${keyConflicts.join(', ')} here and in Mawkingbird; neither copy was replaced.`,
      };
    }

    const mergedKeys = mergeKeys(localKeys, remote.keys);
    const inferred = inferSingleProvider(mergedKeys);
    const nextLocalActive = localConfig.active ?? remote.active ?? inferred;
    const nextVaultActive = remote.active ?? localConfig.active ?? inferred;
    // Remote fills missing local domains; an explicit local value remains local.
    const nextLocalDomains = { ...remote.domains, ...localConfig.domains };
    // Local fills missing remote domains; an explicit remote value remains remote.
    const nextVaultDomains = { ...localConfig.domains, ...remote.domains };
    const localChanged =
      JSON.stringify(mergedKeys) !== JSON.stringify(localKeys) ||
      nextLocalActive !== localConfig.active ||
      JSON.stringify(nextLocalDomains) !== JSON.stringify(localConfig.domains ?? {});

    if (JSON.stringify(mergedKeys) !== JSON.stringify(localKeys)) {
      this.writeKeys(mergedKeys);
      this.needsFetch.set([]);
    }
    if (
      nextLocalActive !== localConfig.active ||
      JSON.stringify(nextLocalDomains) !== JSON.stringify(localConfig.domains ?? {})
    ) {
      this.writeConfig({ active: nextLocalActive, domains: nextLocalDomains });
    }

    const remoteChanged =
      remote.legacy ||
      JSON.stringify(mergedKeys) !== JSON.stringify(remote.keys) ||
      nextVaultActive !== remote.active ||
      JSON.stringify(nextVaultDomains) !== JSON.stringify(remote.domains);
    if (remoteChanged) {
      const stored = await this.bridge.writeThrough(
        SECRET_KEY,
        serializeVaulted(mergedKeys, nextVaultActive, nextVaultDomains),
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
   * An emptied map removes the stored copy rather than storing `{}`, so
   * "disconnect everything" reaches the server instead of leaving an empty
   * husk that still counts on the settings page.
   */
  private pushOrRemove(next: StoredKeys): Promise<SyncOutcome> {
    return Object.keys(next).length
      ? this.bridge.writeThrough(
          SECRET_KEY,
          serializeVaulted(next, this.activeId(), this.config().domains ?? {}),
        )
      : this.bridge.removeThrough(SECRET_KEY);
  }

  /**
   * {@link ExpiringConnection}: when the *active* key ages out.
   *
   * The active one specifically, because that is the connection the settings
   * page is describing. A dormant key for a provider you are not using expires
   * on its own schedule and is not what "expires in 12 days" should mean.
   */
  expiresAt(): number | null {
    const active = this.config().active;
    return active ? credentialExpiresAt(this.keys()[active]?.connectedAt) : null;
  }

  private writeConfig(next: StoredShortenerConfig): void {
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

function readConfig(): StoredShortenerConfig {
  const empty: StoredShortenerConfig = { active: null };
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
    const parsed = JSON.parse(raw) as StoredShortenerConfig;
    // A provider we no longer ship is discarded rather than kept dangling.
    const active = shortenerEntry(parsed?.active) ? parsed.active : null;
    return { active, domains: parsed?.domains ?? {} };
  } catch {
    return empty;
  }
}

/**
 * Parse a key map read back out of the vault.
 *
 * Same validation as {@link readKeys} — an unknown provider id is dropped
 * rather than trusted — but without the localStorage backfill, since this map
 * came from another device and is not what this browser has stored.
 */
function parseKeys(raw: string): StoredKeys | null {
  try {
    const parsed = JSON.parse(raw) as StoredKeys;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const kept: StoredKeys = {};
    for (const [id, stored] of Object.entries(parsed)) {
      if (shortenerEntry(id as ShortenerId) && typeof stored?.key === 'string' && stored.key) {
        kept[id as ShortenerId] = stored;
      }
    }
    return kept;
  } catch {
    return null;
  }
}

function parseVaulted(raw: string): (VaultedShortenerSettings & { legacy: boolean }) | null {
  try {
    const parsed = JSON.parse(raw) as Partial<VaultedShortenerSettings>;
    if (parsed?.v === 1 && parsed.keys && typeof parsed.keys === 'object') {
      const keys = parseKeys(JSON.stringify(parsed.keys));
      if (!keys) {
        return null;
      }
      const active = shortenerEntry(parsed.active as ShortenerId)
        ? (parsed.active as ShortenerId)
        : null;
      const domains = parsed.domains && typeof parsed.domains === 'object' ? parsed.domains : {};
      return { v: 1, keys, active, domains, legacy: false };
    }
    if (raw.trimStart().startsWith('{') && 'v' in parsed) {
      return null;
    }
  } catch {
    return null;
  }
  const keys = parseKeys(raw);
  return keys ? { v: 1, keys, active: null, domains: {}, legacy: true } : null;
}

function serializeVaulted(
  keys: StoredKeys,
  active: ShortenerId | null,
  domains: Partial<Record<ShortenerId, string>>,
): string {
  const record: VaultedShortenerSettings = {
    v: 1,
    keys,
    active: active && keys[active] ? active : null,
    domains,
  };
  return JSON.stringify(record);
}

function inferSingleProvider(keys: StoredKeys): ShortenerId | null {
  const ids = Object.keys(keys) as ShortenerId[];
  return ids.length === 1 ? ids[0] : null;
}

function conflictingProviders(mine: StoredKeys, theirs: StoredKeys): ShortenerId[] {
  return (Object.keys(mine) as ShortenerId[]).filter(
    (id) => mine[id]?.key && theirs[id]?.key && mine[id]?.key !== theirs[id]?.key,
  );
}

/**
 * Union two key maps, per provider.
 *
 * The realistic conflict is "desktop added Dub while the phone added Short.io",
 * and a union loses neither. When both sides hold the *same* provider, the
 * newer `connectedAt` wins — matching `mergeBundles`, and for the same reason:
 * whole-map last-write-wins would silently discard the other device's provider.
 *
 * Ours wins a tie and wins an unreadable stamp, because the local copy is the
 * one the user can see in front of them.
 */
function mergeKeys(mine: StoredKeys, theirs: StoredKeys): StoredKeys {
  const merged: StoredKeys = { ...theirs, ...mine };
  for (const id of Object.keys(merged) as ShortenerId[]) {
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
      if (shortenerEntry(id as ShortenerId) && typeof stored?.key === 'string' && stored.key) {
        kept[id as ShortenerId] = stored;
      }
    }
    // Backfill stamps on records written before the retention policy existed.
    // `ensureStamped` handles one credential; this store holds a map of them, so
    // the backfill is per entry and the map is persisted once at the end.
    let backfilled = false;
    for (const id of Object.keys(kept) as ShortenerId[]) {
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
