import { computed, inject, Injectable, signal } from '@angular/core';
import {
  credentialExpiresAt,
  ensureStamped,
  ExpiringConnection,
  ExpiringCredential,
  stampCredential,
} from '../credential-lifetime';
import {
  availableCorsProxies,
  CorsProxyEntry,
  CorsProxyId,
  corsProxyEntry,
} from './cors-proxy-catalog';
import { FeatureFlagId, FeatureFlags, proxyFeatureFlag } from '../../feature-flags';
import { VaultBridge, type SyncOutcome } from '../vault/vault-bridge';
import { SupporterStatus } from '../account/supporter-status';
import { storedOutcome, type VaultReconcileOutcome } from '../vault/vault-reconcile';

/**
 * Which CORS proxy this browser uses, and the key for it.
 *
 * ## Storage shape
 *
 * Two keys, split on sensitivity, the same way `mockingbird_bsky_credentials`
 * is split from `mockingbird_bsky_profile`:
 *
 * - `mockingbird_cors_proxy` — the chosen id and any custom URL template.
 *   Public-ish configuration, exportable.
 * - `mockingbird_cors_proxy_key` — the API key and custom header name. A
 *   secret, never exported, and subject to the credential retention policy.
 *
 * ## Why the key is not account-scoped
 *
 * Same reasoning as {@link OpenRouterSession}: a proxy subscription belongs to
 * the *human* paying for it, not to a Mastodon persona. It is the same key
 * whichever account you are signed in as, and making you re-paste it per alt
 * would be busywork protecting nothing — the alt can read the other copy out of
 * the same localStorage regardless. Registered `suffix: 'none'`.
 *
 * ## Why the key expires
 *
 * A paid proxy key is a billable credential: whoever reads it out of this
 * origin's localStorage can spend the owner's quota. That puts it in exactly
 * the same class as the GitHub and Raindrop tokens, so it carries a
 * `connectedAt` stamp and this service implements {@link ExpiringConnection}.
 * The *choice* of proxy is not a secret and survives the key ageing out — the
 * user re-pastes a key rather than reconfiguring from scratch.
 */

const CONFIG_KEY = 'mockingbird_cors_proxy';
const SECRET_KEY = 'mockingbird_cors_proxy_key';

/** The non-secret half: which proxy, and how to reach it if it is a custom one. */
interface StoredCorsProxyConfig {
  id: CorsProxyId;
  /** For `custom` only: the URL template, with `{url}` where the target goes. */
  customTemplate?: string;
  /** For `custom` only: whether to percent-encode the target. */
  customEncodeTarget?: boolean;
}

/** The secret half. Absent when the chosen proxy needs no key. */
interface StoredCorsProxyKey extends ExpiringCredential {
  /** The header value — the actual secret. */
  key: string;
  /** For `custom` only: the header name the user's proxy expects. */
  customHeader?: string;
}

/** The encrypted record needed to make a restored custom/keyed proxy usable. */
interface VaultedCorsProxySettings {
  v: 1;
  secret: StoredCorsProxyKey;
  config: StoredCorsProxyConfig | null;
}

/** Everything a request builder needs, resolved from both halves. */
export interface CorsProxyConfig {
  entry: CorsProxyEntry;
  /** The template to use — the catalog's, or the user's for `custom`. */
  pattern: string;
  encodeTarget: boolean;
  /** Header name and value, or null when the proxy is used unauthenticated. */
  header: { name: string; value: string } | null;
}

@Injectable({ providedIn: 'root' })
export class CorsProxySettings implements ExpiringConnection {
  // `optional` because this service is constructed directly (`new
  // CorsProxySettings()`) in a few specs and utilities, outside any injector.
  // A missing FeatureFlags there must not throw NG0203; it means "no flag
  // service available", and the fallback below treats every proxy as offered,
  // which is the pre-flag behaviour those callers already expect.
  private flags = inject(FeatureFlags, { optional: true });
  // Also optional, for the same `new CorsProxySettings()` callers. Absent means
  // "not a supporter", which resolves to the free tier — the safe default.
  private plus = inject(SupporterStatus, { optional: true });
  private config = signal<StoredCorsProxyConfig | null>(readConfig());
  private bridge = inject(VaultBridge);
  private secret = signal<StoredCorsProxyKey | null>(readSecret());

  /**
   * Connected, but the key is not in this browser right now.
   *
   * Set when local retention expired a vaulted key. The connections page renders
   * this as locked rather than disconnected — telling someone to reconnect
   * something still connected is how they paste a key they did not need to.
   */
  readonly needsFetch = signal(false);

  /** Whether a proxy id is switched on, tolerating a missing flag service. */
  private proxyFlagEnabled = (flagId: string): boolean =>
    this.flags?.enabled(flagId as FeatureFlagId) ?? true;

  /**
   * The chosen proxy, or null when the user has not picked one — or when the one
   * they picked is switched off by a feature flag.
   *
   * The flag is enforced *here*, on the read every consumer goes through, rather
   * than only in the picker. A selection stored before the flag was turned off
   * would otherwise keep relaying traffic through a proxy the app no longer
   * offers, which is the opposite of what turning it off means. Everything
   * downstream — `usable`, `resolve()`, and so every proxied request in the app —
   * inherits the check from this one computed.
   */
  readonly chosen = computed<CorsProxyEntry | null>(() => {
    const id = this.config()?.id;
    const entry = id ? (corsProxyEntry(id) ?? null) : null;
    if (!entry) {
      return null;
    }
    const flag = proxyFeatureFlag(entry.id);
    if (flag !== null && !this.proxyFlagEnabled(flag)) {
      return null;
    }
    return this.upgradeToSupporterTier(entry);
  });

  /**
   * Swap the free Mawkingbird proxy for the supporter tier when the account is
   * entitled to it.
   *
   * ## Why this is automatic rather than a setting
   *
   * A subscriber who has to find Settings, open Connections, pick "Mawkingbird
   * Plus" from a list, and press Save is a subscriber who paid for a higher rate
   * limit and is still being rate-limited at the free tier until they stumble
   * across the right screen. Nobody buys a rate limit in order to configure one.
   *
   * The swap is safe precisely because the two entries are the same service:
   * byte-identical URL patterns, the same routes, the same destinations, and no
   * key to paste. The tier travels in a header the app attaches per request, so
   * "upgrading" changes nothing about how a request is built — only which
   * ceiling the Worker applies to it.
   *
   * ## Why it does not write to storage
   *
   * The stored selection stays whatever the user chose. Entitlement is a fact
   * about the account, not a preference, and persisting it would strand the free
   * entry's users on a paid entry the moment a subscription lapsed — which is
   * the reverse of the degradation this whole design is built around. Read it
   * live and the lapse resolves itself on the next mint.
   *
   * A user who explicitly picked something else — AllOrigins, their own proxy —
   * is left alone. This only ever promotes the free Mawkingbird proxy to its own
   * paid tier.
   */
  private upgradeToSupporterTier(entry: CorsProxyEntry): CorsProxyEntry {
    if (entry.id !== 'mawkingbird' || !this.plus?.isSupporter()) {
      return entry;
    }
    return this.supporterEntry() ?? entry;
  }

  /** The Plus proxy entry, when the account is entitled and the flag allows it. */
  private supporterEntry(): CorsProxyEntry | null {
    if (!this.plus?.isSupporter()) {
      return null;
    }
    const flag = proxyFeatureFlag('mawkingbird-plus');
    if (flag !== null && !this.proxyFlagEnabled(flag)) {
      return null;
    }
    return corsProxyEntry('mawkingbird-plus') ?? null;
  }

  /**
   * Whether this browser is falling back to no proxy while entitled to one.
   *
   * The gap {@link upgradeToSupporterTier} does not close. That promotes the
   * *free Mawkingbird entry* to the paid one, which does nothing for the states
   * a subscriber actually arrives in:
   *
   * - never chose a proxy at all — the default, and the common case;
   * - chose `custom` and never filled in a template, so it cannot build a URL;
   * - sits on a legacy free proxy whose feature flag has since been turned off.
   *
   * All three resolve to null, so a paying subscriber gets no proxy at all while
   * the thing they paid for sits unused. That is the bug this reports, and
   * {@link adoptSupporterProxy} is what fixes it.
   *
   * Deliberately false for a *working* deliberate choice — someone on AllOrigins
   * or their own working proxy is left alone. Wanting to fund the project and
   * not wanting to route traffic through it are compatible positions.
   */
  readonly missingEntitledProxy = computed(
    () => this.supporterEntry() !== null && this.resolve() === null,
  );

  /**
   * Switch this browser onto the Mawkingbird proxy it is entitled to.
   *
   * Writes `mawkingbird` rather than `mawkingbird-plus`: the stored selection
   * stays the free entry and the live read promotes it, so a lapsed subscription
   * degrades to the free tier by itself instead of stranding someone on a paid
   * entry they no longer have — the same reasoning as
   * {@link upgradeToSupporterTier}, which is why this does not bypass it.
   *
   * Nothing here needs a key, so there is no credential decision to make and
   * nothing to prompt about.
   */
  adoptSupporterProxy(): void {
    if (this.supporterEntry() === null) {
      return;
    }
    this.select('mawkingbird');
  }

  /** Whether a proxy is configured well enough to actually be used. */
  readonly usable = computed(() => this.resolve() !== null);

  /** True when a key is stored, without exposing it. */
  readonly hasKey = computed(() => (this.secret()?.key ?? '') !== '');

  constructor() {
    this.enforceLifetime();
  }

  /** The chosen id, for the settings UI to render its picker against. */
  currentId(): CorsProxyId | null {
    return this.config()?.id ?? null;
  }

  /** The stored custom template, for the settings form to prefill. */
  customTemplate(): string {
    return this.config()?.customTemplate ?? '';
  }

  /** The stored custom header name, for the settings form to prefill. */
  customHeader(): string {
    return this.secret()?.customHeader ?? '';
  }

  customEncodeTarget(): boolean {
    return this.config()?.customEncodeTarget ?? true;
  }

  /**
   * Everything needed to build a proxied request, or null when the current
   * configuration cannot make one.
   *
   * Returns null — rather than a half-built config — when a proxy that requires
   * a key has none, or a custom proxy has no usable template. The caller then
   * treats the proxy as unconfigured, which is the safe direction: no proxy
   * means a direct fetch that fails visibly, not a malformed request to a
   * half-configured third party.
   */
  resolve(): CorsProxyConfig | null {
    const entry = this.chosen();
    if (!entry) {
      return null;
    }
    const stored = this.config();
    const key = this.secret()?.key ?? '';

    const pattern = entry.id === 'custom' ? (stored?.customTemplate ?? '') : entry.template.pattern;
    if (!pattern.includes('{url}')) {
      return null;
    }
    const encodeTarget =
      entry.id === 'custom' ? (stored?.customEncodeTarget ?? true) : entry.template.encodeTarget;

    if (entry.keyRequired && !key) {
      return null;
    }

    const headerName = entry.id === 'custom' ? this.customHeader() : (entry.keyHeader ?? '');
    const header = headerName && key ? { name: headerName, value: key } : null;

    return { entry, pattern, encodeTarget, header };
  }

  /** Choose a proxy. Selecting a different one leaves any stored key in place. */
  select(id: CorsProxyId, options?: { template?: string; encodeTarget?: boolean }): void {
    const next: StoredCorsProxyConfig = { id };
    if (id === 'custom') {
      next.customTemplate = options?.template?.trim() ?? this.customTemplate();
      next.customEncodeTarget = options?.encodeTarget ?? this.customEncodeTarget();
    }
    this.writeConfig(next);
    void this.syncToVault();
  }

  /** Stop using any proxy. Also clears the key: nothing is left to leak. */
  clear(): void {
    remove(CONFIG_KEY);
    this.config.set(null);
    this.clearKey();
  }

  /**
   * Store an API key for the chosen proxy, stamped for the retention policy.
   *
   * An empty key clears the stored one rather than persisting a blank, so the
   * key field doubles as the way to remove a key you no longer want here.
   */
  setKey(key: string, customHeader?: string): void {
    const trimmed = key.trim();
    if (!trimmed) {
      this.clearKey();
      return;
    }
    const value: StoredCorsProxyKey = stampCredential({
      key: trimmed,
      ...(customHeader?.trim() ? { customHeader: customHeader.trim() } : {}),
    });
    this.writeSecret(value);
    // Not awaited: pasting a key should feel instant. Failures are observable
    // via `syncToVault()`, which the settings page calls when the user opts in.
    void this.bridge.writeThrough(SECRET_KEY, serializeVaulted(value, this.config()));
  }

  /**
   * The proxy key, falling back to the vault on a local miss.
   *
   * `localStorage` first, always. The proxy has to keep working with the vault
   * locked, unavailable or never set up — it predates the vault and several
   * other connectors depend on it.
   */
  apiKey(): string | null {
    const local = this.secret()?.key;
    if (local) {
      return local;
    }
    const raw = this.bridge.readThrough(SECRET_KEY);
    if (!raw) {
      return null;
    }
    const fromVault = parseVaulted(raw);
    if (!fromVault) {
      return null;
    }
    this.writeSecret(fromVault.secret);
    if (!this.config() && fromVault.config) {
      this.writeConfig(fromVault.config);
    }
    return fromVault.secret.key;
  }

  /** Forget the key here and remove the stored copy. */
  clearKey(): void {
    void this.bridge.removeThrough(SECRET_KEY);
    this.forgetKeyLocally();
    this.needsFetch.set(false);
  }

  /** Clear the local plaintext only. The vault copy, if any, survives. */
  private forgetKeyLocally(): void {
    remove(SECRET_KEY);
    this.secret.set(null);
  }

  /**
   * {@link ExpiringConnection}: apply the local retention policy.
   *
   * A **lock** for a vaulted key: the plaintext goes, the connection stays, and
   * the next `apiKey()` fetches it back. See `VaultBridge.verdictFor`.
   */
  enforceLifetime(): void {
    const stored = this.secret();
    if (!stored) {
      return;
    }
    const verdict = this.bridge.verdictFor(SECRET_KEY, stored.connectedAt);
    if (verdict.kind === 'disconnect') {
      this.clearKey();
    } else if (verdict.kind === 'lock') {
      this.forgetKeyLocally();
      this.needsFetch.set(true);
    }
  }

  /** Push the current key to the vault and report what happened. */
  async syncToVault(): Promise<SyncOutcome> {
    const secret = this.secret();
    return secret
      ? this.bridge.writeThrough(SECRET_KEY, serializeVaulted(secret, this.config()))
      : { kind: 'skipped' };
  }

  /** Restore missing proxy state in either direction without choosing between conflicts. */
  async reconcileVault(): Promise<VaultReconcileOutcome> {
    const localSecret = this.secret();
    const localConfig = this.config();
    const remoteRaw = this.bridge.readThrough(SECRET_KEY);
    if (!remoteRaw) {
      return localSecret ? storedOutcome(await this.syncToVault()) : { kind: 'skipped' };
    }
    const remote = parseVaulted(remoteRaw);
    if (!remote) {
      return { kind: 'failed', message: 'The encrypted CORS proxy record is unreadable.' };
    }
    const sameSecret =
      !localSecret ||
      (localSecret.key === remote.secret.key &&
        (localSecret.customHeader ?? '') === (remote.secret.customHeader ?? ''));
    if (!sameSecret) {
      return {
        kind: 'conflict',
        message:
          'The CORS proxy has different non-empty keys here and in Mawkingbird; neither copy was replaced.',
      };
    }

    if (!localSecret) {
      this.writeSecret(remote.secret);
    }
    if (!localConfig && remote.config) {
      this.writeConfig(remote.config);
    }

    const nextVaultConfig = remote.config ?? localConfig;
    const remoteChanged = remote.legacy || (!remote.config && nextVaultConfig !== null);
    if (remoteChanged) {
      const stored = await this.bridge.writeThrough(
        SECRET_KEY,
        serializeVaulted(remote.secret, nextVaultConfig),
      );
      if (stored.kind === 'failed') {
        return stored;
      }
    }

    if (!localSecret) {
      return { kind: 'restored' };
    }
    return remoteChanged || (!localConfig && remote.config)
      ? { kind: 'merged' }
      : { kind: 'unchanged' };
  }

  /** {@link ExpiringConnection}: when the key ages out, or null. */
  expiresAt(): number | null {
    return credentialExpiresAt(this.secret()?.connectedAt);
  }

  /**
   * Drop a selection that cannot work here.
   *
   * Called when the picker loads on a deployed build: a dev-only proxy chosen
   * under `ng serve` would otherwise stay selected in production and fail every
   * request with a CORS error that looks like the *feed's* fault.
   */
  dropUnavailableSelection(hostname: string = location.hostname): boolean {
    const id = this.currentId();
    if (!id) {
      return false;
    }
    // Also drops a proxy whose feature flag has since been turned off — the flag
    // is the same "is this offered at all" question, so a selection made before
    // it was switched off must not survive as a silently-active relay.
    const stillOffered = availableCorsProxies(hostname, this.proxyFlagEnabled).some(
      (entry) => entry.id === id,
    );
    if (stillOffered) {
      return false;
    }
    this.clear();
    return true;
  }

  private writeConfig(next: StoredCorsProxyConfig): void {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    } catch {
      // Non-persistent, but honour it for this session.
    }
    this.config.set(next);
  }

  private writeSecret(next: StoredCorsProxyKey): void {
    try {
      localStorage.setItem(SECRET_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked: honour the key for this session anyway.
    }
    this.secret.set(next);
    this.needsFetch.set(false);
  }
}

function parseVaulted(raw: string): (VaultedCorsProxySettings & { legacy: boolean }) | null {
  try {
    const parsed = JSON.parse(raw) as Partial<VaultedCorsProxySettings>;
    if (parsed?.v === 1 && typeof parsed.secret?.key === 'string' && parsed.secret.key) {
      const config = parsed.config && corsProxyEntry(parsed.config.id) ? parsed.config : null;
      return {
        v: 1,
        secret: parsed.secret,
        config,
        legacy: false,
      };
    }
    if (raw.trimStart().startsWith('{')) {
      return null;
    }
  } catch {
    if (raw.trimStart().startsWith('{')) {
      return null;
    }
    // A legacy record is the raw key, so non-JSON is expected here.
  }
  return raw ? { v: 1, secret: stampCredential({ key: raw }), config: null, legacy: true } : null;
}

function serializeVaulted(
  secret: StoredCorsProxyKey,
  config: StoredCorsProxyConfig | null,
): string {
  const record: VaultedCorsProxySettings = { v: 1, secret, config };
  return JSON.stringify(record);
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Unreadable and unremovable is still "not configured" in memory.
  }
}

function readConfig(): StoredCorsProxyConfig | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(CONFIG_KEY);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StoredCorsProxyConfig;
    // An id we no longer ship (a proxy that shut down, a renamed entry) is
    // discarded rather than kept as a dangling selection.
    return corsProxyEntry(parsed?.id) ? parsed : null;
  } catch {
    remove(CONFIG_KEY);
    return null;
  }
}

function readSecret(): StoredCorsProxyKey | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(SECRET_KEY);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StoredCorsProxyKey;
    if (typeof parsed?.key !== 'string' || !parsed.key) {
      throw new Error('malformed');
    }
    return ensureStamped(SECRET_KEY, parsed);
  } catch {
    remove(SECRET_KEY);
    return null;
  }
}
