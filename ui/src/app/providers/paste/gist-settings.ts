import { inject, Injectable, signal } from '@angular/core';
import { scopedKey } from '../../account-scope';
import { ProfileAccountKey } from '../account/profile-account-key';
import { VaultBridge, type SyncOutcome } from '../vault/vault-bridge';
import { reconcileScalar, type VaultReconcileOutcome } from '../vault/vault-reconcile';
import { ExpiringConnection, credentialExpiresAt, stampCredential } from '../credential-lifetime';

/**
 * The GitHub token that may write gists.
 *
 * **Deliberately not the token `GitHubSession` holds**, and for exactly the
 * reason `HugoSettings` keeps its own: that one is a read-only PAT for
 * notifications and profile lookups, and this one can create and rewrite gists
 * on the account. Sharing a single token would silently widen the scope an
 * existing connection needs, and put every gist a user owns behind one leaked
 * string.
 *
 * A classic PAT with the `gist` scope is all this needs — nothing else, and in
 * particular not `repo`. Say so wherever it is asked for.
 *
 * Split into two keys the same way the other two GitHub credentials are: a
 * settings export can carry "gists are on" without carrying the credential.
 * The flag is `private`, the token is `secret`. See `storage-registry.ts`.
 *
 * ## What the vault stores
 *
 * The token **and** the login, as one record, the way `MataroaSettings` vaults
 * its blog URL alongside its key. The split above is about what a settings
 * *export* may carry; the vault is encrypted end to end and has no such
 * constraint. Syncing the token alone would leave the second device holding a
 * working credential it cannot attribute to anyone, and the connections page
 * would render a connection with no account name against it.
 */
const CREDENTIALS_KEY_BASE = 'mockingbird_gist_credentials';
const PROFILE_KEY_BASE = 'mockingbird_gist_profile';

/** The non-secret half: who the token belongs to, for display. */
export interface GistProfile {
  login: string;
}

interface StoredGistCredentials {
  accessToken: string;
  connectedAt?: number;
}

/** The vaulted record: the credential and the profile it belongs to. */
interface VaultedGist {
  accessToken: string;
  connectedAt?: number;
  profile: GistProfile | null;
}

@Injectable({ providedIn: 'root' })
export class GistSettings implements ExpiringConnection {
  private bridge = inject(VaultBridge);
  private accountKey = inject(ProfileAccountKey);
  private readonly credentialsKey = scopedKey(CREDENTIALS_KEY_BASE);
  private readonly profileKey = scopedKey(PROFILE_KEY_BASE);

  private credentials = signal<StoredGistCredentials | null>(readJson(this.credentialsKey));
  readonly profile = signal<GistProfile | null>(readJson(this.profileKey));

  /** True when a token is stored. The provider offers itself only then. */
  readonly connected = signal(readJson<StoredGistCredentials>(this.credentialsKey) !== null);

  /**
   * Connected, but the token is not in this browser right now.
   *
   * Set when local retention expired a vaulted token. Rendered as locked rather
   * than disconnected — see `VaultBridge.verdictFor`.
   */
  readonly needsFetch = signal(false);

  constructor() {
    this.enforceLifetime();
  }

  /**
   * The write token, falling back to the vault on a local miss.
   *
   * `localStorage` first, always — this connector worked before the vault
   * existed and must keep working with it locked, unavailable or never set up.
   */
  token(): string | null {
    const local = this.credentials()?.accessToken;
    if (local) {
      return local;
    }
    const fromVault = this.bridge.readThrough(CREDENTIALS_KEY_BASE, this.accountKey.current());
    if (!fromVault) {
      return null;
    }
    const parsed = parseVaulted(fromVault);
    if (!parsed) {
      return null;
    }
    // Repopulate both halves. A token with no profile would render as a
    // connection belonging to nobody.
    this.persist(stampCredential({ accessToken: parsed.accessToken }), parsed.profile);
    return parsed.accessToken;
  }

  connect(accessToken: string, profile: GistProfile): void {
    const trimmed = accessToken.trim();
    if (!trimmed) {
      throw new Error('Paste a GitHub personal access token with the gist scope.');
    }
    const stamped = stampCredential({ accessToken: trimmed });
    this.persist(stamped, profile);
    // Not awaited: connecting should feel instant. Failures are observable via
    // `syncToVault()`, which the settings page calls when the user opts in.
    void this.bridge.writeThrough(
      CREDENTIALS_KEY_BASE,
      serialize(stamped, profile),
      this.accountKey.current(),
    );
  }

  /** Write both halves locally and update the signals. */
  private persist(stamped: StoredGistCredentials, profile: GistProfile | null): void {
    write(this.credentialsKey, stamped);
    if (profile) {
      write(this.profileKey, profile);
    }
    this.credentials.set(stamped);
    if (profile) {
      this.profile.set(profile);
    }
    this.connected.set(true);
    this.needsFetch.set(false);
  }

  /** Disconnect here, and remove the stored copy so it cannot come back. */
  disconnect(): void {
    void this.bridge.removeThrough(CREDENTIALS_KEY_BASE, this.accountKey.current());
    this.forgetLocally();
    this.connected.set(false);
    this.needsFetch.set(false);
  }

  /**
   * Clear the local copies only. The vault copy, if any, survives.
   *
   * The profile goes too: it is the display half of a credential that is no
   * longer here, and leaving it would render a connection with a name and no
   * token behind it.
   */
  private forgetLocally(): void {
    remove(this.credentialsKey);
    remove(this.profileKey);
    this.credentials.set(null);
    this.profile.set(null);
  }

  /** Push the current credential to the vault and report what happened. */
  async syncToVault(): Promise<SyncOutcome> {
    const stored = this.credentials();
    return stored
      ? this.bridge.writeThrough(
          CREDENTIALS_KEY_BASE,
          serialize(stored, this.profile()),
          this.accountKey.current(),
        )
      : { kind: 'skipped' };
  }

  /** Reconcile the token-plus-profile record without silently choosing a conflict winner. */
  reconcileVault(): Promise<VaultReconcileOutcome> {
    const current = this.credentials();
    return reconcileScalar({
      local: current ? serialize(current, this.profile()) : null,
      remote: this.bridge.readThrough(CREDENTIALS_KEY_BASE, this.accountKey.current()),
      restore: (raw) => {
        const parsed = parseVaulted(raw);
        if (!parsed) {
          return false;
        }
        this.persist(
          stampCredential({
            accessToken: parsed.accessToken,
            ...(parsed.connectedAt === undefined ? {} : { connectedAt: parsed.connectedAt }),
          }),
          parsed.profile,
        );
        return true;
      },
      store: () => this.syncToVault(),
      conflictMessage:
        'GitHub Gist has different non-empty credentials here and in Mawkingbird; neither copy was replaced.',
    });
  }

  /** When this token ages out under the retention policy, or null. */
  expiresAt(): number | null {
    return credentialExpiresAt(this.credentials()?.connectedAt);
  }

  /**
   * Apply the local retention policy: lock if vaulted, disconnect otherwise.
   *
   * For a vaulted token this clears the plaintext and keeps the connection —
   * the next {@link token} pulls it back. See `VaultBridge.verdictFor`.
   */
  enforceLifetime(): void {
    const stored = this.credentials();
    if (!stored) {
      return;
    }
    const verdict = this.bridge.verdictFor(CREDENTIALS_KEY_BASE, stored.connectedAt);
    if (verdict.kind === 'disconnect') {
      this.disconnect();
    } else if (verdict.kind === 'lock') {
      this.forgetLocally();
      this.needsFetch.set(true);
    }
  }
}

/** The vaulted form: credential and profile together. */
function serialize(stored: StoredGistCredentials, profile: GistProfile | null): string {
  const record: VaultedGist = {
    accessToken: stored.accessToken,
    connectedAt: stored.connectedAt,
    profile,
  };
  return JSON.stringify(record);
}

/** Parse a record read back out of the vault. */
function parseVaulted(raw: string): VaultedGist | null {
  try {
    const parsed = JSON.parse(raw) as VaultedGist;
    if (typeof parsed?.accessToken !== 'string' || !parsed.accessToken) {
      return null;
    }
    const login = parsed.profile?.login;
    return {
      accessToken: parsed.accessToken,
      connectedAt: parsed.connectedAt,
      profile: typeof login === 'string' && login ? { login } : null,
    };
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the connection degrades to session-only, which is
    // the right failure for a credential.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do; the signal is already cleared.
  }
}
