import { Injectable, signal } from '@angular/core';
import { scopedKey } from '../account-scope';

/**
 * How long a connector credential may sit in this browser before the app drops
 * it and asks the user to reconnect.
 *
 * Several connectors are authenticated by pasting a long-lived secret — a
 * GitHub personal access token, a Raindrop.io test token, a Bluesky app
 * password traded for refresh/access JWTs. There is no server here to hold
 * those, so they live in this origin's localStorage, where they would otherwise
 * sit forever: long after the user stopped using the feature, and long after
 * they've forgotten the token exists to revoke it.
 *
 * A retention policy is the blunt but effective answer. It does not stop a
 * script that runs on this origin from reading a live credential — nothing
 * client-side can — but it bounds the window in which there is one to read, and
 * it makes "I connected GitHub once in 2024" stop being true by default.
 *
 * **"There is no server here" is no longer true.** The connection vault holds an
 * encrypted copy of several of these credentials, which changes what expiry
 * means for them without changing when it fires — see {@link expiryAction}. The
 * paragraph above still describes every credential the vault does not cover, and
 * still describes the local half of the ones it does.
 *
 * Dropbox is deliberately not governed by this: it uses a real OAuth flow with
 * short-lived online tokens in sessionStorage, which already expire on their
 * own and never outlive the tab.
 */
export type CredentialLifetime = '30d' | '90d' | 'never';

const STORAGE_KEY_BASE = 'mockingbird_credential_lifetime';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Milliseconds each policy allows, or null for "keep until I disconnect". */
const DURATIONS: Record<CredentialLifetime, number | null> = {
  '30d': 30 * DAY_MS,
  '90d': 90 * DAY_MS,
  never: null,
};

/**
 * The default. Ninety days is long enough that an actively-used connection is
 * never interrupted in practice, and short enough that an abandoned one stops
 * being a liability within a quarter.
 */
export const DEFAULT_CREDENTIAL_LIFETIME: CredentialLifetime = '90d';

export const CREDENTIAL_LIFETIME_OPTIONS: { value: CredentialLifetime; label: string }[] = [
  { value: '30d', label: 'Disconnect after 30 days' },
  { value: '90d', label: 'Disconnect after 90 days' },
  { value: 'never', label: 'Keep until I disconnect' },
];

function isLifetime(value: unknown): value is CredentialLifetime {
  return value === '30d' || value === '90d' || value === 'never';
}

/**
 * The active policy, read straight from storage.
 *
 * A plain function rather than an injected service because the session services
 * evaluate it while constructing their initial signal — before an injection
 * context is necessarily available. Same reasoning as {@link scopedKey}.
 */
export function readCredentialLifetime(): CredentialLifetime {
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY_BASE));
    return isLifetime(raw) ? raw : DEFAULT_CREDENTIAL_LIFETIME;
  } catch {
    return DEFAULT_CREDENTIAL_LIFETIME;
  }
}

/** A credential carrying the moment it was stored. */
export interface ExpiringCredential {
  /** Epoch ms when the user connected. Absent on records predating this field. */
  connectedAt?: number;
}

/** Add (or refresh) the connected-at stamp before persisting a credential. */
export function stampCredential<T extends object>(value: T): T & { connectedAt: number } {
  return { ...value, connectedAt: Date.now() };
}

/**
 * When a credential connected at `connectedAt` falls out of retention, or null
 * under the "never" policy (or when the stamp is missing).
 */
export function credentialExpiresAt(
  connectedAt: number | undefined,
  lifetime: CredentialLifetime = readCredentialLifetime(),
): number | null {
  const duration = DURATIONS[lifetime];
  return duration !== null && typeof connectedAt === 'number' ? connectedAt + duration : null;
}

/** Whether a credential stored at `connectedAt` has outlived the policy. */
export function credentialExpired(
  connectedAt: number | undefined,
  lifetime: CredentialLifetime = readCredentialLifetime(),
  now: number = Date.now(),
): boolean {
  const expiresAt = credentialExpiresAt(connectedAt, lifetime);
  return expiresAt !== null && now >= expiresAt;
}

/**
 * What this policy actually means once a connection vault exists.
 *
 * The premise at the top of this file — *"There is no server here to hold
 * those"* — stopped being true when the vault shipped. That changes what expiry
 * should **do**, without changing when it happens.
 *
 * | | Not vaulted | Vaulted |
 * |---|---|---|
 * | What expiry removes | The only copy | The local plaintext |
 * | What the user sees | Disconnected | Still connected, fetched on next use |
 * | What they must do | Re-paste the credential | Nothing |
 *
 * Getting this wrong is not subtle from the user's side. If a vaulted
 * credential is *disconnected* on local expiry, the connector says
 * "disconnected" while the encrypted copy is still on the server — and the next
 * vault read brings it straight back. The user watches a connection they were
 * told was dropped return from the dead, and nothing they do makes it stick.
 *
 * So for a vaulted credential this is a **lock**, not a disconnection: clear the
 * plaintext, keep the connection. That is strictly better than the old
 * behaviour, because the window in which a live credential sits in
 * `localStorage` shrinks and the user re-pastes nothing.
 *
 * The two clocks are now separate features and are named accordingly in the UI:
 *
 * - This one — *"Forget on this device after…"*
 * - `mawkingbird_profile`'s retention policy — *"Delete my stored copy after…"*
 */
export type ExpiryAction =
  /** Drop the credential. There is no other copy. */
  | 'disconnect'
  /** Clear the local plaintext; the vault still holds it. */
  | 'lock';

/**
 * Whether an expired credential should be dropped or merely forgotten locally.
 *
 * `vaulted` is passed in rather than looked up, so this module stays free of any
 * dependency on the vault. The direction matters: sessions already depend on
 * these pure functions and must stay constructible outside an injection context,
 * which their unit tests rely on.
 */
export function expiryAction(vaulted: boolean): ExpiryAction {
  return vaulted ? 'lock' : 'disconnect';
}

/**
 * Give a credential read back from storage a connected-at stamp if it lacks
 * one, persisting the backfill.
 *
 * Records written before this feature existed have no stamp. Treating "no
 * stamp" as "expired" would silently disconnect everyone on upgrade, so the
 * clock instead starts now — the user keeps their connection and it ages out on
 * schedule from here.
 */
export function ensureStamped<T extends ExpiringCredential>(key: string, value: T): T {
  if (typeof value.connectedAt === 'number') {
    return value;
  }
  const stamped = { ...value, connectedAt: Date.now() };
  try {
    localStorage.setItem(key, JSON.stringify(stamped));
  } catch {
    // Storage full or blocked: the in-memory stamp still bounds this session.
  }
  return stamped;
}

/** A connector whose stored credential is subject to the retention policy. */
export interface ExpiringConnection {
  /** Re-check the stored credential against the current policy and drop it if stale. */
  enforceLifetime(): void;
  /** When the current credential ages out, or null if none / policy is "never". */
  expiresAt(): number | null;
}

/**
 * Holds the retention policy for the settings UI and applies changes to the
 * governed connectors.
 *
 * The dependency runs one way only — this store injects the sessions, never the
 * reverse. The sessions need nothing but the pure functions above, which keeps
 * them constructible outside an injection context (as their unit tests do) and
 * keeps the policy out of their constructors.
 */
@Injectable({ providedIn: 'root' })
export class CredentialLifetimeStore {
  private readonly storageKey = scopedKey(STORAGE_KEY_BASE);
  readonly lifetime = signal<CredentialLifetime>(readCredentialLifetime());

  /**
   * The governed connectors, supplied by the caller.
   *
   * A setter rather than constructor injection so this module doesn't import
   * the sessions (which would pull GitHub/Raindrop/Bluesky into every bundle
   * that touches the policy). The Connections page — the only place the policy
   * can be changed — wires them up.
   */
  private connections: readonly ExpiringConnection[] = [];

  govern(connections: readonly ExpiringConnection[]): void {
    this.connections = connections;
  }

  /**
   * Change the policy and apply it immediately. Shortening it disconnects
   * anything already past the new limit rather than waiting for a reload.
   */
  set(lifetime: CredentialLifetime): void {
    try {
      localStorage.setItem(this.storageKey, lifetime);
    } catch {
      // Non-persistent, but honour it for this session.
    }
    this.lifetime.set(lifetime);
    this.enforceAll();
  }

  /** Re-check every governed connector against the current policy. */
  enforceAll(): void {
    for (const connection of this.connections) {
      connection.enforceLifetime();
    }
  }
}
