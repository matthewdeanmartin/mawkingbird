/**
 * The **Mastodon connector**: Mastodon as something that hangs off an identity,
 * rather than as the identity itself.
 *
 * ## The three states, and why `absent` is one of them
 *
 * ```
 * absent      ← default for a Bluesky-primary account. No rails, no nav, no
 *               search default, and no requests.
 * anonymous   ← opted in, no credentials. Reads a public server.
 * signed-in   ← opted in, with credentials. Full read/write.
 * ```
 *
 * An earlier plan had this slot always occupied, defaulting to reading
 * `mastodon.social` anonymously and silently — the reasoning being that an
 * anonymous Mastodon source is free, so nobody could object to it being on.
 *
 * That was wrong, and the user reversed it (2026-08-12):
 *
 * > "Providing a bsky user with an automatically available anonymous mastodon
 * > experience creates costs (screen clutter) that the user didn't opt into."
 *
 * It is free in the *feed*, where an extra source is invisible until it has
 * something to show. It is not free in the **chrome**: a live connector spends
 * rail widgets, nav entries and the search default on a network the visitor
 * never asked for. So the slot starts empty and is *offered*, and both credential
 * levels are opted into. Anonymous is a real destination, not a waiting room on
 * the way to signing in.
 *
 * ## Storage
 *
 * Account-scoped, unlike `bluesky-identity-store.ts`. That file explains the
 * distinction from the other side: a Bluesky-primary account's *own* session is
 * the identity, so scoping it by the active account would be circular. This is
 * the mirror image — a connector is one of several networks hanging off an
 * identity, so it scopes per account exactly as the Bluesky *connector* does, and
 * a connector set up as one persona is not visible as another.
 *
 * The profile/secret split is the same pattern as everywhere else in the app: the
 * server and state are `private` and may ride along in a personal backup, the
 * token is `secret` and never leaves the browser.
 */

import { Injectable, computed, signal } from '@angular/core';
import { Account } from '../../models';
import { scopedKey, scopeSuffixForDid } from '../../account-scope';

/** Where an opted-in connector points when the user has not chosen otherwise. */
export const DEFAULT_CONNECTOR_SERVER = 'https://mastodon.social';

/** The non-secret half: which server, and whether credentials exist. */
export const MASTODON_CONNECTOR_PROFILE_KEY = 'mockingbird_mastodon_connector';

/** The bearer token. Never exported, under any profile. */
export const MASTODON_CONNECTOR_TOKEN_KEY = 'mockingbird_mastodon_connector_token';

/**
 * The connector's state.
 *
 * `absent` is modelled as a state rather than as `null` so that call sites have
 * to name it. "There is no connector" and "the connector is anonymous" produce
 * very different chrome, and a nullable type invites reading the second as a
 * fallback for the first — which is exactly the silent-default behaviour the
 * reversal removed.
 */
export type MastodonConnectorState =
  | { state: 'absent' }
  | { state: 'anonymous'; server: string }
  | { state: 'signed-in'; server: string; account: Account | null };

/** The persisted shape of the profile half. Token lives separately. */
interface StoredConnector {
  state: 'anonymous' | 'signed-in';
  server: string;
  account?: Account | null;
}

/**
 * Read the persisted connector, tolerating anything this build does not
 * recognise.
 *
 * A `signed-in` record whose token is missing degrades to `anonymous` rather
 * than being discarded: the user opted into Mastodon, and losing the credential
 * (a settings import that carried the profile but not the secret) should cost
 * them the *credential*, not the opt-in. This mirrors how `loadSessions()` drops
 * a tokenless session — except that here there is still something useful behind
 * it, because anonymous reading works.
 */
function loadConnector(): MastodonConnectorState {
  let raw: string | null;
  try {
    raw = localStorage.getItem(scopedKey(MASTODON_CONNECTOR_PROFILE_KEY));
  } catch {
    return { state: 'absent' };
  }
  if (!raw) {
    return { state: 'absent' };
  }
  let stored: StoredConnector;
  try {
    stored = JSON.parse(raw) as StoredConnector;
  } catch {
    return { state: 'absent' };
  }
  const server = typeof stored?.server === 'string' && stored.server ? stored.server : null;
  if (!server) {
    return { state: 'absent' };
  }
  if (stored.state === 'signed-in') {
    return storedToken()
      ? { state: 'signed-in', server, account: stored.account ?? null }
      : { state: 'anonymous', server };
  }
  if (stored.state === 'anonymous') {
    return { state: 'anonymous', server };
  }
  return { state: 'absent' };
}

/** The connector's bearer token, or null. */
function storedToken(): string | null {
  try {
    return localStorage.getItem(scopedKey(MASTODON_CONNECTOR_TOKEN_KEY));
  } catch {
    return null;
  }
}

/**
 * The connector's token, for `Auth` to restore into `Auth.token()` at startup.
 *
 * A bare function rather than a method for the same reason
 * `blueskyIdentityDid()` is one: `Auth` is constructed before any provider
 * service could be injected into it, and importing this class there would close
 * a dependency cycle (`auth.ts` → `providers/` → `account-scope.ts`). Reading
 * localStorage directly keeps the direction of dependency one-way.
 *
 * Returns the token only when the connector is actually signed in — a stored
 * token behind an `anonymous` record is a leftover, and honouring it would
 * authenticate calls the user asked to make anonymously.
 */
export function mastodonConnectorToken(): string | null {
  return loadConnector().state === 'signed-in' ? storedToken() : null;
}

/**
 * Forget a connector's credentials from outside the service.
 *
 * Needed by `Auth` on the paths that drop the Bluesky identity. A connector
 * outliving the identity it hangs off is not merely untidy: `storedKind()`
 * treats a bare token as evidence of a mastodon-primary account, so an orphaned
 * connector token can promote itself into the identity on the next reload.
 */
export function clearMastodonConnectorToken(): void {
  try {
    localStorage.removeItem(scopedKey(MASTODON_CONNECTOR_TOKEN_KEY));
  } catch {
    // Best effort — the caller is already tearing the identity down.
  }
}

/** Forget the connector token for a specific Bluesky alt, active or not. */
export function clearMastodonConnectorTokenForDid(did: string): void {
  try {
    localStorage.removeItem(`${MASTODON_CONNECTOR_TOKEN_KEY}${scopeSuffixForDid(did)}`);
  } catch {
    // Best effort — the caller is already tearing the identity down.
  }
}

/**
 * The Mastodon connector for the active account.
 *
 * Deliberately knows nothing about `Auth`. Whether this connector is *relevant*
 * — it is only meaningful for a Bluesky-primary account, since under a
 * Mastodon-primary one Mastodon is the identity and not a connector — is a
 * question about the active identity, and `Auth` owns it. Importing `Auth` here
 * would close the same dependency cycle `bluesky-identity-store.ts` documents.
 */
@Injectable({ providedIn: 'root' })
export class MastodonConnector {
  private state = signal<MastodonConnectorState>(loadConnector());

  /** The connector's current state. */
  readonly current = this.state.asReadonly();

  /** Whether the user has opted into Mastodon at all. */
  readonly optedIn = computed(() => this.state().state !== 'absent');

  /** Whether the connector can make authenticated calls. */
  readonly signedIn = computed(() => this.state().state === 'signed-in');

  /**
   * The server this connector points at, or null when absent.
   *
   * Null rather than the default server, so that a caller cannot accidentally
   * make a request on behalf of a connector that does not exist.
   */
  readonly server = computed(() => {
    const current = this.state();
    return current.state === 'absent' ? null : current.server;
  });

  /** The connector's bearer token, or null when it has none. */
  token(): string | null {
    return this.state().state === 'signed-in' ? storedToken() : null;
  }

  /**
   * Opt in without credentials — the "read Mastodon, no account" path.
   *
   * Defaults to {@link DEFAULT_CONNECTOR_SERVER} so that opting in is one click
   * to a working Explore. Choosing a different server is a separate, later
   * decision (`setServer`) rather than a question asked up front.
   */
  enableAnonymous(server: string = DEFAULT_CONNECTOR_SERVER): void {
    this.persist({ state: 'anonymous', server });
  }

  /**
   * Point the connector at a different server.
   *
   * Signing out of the current server's credentials is implied: a token is only
   * valid against the instance that issued it, so carrying it across would
   * guarantee a 401 on every subsequent call. No-ops when absent — there is
   * nothing to repoint, and materialising a connector here would be an opt-in
   * the user did not make.
   */
  setServer(server: string): void {
    if (!this.optedIn() || !server) {
      return;
    }
    this.clearToken();
    this.persist({ state: 'anonymous', server });
  }

  /** Attach credentials for `server`, upgrading the connector to signed-in. */
  signIn(token: string, server: string, account: Account | null = null): void {
    try {
      localStorage.setItem(scopedKey(MASTODON_CONNECTOR_TOKEN_KEY), token);
    } catch {
      return;
    }
    this.persist({ state: 'signed-in', server, account });
  }

  /** Refresh the stored account snapshot after a verify. */
  setAccount(account: Account | null): void {
    const current = this.state();
    if (current.state !== 'signed-in') {
      return;
    }
    this.persist({ state: 'signed-in', server: current.server, account });
  }

  /**
   * Drop the credentials, keeping the opt-in.
   *
   * Back to anonymous, **not** to absent: the user asked to sign out of a
   * Mastodon account, not to stop reading Mastodon. Undoing the opt-in entirely
   * is {@link disable}, and it is a different button.
   */
  signOut(): void {
    const current = this.state();
    if (current.state !== 'signed-in') {
      return;
    }
    this.clearToken();
    this.persist({ state: 'anonymous', server: current.server });
  }

  /** Undo the opt-in entirely, forgetting the server and any credentials. */
  disable(): void {
    this.clearToken();
    try {
      localStorage.removeItem(scopedKey(MASTODON_CONNECTOR_PROFILE_KEY));
    } catch {
      // Nothing to do: the in-memory state below is what the app reads.
    }
    this.state.set({ state: 'absent' });
  }

  private clearToken(): void {
    try {
      localStorage.removeItem(scopedKey(MASTODON_CONNECTOR_TOKEN_KEY));
    } catch {
      // Best effort; the state transition still stands.
    }
  }

  private persist(next: Exclude<MastodonConnectorState, { state: 'absent' }>): void {
    const stored: StoredConnector =
      next.state === 'signed-in'
        ? { state: 'signed-in', server: next.server, account: next.account }
        : { state: 'anonymous', server: next.server };
    try {
      localStorage.setItem(scopedKey(MASTODON_CONNECTOR_PROFILE_KEY), JSON.stringify(stored));
    } catch {
      // Storage full or unavailable: keep the in-memory state so the session
      // still works, and let it be lost on reload rather than failing the call.
    }
    this.state.set(next);
  }
}
