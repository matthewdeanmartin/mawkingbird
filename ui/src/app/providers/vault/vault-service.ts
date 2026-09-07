/**
 * The connection vault, as the rest of the app sees it.
 *
 * Holds the lifecycle — locked, unlocked, absent, unavailable — and the
 * read/write path through encryption. Connectors call {@link read} and
 * {@link write} and never touch crypto or the wire.
 *
 * ## The ordering that matters
 *
 * Unlock fetches metadata **first**, derives the key from the salt it carries,
 * and only then pulls the ciphertext. A wrong passphrase therefore costs one
 * small request instead of a full vault transfer, and the server is never asked
 * whether the passphrase was right — it could not answer, and being unable to is
 * the point.
 *
 * ## What this is not
 *
 * Not a cache in front of the connectors. Connectors keep their own
 * `localStorage` copies and keep working with the vault locked, unavailable, or
 * never set up; the vault is a fallback on a cache miss. Sprint 4 wires that up
 * and pins it with a test across every connector, because the failure mode —
 * a credential store that becomes a hard dependency of features that predate
 * it — is the one that would make this feature a liability rather than a
 * convenience.
 */

import { computed, inject, Injectable, signal } from '@angular/core';
import { VaultClient, type VaultMeta } from './vault-client';
import {
  CURRENT_KDF,
  deriveVaultKey,
  generateSalt,
  openBundle,
  passphraseProblem,
  sealBundle,
  UnsupportedKdfError,
} from './vault-crypto';
import type { KdfParams } from './vault-crypto';
import { forgetVaultKey, recallVaultKey, rememberVaultKey } from './vault-key-store';
import {
  bundleCount,
  emptyBundle,
  isBundle,
  mergeBundles,
  readFromBundle,
  removeFromBundle,
  VAULTED_KEYS,
  writeToBundle,
  type ConnectionBundle,
} from './vault-manifest';

/**
 * Where the vault stands right now.
 *
 * `unavailable` is deliberately distinct from a failure: not signed in, not
 * Plus, or not on an identity provider are three different situations, each
 * needing a different offer. Collapsing them into "error" produces a dead end
 * for the two that have an obvious next step.
 */
export type VaultState =
  /** Not checked yet. */
  | 'unknown'
  /** No vault exists. The user can create one. */
  | 'absent'
  /** A vault exists; this browser cannot open it without the passphrase. */
  | 'locked'
  /** Open, and readable. */
  | 'unlocked'
  /** This account cannot use the vault at all. See {@link VaultService.unavailableReason}. */
  | 'unavailable';

/** Why the vault cannot be used, when the state is `unavailable`. */
export type UnavailableReason =
  | 'signed-out'
  | 'needs-plus'
  | 'needs-idp'
  | 'not-a-tester'
  | 'offline';

/** What happened to a write. */
export type WriteOutcome =
  | { ok: true; overwritten: { base: string; device: string }[] }
  | { ok: false; message: string };

/** A device label, so a conflict can name where the other copy came from. */
const DEVICE_KEY = 'mockingbird_vault_device';

@Injectable({ providedIn: 'root' })
export class VaultService {
  private client = inject(VaultClient);

  readonly state = signal<VaultState>('unknown');
  readonly unavailableReason = signal<UnavailableReason | null>(null);
  readonly meta = signal<VaultMeta | null>(null);
  /** A message worth showing after the last operation, or null. */
  readonly notice = signal<string | null>(null);

  readonly unlocked = computed(() => this.state() === 'unlocked');
  readonly count = computed(() => {
    const bundle = this.bundle();
    return bundle ? bundleCount(bundle) : 0;
  });
  /** Connector names represented in the open bundle, without exposing values. */
  readonly storedConnectors = computed(() => {
    const bundle = this.bundle();
    if (!bundle) {
      return [] as string[];
    }
    const bases = new Set<string>(Object.keys(bundle.browser));
    for (const values of Object.values(bundle.accounts)) {
      for (const base of Object.keys(values)) {
        bases.add(base);
      }
    }
    return VAULTED_KEYS.filter((entry) => bases.has(entry.base)).map((entry) => entry.connector);
  });

  /** Whether the open vault actually holds this connector for the current scope. */
  hasConnector(connector: string, accountKey: string | null): boolean {
    const bundle = this.bundle();
    if (!bundle) {
      return false;
    }
    return VAULTED_KEYS.filter((entry) => entry.connector === connector).some((entry) => {
      const values =
        entry.scope === 'browser'
          ? bundle.browser
          : accountKey
            ? bundle.accounts[accountKey]
            : undefined;
      return values ? Object.prototype.hasOwnProperty.call(values, entry.base) : false;
    });
  }

  /**
   * The decrypted bundle, held in memory only while unlocked.
   *
   * Never written to any storage in this form. The plaintext lives here and in
   * whatever the connectors already keep; the durable copy is always encrypted.
   */
  private bundle = signal<ConnectionBundle | null>(null);
  private key: CryptoKey | null = null;
  private salt: string | null = null;
  private kdf: KdfParams = CURRENT_KDF;
  private version: number | null = null;
  /** Keep adjacent connector writes in user-action order within this browser. */
  private mutationTail: Promise<void> = Promise.resolve();

  /**
   * Bring the vault up to date without asking for a passphrase.
   *
   * Called on sign-in and when the connections page opens. Reads metadata,
   * and if this browser still holds a remembered key, opens the vault silently.
   */
  async refresh(): Promise<void> {
    const meta = await this.client.meta();

    if (meta.kind === 'forbidden') {
      this.state.set('unavailable');
      this.unavailableReason.set(reasonFor(meta.code));
      return;
    }
    if (meta.kind === 'payment-required') {
      // Note this is *not* `unavailable`: the metadata route stays open to a
      // lapsed account precisely so it can be told when its vault expires. A 402
      // here means something else refused, so treat it as needing Plus.
      this.state.set('unavailable');
      this.unavailableReason.set('needs-plus');
      return;
    }
    if (meta.kind === 'failed') {
      this.state.set('unavailable');
      this.unavailableReason.set('offline');
      return;
    }
    if (meta.kind !== 'ok') {
      // `absent`, or the `conflict` shape the union technically permits and this
      // route never returns. Both mean "nothing to open".
      this.state.set('absent');
      this.meta.set(null);
      this.unavailableReason.set(null);
      return;
    }

    this.unavailableReason.set(null);
    this.meta.set(meta.value);
    this.salt = meta.value.saltB64;
    this.kdf = meta.value.kdf;
    this.version = meta.value.version;

    const remembered = await recallVaultKey();
    if (!remembered) {
      this.state.set('locked');
      return;
    }
    this.key = remembered;
    // A remembered key that no longer opens the vault means the passphrase was
    // changed on another device. Fall back to locked rather than pretending;
    // the next unlock replaces it.
    if (!(await this.load())) {
      this.key = null;
      await forgetVaultKey();
      this.state.set('locked');
    }
  }

  /**
   * Create a vault. The passphrase is checked here and never sent anywhere.
   *
   * Returns a problem string, or null on success — the UI shows it inline, and a
   * refusal to accept a weak passphrase is not an exception.
   */
  async create(passphrase: string): Promise<string | null> {
    // No email is passed: `AccountUser` carries only `auth` and `tier`, because
    // the token deliberately holds no PII. So the "do not use your own email
    // address" check cannot run here, and the component that owns the form —
    // which does know what the user typed to sign in — is where it belongs.
    const problem = passphraseProblem(passphrase);
    if (problem) {
      return problem;
    }

    const salt = generateSalt();
    const key = await deriveVaultKey(passphrase, salt, CURRENT_KDF);
    const bundle = emptyBundle();
    const blob = await sealBundle(bundle, key);

    const stored = await this.client.store(blob, salt, CURRENT_KDF, null);
    if (stored.kind !== 'ok') {
      return messageFor(stored);
    }

    this.key = key;
    this.salt = salt;
    this.kdf = CURRENT_KDF;
    this.version = stored.value.version;
    this.bundle.set(bundle);
    this.meta.set(stored.value.meta);
    this.state.set('unlocked');
    await rememberVaultKey(key);
    return null;
  }

  /**
   * Open an existing vault.
   *
   * Returns true on success. A false here is overwhelmingly "wrong passphrase",
   * which is an ordinary outcome — {@link notice} carries anything worth saying.
   */
  async unlock(passphrase: string): Promise<boolean> {
    if (!this.salt) {
      await this.refresh();
    }
    if (!this.salt) {
      return false;
    }

    let key: CryptoKey;
    try {
      key = await deriveVaultKey(passphrase, this.salt, this.kdf);
    } catch (error: unknown) {
      // A vault written by a newer client. Say so, rather than reporting a
      // wrong passphrase and sending the user hunting for one that was right.
      this.notice.set(
        error instanceof UnsupportedKdfError
          ? error.message
          : 'Your stored connections could not be opened.',
      );
      return false;
    }

    this.key = key;
    if (!(await this.load())) {
      this.key = null;
      this.notice.set('That passphrase does not open your stored connections.');
      return false;
    }

    await rememberVaultKey(key);
    this.notice.set(null);
    return true;
  }

  /** Forget the key on this device. The vault itself is untouched. */
  async lock(): Promise<void> {
    this.key = null;
    this.bundle.set(null);
    await forgetVaultKey();
    this.state.set(this.meta() ? 'locked' : 'absent');
  }

  /** Read one credential, or null when absent or locked. */
  read(base: string, accountKey: string | null = null): string | null {
    const bundle = this.bundle();
    return bundle ? readFromBundle(bundle, base, accountKey) : null;
  }

  /**
   * Store one credential.
   *
   * On a version conflict this re-fetches, merges **per credential**, and
   * retries once. A second conflict is surfaced rather than retried: two in a
   * row is a real problem, and looping would hide it while making it worse.
   */
  async write(
    base: string,
    value: string,
    accountKey: string | null = null,
  ): Promise<WriteOutcome> {
    return this.mutate((bundle) => writeToBundle(bundle, base, accountKey, value, deviceLabel()));
  }

  /** Remove one credential from the stored copy. */
  async remove(base: string, accountKey: string | null = null): Promise<WriteOutcome> {
    return this.mutate((bundle) => removeFromBundle(bundle, base, accountKey));
  }

  /** Destroy the vault entirely. */
  async destroy(): Promise<boolean> {
    const result = await this.client.destroy();
    if (result.kind !== 'ok') {
      this.notice.set(messageFor(result));
      return false;
    }
    this.key = null;
    this.salt = null;
    this.version = null;
    this.bundle.set(null);
    this.meta.set(null);
    await forgetVaultKey();
    this.state.set('absent');
    return true;
  }

  /**
   * Change the passphrase.
   *
   * Re-derives under a **fresh salt** and re-seals. The server is not involved
   * beyond storing new bytes: it never held the old passphrase and does not hold
   * the new one, so there is nothing on its side to update.
   */
  async changePassphrase(next: string): Promise<string | null> {
    const bundle = this.bundle();
    if (!bundle || this.version === null) {
      return 'Unlock your stored connections before changing the passphrase.';
    }
    const problem = passphraseProblem(next);
    if (problem) {
      return problem;
    }

    const salt = generateSalt();
    const key = await deriveVaultKey(next, salt, CURRENT_KDF);
    const blob = await sealBundle(bundle, key);
    const stored = await this.client.store(blob, salt, CURRENT_KDF, this.version);
    if (stored.kind !== 'ok') {
      return messageFor(stored);
    }

    this.key = key;
    this.salt = salt;
    this.kdf = CURRENT_KDF;
    this.version = stored.value.version;
    this.meta.set(stored.value.meta);
    await rememberVaultKey(key);
    return null;
  }

  /** Change how long the encrypted server copy is retained. */
  async setPolicy(policy: VaultMeta['policy']): Promise<boolean> {
    const result = await this.client.setPolicy(policy);
    if (result.kind !== 'ok') {
      this.notice.set(messageFor(result));
      return false;
    }
    this.meta.set(result.value.meta);
    this.notice.set(null);
    return true;
  }

  /** Fetch and decrypt with the current key. False means the key is wrong. */
  private async load(): Promise<boolean> {
    if (!this.key) {
      return false;
    }
    const fetched = await this.client.fetch();
    if (fetched.kind === 'absent') {
      // Metadata without ciphertext: the vault expired inside the metadata's
      // slack window. Treat as absent, which is what it is.
      this.state.set('absent');
      this.bundle.set(null);
      return true;
    }
    if (fetched.kind !== 'ok') {
      this.notice.set(messageFor(fetched));
      return false;
    }

    const opened = await openBundle<unknown>(fetched.value.blob, this.key);
    if (!opened || !isBundle(opened)) {
      return false;
    }
    this.bundle.set(opened);
    this.meta.set(fetched.value.meta);
    this.version = fetched.value.version;
    this.state.set('unlocked');
    return true;
  }

  private mutate(change: (bundle: ConnectionBundle) => ConnectionBundle): Promise<WriteOutcome> {
    const result = this.mutationTail.then(() => this.performMutation(change));
    // A refused write must not poison every later mutation in this browser.
    this.mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async performMutation(
    change: (bundle: ConnectionBundle) => ConnectionBundle,
  ): Promise<WriteOutcome> {
    const current = this.bundle();
    if (!current || !this.key || !this.salt || this.version === null) {
      return { ok: false, message: 'Unlock your stored connections first.' };
    }

    const next = change(current);
    const first = await this.push(next, this.version);
    if (first.kind === 'ok') {
      this.bundle.set(next);
      this.version = first.value.version;
      this.meta.set(first.value.meta);
      return { ok: true, overwritten: [] };
    }
    if (first.kind !== 'conflict') {
      return { ok: false, message: messageFor(first) };
    }

    // Another device wrote first. Take their copy, apply our change on top of
    // it, and merge per credential so neither side's addition is lost.
    const theirs = await this.client.fetch();
    if (theirs.kind !== 'ok') {
      return { ok: false, message: 'Your stored connections changed on another device.' };
    }
    const opened = await openBundle<unknown>(theirs.value.blob, this.key);
    if (!opened || !isBundle(opened)) {
      return {
        ok: false,
        message: 'Your stored connections were changed with a different passphrase.',
      };
    }

    const merged = mergeBundles(change(opened), opened);
    const retry = await this.push(merged.bundle, theirs.value.version);
    if (retry.kind !== 'ok') {
      // Two conflicts in a row. Surfaced, not retried — looping would hide a
      // real problem behind a spinner.
      return {
        ok: false,
        message: 'Your stored connections are being changed on another device. Try again shortly.',
      };
    }

    this.bundle.set(merged.bundle);
    this.version = retry.value.version;
    this.meta.set(retry.value.meta);
    return { ok: true, overwritten: merged.overwritten };
  }

  private async push(bundle: ConnectionBundle, version: number) {
    const blob = await sealBundle(bundle, this.key as CryptoKey);
    return this.client.store(blob, this.salt as string, this.kdf, version);
  }
}

function reasonFor(code: string | undefined): UnavailableReason {
  if (code === 'vault_requires_idp') {
    return 'needs-idp';
  }
  if (code === 'not_a_tester') {
    return 'not-a-tester';
  }
  if (code === 'payment_required') {
    return 'needs-plus';
  }
  return 'signed-out';
}

function messageFor(result: { kind: string; message?: string }): string {
  return result.message ?? 'Your stored connections could not be reached.';
}

/**
 * A label for this browser, so a conflict can say where the other copy came
 * from.
 *
 * Deliberately coarse and deliberately not a fingerprint: the platform word from
 * the user agent, nothing more. It is shown to the user in a sentence like "your
 * OpenRouter key was updated from Windows", and anything more precise would be
 * both creepier and no more useful.
 */
function deviceLabel(): string {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) {
    return existing;
  }
  const agent = navigator.userAgent;
  const label = /Android/i.test(agent)
    ? 'Android'
    : /iPhone|iPad/i.test(agent)
      ? 'iOS'
      : /Mac/i.test(agent)
        ? 'Mac'
        : /Windows/i.test(agent)
          ? 'Windows'
          : 'another device';
  localStorage.setItem(DEVICE_KEY, label);
  return label;
}
