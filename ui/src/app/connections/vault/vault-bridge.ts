/**
 * The seam between a connector session and the vault.
 *
 * Every session in this app has the same shape — a `localStorage` key, a signal
 * holding the parsed credential, and a `store`/`disconnect` pair. This module is
 * the one place that shape meets the vault, so wiring the tenth connector is the
 * same three lines as wiring the first.
 *
 * ## The rule that keeps this safe to add
 *
 * **`localStorage` first, always. The vault is a fallback on a cache miss.**
 *
 * A connector must keep working with the vault locked, unavailable, never set
 * up, or offline — because every one of them worked before the vault existed and
 * none of them may start depending on it. That is not a nice-to-have: a
 * credential store that becomes a hard dependency of features which predate it
 * turns a convenience into a liability, and it would do so silently, on someone
 * else's machine, the first time a passphrase prompt appeared where none used to
 * be.
 *
 * So {@link readThrough} returns `null` rather than throwing when the vault is
 * shut, and {@link writeThrough} reports a failed upload without failing the
 * local write.
 *
 * ## Why the vault write is not awaited by the UI, but is still surfaced
 *
 * Pasting a key should feel instant. But a silently swallowed vault-write
 * failure is the bug where a user believes their key synced, opens their phone a
 * week later, and finds nothing — with no event anywhere that says why. So the
 * promise is returned for a caller to observe, and the settings page shows what
 * came back.
 */

import { inject, Injectable } from '@angular/core';
import { credentialExpired, expiryAction } from '../credential-lifetime';
import { isVaulted, vaultedKey } from './vault-manifest';
import { VaultPreference } from './vault-preference';
import { VaultService } from './vault-service';

/** What happened when a credential was pushed to the vault. */
export type SyncOutcome =
  /** Stored, and any conflicts resolved. */
  | { kind: 'stored'; overwritten: { base: string; device: string }[] }
  /** The vault is shut or unavailable. The local write still happened. */
  | { kind: 'skipped' }
  /** The vault refused or could not be reached. Worth telling the user. */
  | { kind: 'failed'; message: string };

/** What local expiry should do to a connector's stored credential. */
export type LifetimeVerdict =
  /** Still inside the retention window. Leave it alone. */
  | { kind: 'keep' }
  /** Expired, and there is no other copy: drop it and show as disconnected. */
  | { kind: 'disconnect' }
  /**
   * Expired, but the vault holds it: clear the plaintext and stay connected.
   *
   * The connector must **not** report itself disconnected here. See
   * {@link credentialExpired}'s neighbour `expiryAction` for why that distinction
   * is the whole point of this sprint's opening change.
   */
  | { kind: 'lock' };

@Injectable({ providedIn: 'root' })
export class VaultBridge {
  private vault = inject(VaultService);
  private preference = inject(VaultPreference);

  /** Whether this credential participates in the vault at all. */
  syncs(base: string): boolean {
    return this.preference.enabled() && isVaulted(base);
  }

  /** Whether the vault is currently open, so a read could succeed. */
  get open(): boolean {
    return this.vault.unlocked();
  }

  /**
   * The vault's copy of a credential, or null.
   *
   * Null covers every uninteresting case at once — not vaulted, vault locked,
   * vault absent, nothing stored — because the caller's response to all of them
   * is identical: carry on with whatever `localStorage` holds.
   */
  readThrough(base: string, accountKey: string | null = null): string | null {
    if (!this.syncs(base) || !this.vault.unlocked()) {
      return null;
    }
    return this.vault.read(base, this.scopeFor(base, accountKey));
  }

  /**
   * Push a credential to the vault.
   *
   * Call **after** the local write, never instead of it.
   */
  async writeThrough(
    base: string,
    value: string,
    accountKey: string | null = null,
  ): Promise<SyncOutcome> {
    if (!this.syncs(base) || !this.vault.unlocked()) {
      return { kind: 'skipped' };
    }
    const outcome = await this.vault.write(base, value, this.scopeFor(base, accountKey));
    return outcome.ok
      ? { kind: 'stored', overwritten: outcome.overwritten }
      : { kind: 'failed', message: outcome.message };
  }

  /**
   * Remove a credential from the vault.
   *
   * Disconnecting is a deliberate act, so it removes the stored copy too —
   * otherwise "disconnect" on one device is undone by the next sync from
   * another, which is the same resurrection problem local expiry had.
   */
  async removeThrough(base: string, accountKey: string | null = null): Promise<SyncOutcome> {
    if (!this.syncs(base) || !this.vault.unlocked()) {
      return { kind: 'skipped' };
    }
    const outcome = await this.vault.remove(base, this.scopeFor(base, accountKey));
    return outcome.ok
      ? { kind: 'stored', overwritten: [] }
      : { kind: 'failed', message: outcome.message };
  }

  /**
   * What to do with a credential that has outlived the local retention policy.
   *
   * The whole reason this sprint opens with a rename. For a vaulted credential
   * the verdict is `lock`, not `disconnect`: the plaintext goes, the connection
   * stays, and the next use fetches it back. For everything else the old
   * behaviour is unchanged, because for those the local copy really is the only
   * one.
   */
  verdictFor(base: string, connectedAt: number | undefined): LifetimeVerdict {
    if (!credentialExpired(connectedAt)) {
      return { kind: 'keep' };
    }
    // Note this asks whether the credential is *vaultable*, not whether the
    // vault is open right now. A locked vault still holds the copy, so treating
    // this as a disconnection would delete the local plaintext and tell the user
    // they are disconnected while the server copy waits to contradict them.
    return expiryAction(this.syncs(base)) === 'lock' ? { kind: 'lock' } : { kind: 'disconnect' };
  }

  /**
   * Normalise the account key against what the manifest says the scope is.
   *
   * A `browser`-scoped credential is stored unscoped even if a caller passes an
   * account key, and an `account`-scoped one keeps its key. Centralised here
   * because a mismatch between the manifest and a call site is invisible — it
   * writes to one address and reads from another, and the connector simply looks
   * like it never synced.
   */
  private scopeFor(base: string, accountKey: string | null): string | null {
    return vaultedKey(base)?.scope === 'account' ? accountKey : null;
  }
}
