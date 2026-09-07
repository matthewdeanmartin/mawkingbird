import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { map, Observable, switchMap, tap } from 'rxjs';
import { externalFetch } from '../external-fetch';
import { scopedKey } from '../../account-scope';
import { ProfileAccountKey } from '../account/profile-account-key';
import { VaultBridge, type SyncOutcome } from '../vault/vault-bridge';
import { BlueskyOAuth } from './bluesky-oauth';
import {
  ACCOUNT_MODE_KEY,
  BSKY_IDENTITY_CREDENTIALS_KEY,
  blueskyIdentity,
  blueskyIdentityDid,
  clearBlueskyIdentity,
  blueskyIsPrimaryKind,
  saveBlueskyIdentity,
} from './bluesky-identity-store';
import {
  credentialExpired,
  credentialExpiresAt,
  ensureStamped,
  ExpiringCredential,
  ExpiringConnection,
} from '../credential-lifetime';

/**
 * The link is stored in two halves so a settings export can carry one and never
 * the other: the profile (who is linked) is `private`, the JWTs are `secret`.
 * In memory they stay a single {@link BskySession} — the split is purely a
 * storage concern. See `storage-registry.ts`.
 */
const PROFILE_KEY_BASE = 'mockingbird_bsky_profile';
const CREDENTIALS_KEY_BASE = 'mockingbird_bsky_credentials';

/** The default PDS; personal PDSes could be supported later via the login form. */
export const BSKY_SERVICE = 'https://bsky.social';

export interface BskySession extends ExpiringCredential {
  authMethod?: 'app-password' | 'oauth';
  service: string;
  handle: string;
  did: string;
  accessJwt?: string;
  refreshJwt?: string;
  displayName?: string;
  avatar?: string;
  /** The account's real PDS host (resolved lazily); chat calls must hit it, not the entryway. */
  pdsUrl?: string;
  /**
   * The app password this session was minted from, when known.
   *
   * Carried on the session so both persist paths store it without a second
   * parameter to thread. Absent for a session loaded from a blob written before
   * this existed, and for one restored from the vault on a device that has not
   * re-minted yet.
   */
  appPassword?: string;
}

interface LegacyBskySession extends BskySession {
  authMethod: 'app-password';
  accessJwt: string;
  refreshJwt: string;
}

interface SessionResponse {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

interface ProfileResponse {
  displayName?: string;
  avatar?: string;
}

/**
 * The secret half: the tokens, plus the retention stamp that governs them.
 *
 * `appPassword` is optional because it is only present for a session created by
 * a real login — one restored from an older browser blob predates it, and must
 * keep working without it.
 */
interface BskyCredentials extends ExpiringCredential {
  authMethod?: 'app-password';
  accessJwt: string;
  refreshJwt: string;
  /**
   * The app password the session was created with.
   *
   * Kept, rather than discarded after `createSession`, so another device can
   * mint its *own* session from the vault instead of asking the user to paste
   * it again. The JWTs deliberately do not travel: they rotate on every
   * refresh, so two devices sharing one pair would invalidate each other's
   * tokens in a loop. The stable credential is the app password, which is what
   * the user was hand-copying between devices anyway.
   */
  appPassword?: string;
}

/** What travels in the vault: the stable credential and who it belongs to. */
interface VaultedBskyCredential {
  identifier: string;
  appPassword: string;
}

type VaultedBskyIdentityCredentials = Record<string, VaultedBskyCredential>;

function isVaultedBskyCredential(value: unknown): value is VaultedBskyCredential {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const credential = value as Record<string, unknown>;
  return (
    typeof credential['identifier'] === 'string' && typeof credential['appPassword'] === 'string'
  );
}

/**
 * The exportable half: who is linked.
 *
 * `appPassword` is omitted explicitly. It lives on `BskySession` for convenience
 * in memory, but it is a secret — the whole point of this split is that a
 * settings export may carry the profile and never the credentials, and a new
 * secret field silently joining the exportable side is exactly the leak this
 * type exists to prevent.
 */
type BskyProfile = Omit<
  BskySession,
  'authMethod' | 'accessJwt' | 'refreshJwt' | 'connectedAt' | 'appPassword'
>;

/**
 * Rejoin the two halves. A profile with no credentials is not a usable link, so
 * the orphan is cleared — which is what a machine that imported settings but has
 * not re-authorized Bluesky yet will see.
 *
 * `governedByLifetime` is false for the primary identity. Retention is enforced
 * in two places — here, on load, and in `enforceLifetime()` — and exempting only
 * the latter would still delete a Bluesky-primary account's credentials on the
 * first boot after the window closed, before anything could intervene. The
 * reasoning for the exemption is on {@link BlueskySession.enforceLifetime}.
 */
function loadSession(
  profileKey: string,
  credentialsKey: string,
  governedByLifetime: boolean,
): BskySession | null {
  try {
    const profileRaw = localStorage.getItem(profileKey);
    const credentialsRaw = localStorage.getItem(credentialsKey);
    if (!profileRaw || !credentialsRaw) {
      localStorage.removeItem(profileKey);
      localStorage.removeItem(credentialsKey);
      return null;
    }
    const profile = JSON.parse(profileRaw) as BskyProfile;
    const credentials = ensureStamped(
      credentialsKey,
      JSON.parse(credentialsRaw) as BskyCredentials,
    );
    if (governedByLifetime && credentialExpired(credentials.connectedAt)) {
      localStorage.removeItem(profileKey);
      localStorage.removeItem(credentialsKey);
      return null;
    }
    return { ...profile, ...credentials };
  } catch {
    return null;
  }
}

/** Load the currently selected entry from the multi-identity Bluesky stable. */
function loadIdentitySession(): BskySession | null {
  const identity = blueskyIdentity();
  if (!identity) return null;
  return {
    ...identity.profile,
    ...identity.credentials,
  };
}

/**
 * The linked Bluesky account. Login is `com.atproto.server.createSession` with an
 * app password (revocable, made at bsky.app Settings → App Passwords) — never the
 * real account password. Access tokens are short-lived; `refresh()` swaps the
 * refresh token for a new pair and is invoked by BlueskyApi on ExpiredToken.
 *
 * ## Two roles, one class
 *
 * Under a Mastodon-primary or Anonymous account, a Bluesky link is a
 * **connector**: one of several networks hanging off someone else's identity,
 * stored per-account at `scopedKey(...)` so a link made as one persona is not
 * visible as another.
 *
 * Under a Bluesky-primary account it **is** the identity, and lives in the
 * unscoped identity keys (see `bluesky-identity-store.ts`) — scoping it by the
 * active account would be circular, since the suffix derives from the DID inside
 * the thing being scoped.
 *
 * Which pair of keys this instance uses is decided here, at construction, and
 * nowhere else. That is deliberate: every consumer in the app
 * (`BlueskyApi`, `BlueskyChatApi`, `BlueskyProvider`, `BlueskyReply`) injects
 * this singleton and reads `session()`, so resolving the role in one place means
 * a Bluesky-primary account lights all of them up with no changes of their own.
 */
@Injectable({ providedIn: 'root' })
export class BlueskySession implements ExpiringConnection {
  private http = inject(HttpClient);
  private bridge = inject(VaultBridge);
  private accountKey = inject(ProfileAccountKey);
  private oauth = inject(BlueskyOAuth);

  /**
   * Whether this instance is the app's identity rather than a connector.
   *
   * Read from storage rather than from `Auth` on purpose: `Auth` injects nothing
   * from `providers/`, and taking a dependency the other way would close a cycle
   * (`account-scope` → identity store → ... ). The mode key and the identity
   * store are the same two facts `Auth.storedKind()` consults, so the two cannot
   * disagree.
   */
  private readonly isIdentity = blueskyIsPrimaryKind();

  /**
   * Resolved once at construction. Account switches hard-reload the app, which
   * reconstructs this against the new account's keys — including switching
   * between the identity pair and a connector pair.
   */
  private readonly profileKey = scopedKey(PROFILE_KEY_BASE);
  private readonly credentialsKey = scopedKey(CREDENTIALS_KEY_BASE);
  readonly session = signal<BskySession | null>(
    this.isIdentity
      ? loadIdentitySession()
      : loadSession(this.profileKey, this.credentialsKey, true),
  );
  readonly linked = computed(() => this.session() !== null);

  /** True when this Bluesky account is the identity the app is signed in as. */
  get isPrimaryIdentity(): boolean {
    return this.isIdentity;
  }

  /**
   * When this link ages out under the retention policy, or null.
   *
   * Always null for the primary identity — see {@link enforceLifetime}.
   */
  expiresAt(): number | null {
    return this.isIdentity ? null : credentialExpiresAt(this.session()?.connectedAt);
  }

  /**
   * Drop the link if it has outlived the retention policy. The clock runs from
   * the original login, not from the last token refresh — otherwise a session
   * that keeps refreshing itself would never age out, which is exactly the
   * situation the policy exists to end.
   *
   * **The retention policy does not apply to the primary identity.** Read the
   * policy's own rationale (`credential-lifetime.ts`): it exists so that "I
   * connected GitHub once in 2024" stops being true by default — it governs
   * *connector* credentials the user has forgotten about. The account you are
   * signed in *as* is not a forgotten side-connection, and expiring it would
   * sign the user out of the whole app after 90 days by default, with no action
   * on their part.
   *
   * Worse, it would leave `ACCOUNT_MODE_KEY = 'bluesky'` with no identity behind
   * it — precisely the stale-key state Sprint 1 built two separate guards
   * against. Signing out is `Auth`'s job, through an exit the user chose.
   */
  enforceLifetime(): void {
    if (this.isIdentity) {
      return;
    }
    const session = this.session();
    if (session && credentialExpired(session.connectedAt)) {
      this.unlink();
    }
  }

  /** Authenticate and store the result as a **connector** under the active account. */
  login(identifier: string, appPassword: string): Observable<BskySession> {
    return this.authenticate(identifier, appPassword).pipe(tap((session) => this.persist(session)));
  }

  /**
   * Authenticate and store the result as the app's **primary identity**.
   *
   * Separate from {@link login} because of an ordering problem, not a protocol
   * one: this instance resolved its storage keys at construction, and at the
   * moment a first-time Bluesky login is submitted the active kind is not yet
   * `bluesky` — so `this.profileKey` is a *connector* key. Writing the identity
   * through it would file the app's identity under the previous account's
   * namespace, where the next boot would never look for it.
   *
   * So the write goes explicitly to the unscoped identity keys. The network round
   * trip is shared; only the destination differs.
   *
   * The caller is expected to follow this with `Auth.enterBluesky()`, which is
   * what makes the identity active — this method deliberately does not touch the
   * account-kind key, so a failed or abandoned login cannot leave the app
   * claiming to be signed in.
   */
  loginAsIdentity(identifier: string, appPassword: string): Observable<BskySession> {
    return this.authenticate(identifier, appPassword).pipe(
      tap((session) => {
        const previouslyActiveDid = blueskyIdentityDid();
        const {
          authMethod: _authMethod,
          accessJwt,
          refreshJwt,
          connectedAt,
          appPassword: pw,
          ...profile
        } = session;
        saveBlueskyIdentity(
          profile,
          {
            authMethod: 'app-password',
            accessJwt,
            refreshJwt,
            connectedAt,
            ...(pw ? { appPassword: pw } : {}),
          },
          true,
        );
        // Straight to the identity keys rather than through `persist`, so the
        // vault write must be requested here too. Always the identity base:
        // this instance may still be holding *connector* keys (see the ordering
        // note above), and writing the identity under a connector scope would
        // file it where no later boot looks.
        if (pw) {
          void this.syncIdentityCredentialToVault(
            session.did,
            session.handle,
            pw,
            previouslyActiveDid,
          );
        }
        // Reflect it in memory too, so a caller that reads `session()` between the
        // write and the reload (the login page, attributing the new account) sees
        // the account it just signed in as rather than a stale connector.
        this.session.set(session);
      }),
    );
  }

  /** Redirect to the account's own PDS authorization screen. */
  async beginOAuthIdentity(identifier: string, adding: boolean): Promise<never> {
    return this.oauth.signIn(identifier, adding);
  }

  /**
   * Finish an OAuth callback and add its DID to the first-class identity stable.
   *
   * Only the profile and an OAuth marker go to localStorage. The official SDK
   * owns the DPoP key and rotating token set in IndexedDB.
   */
  async finishOAuthIdentity(): Promise<{ session: BskySession; adding: boolean }> {
    const result = await this.oauth.callback();
    const session: BskySession = {
      ...result.profile,
      authMethod: 'oauth',
      connectedAt: Date.now(),
    };
    saveBlueskyIdentity(
      result.profile,
      { authMethod: 'oauth', connectedAt: session.connectedAt },
      true,
    );
    this.session.set(session);
    return { session, adding: result.state === 'identity:add' };
  }

  /** Whether authenticated calls must go through the OAuth DPoP transport. */
  isOAuthSession(): boolean {
    return this.session()?.authMethod === 'oauth';
  }

  /** Authenticated fetch for OAuth callers; refresh and DPoP stay SDK-owned. */
  oauthFetch(pathname: string, init?: RequestInit): Promise<Response> {
    const current = this.session();
    if (!current || current.authMethod !== 'oauth') {
      return Promise.reject(new Error('No Bluesky OAuth session is active.'));
    }
    return this.oauth.fetch(current.did, pathname, init);
  }

  /**
   * The `createSession` round trip, plus the profile fetch that gives the account
   * a display name and avatar. Persists nothing — callers choose where it lands.
   */
  private authenticate(identifier: string, appPassword: string): Observable<LegacyBskySession> {
    return this.http
      .post<SessionResponse>(
        `${BSKY_SERVICE}/xrpc/com.atproto.server.createSession`,
        { identifier, password: appPassword },
        { context: externalFetch() },
      )
      .pipe(
        map(
          (res): LegacyBskySession => ({
            authMethod: 'app-password',
            service: BSKY_SERVICE,
            handle: res.handle,
            did: res.did,
            accessJwt: res.accessJwt,
            refreshJwt: res.refreshJwt,
            // Kept so `persist` can vault it — see BskyCredentials.appPassword.
            appPassword,
            // Retention starts here and is carried through every later
            // persist() (refresh, PDS discovery) untouched.
            connectedAt: Date.now(),
          }),
        ),
        // Grab display name + avatar so the UI can attribute the viewer's own replies.
        switchMap((session) =>
          this.http
            .get<ProfileResponse>(
              `${session.service}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(session.did)}`,
              {
                headers: { Authorization: `Bearer ${session.accessJwt}` },
                context: externalFetch(),
              },
            )
            .pipe(
              map((profile) => ({
                ...session,
                displayName: profile.displayName,
                avatar: profile.avatar,
              })),
            ),
        ),
      );
  }

  /** Swap the refresh token for a fresh access/refresh pair. */
  refresh(): Observable<BskySession> {
    const current = this.session();
    if (!current || current.authMethod === 'oauth' || !current.refreshJwt) {
      throw new Error('No Bluesky session to refresh.');
    }
    return this.http
      .post<SessionResponse>(`${current.service}/xrpc/com.atproto.server.refreshSession`, null, {
        headers: { Authorization: `Bearer ${current.refreshJwt}` },
        context: externalFetch(),
      })
      .pipe(
        map((res) => ({ ...current, accessJwt: res.accessJwt, refreshJwt: res.refreshJwt })),
        tap((session) => this.persist(session)),
      );
  }

  /** Remember the resolved PDS host so chat calls skip the DID lookup next time. */
  setPdsUrl(url: string): void {
    const current = this.session();
    if (current && current.pdsUrl !== url) {
      const updated = { ...current, pdsUrl: url };
      if (current.authMethod === 'oauth' && this.isIdentity) {
        const { authMethod: _authMethod, connectedAt, ...profile } = updated;
        saveBlueskyIdentity(profile, { authMethod: 'oauth', connectedAt }, true);
        this.session.set(updated);
      } else {
        this.persist(updated);
      }
    }
  }

  /** Refresh the small identity snapshot used by the account switcher and shell. */
  updateProfileSnapshot(profile: { displayName: string; avatar?: string }): void {
    const current = this.session();
    if (!current) return;
    const updated = { ...current, ...profile };
    if (this.isIdentity) {
      const identity = blueskyIdentity(current.did);
      if (!identity) return;
      saveBlueskyIdentity({ ...identity.profile, ...profile }, identity.credentials, true);
      this.session.set(updated);
      return;
    }
    this.persist(updated);
  }

  /**
   * Forget the linked account (tokens dropped; revoke the app password on bsky.app).
   *
   * For the **primary identity** this also clears the account-kind key, because
   * the alternative is worse: a `bluesky` kind with no identity behind it is the
   * stale-key state, and the app would boot claiming to be signed in as an
   * account whose credentials no longer exist. Dropping the kind leaves the
   * browser signed out, which is what removing your only identity means.
   *
   * Callers that want a graceful sign-out should go through `Auth` (which offers
   * the leave dialog and its export) rather than here; this is the blunt path,
   * reached from Settings → Connections → Unlink.
   */
  unlink(): void {
    const current = this.session();
    if (current?.authMethod === 'oauth') {
      // Revocation is best effort: local removal must still work offline.
      void this.oauth.revoke(current.did).catch(() => undefined);
    }
    if (this.isIdentity) {
      clearBlueskyIdentity(this.session()?.did ?? null);
      localStorage.removeItem(ACCOUNT_MODE_KEY);
    } else {
      localStorage.removeItem(this.profileKey);
      localStorage.removeItem(this.credentialsKey);
    }
    this.session.set(null);
  }

  /** Write the profile and the tokens to their separate keys. */
  private persist(session: BskySession): void {
    if (!session.accessJwt || !session.refreshJwt) {
      throw new Error('An app-password session is missing its token pair.');
    }
    const {
      authMethod: _authMethod,
      accessJwt,
      refreshJwt,
      connectedAt,
      appPassword,
      ...profile
    } = session;
    // Read before the write, so "did this login introduce a new password?" can
    // be answered below.
    const previous = this.storedAppPassword();
    const credentials = {
      authMethod: 'app-password' as const,
      accessJwt,
      refreshJwt,
      connectedAt,
      ...(appPassword ? { appPassword } : {}),
    } satisfies BskyCredentials;
    if (this.isIdentity) {
      saveBlueskyIdentity(profile, credentials, true);
    } else {
      localStorage.setItem(this.profileKey, JSON.stringify(profile));
      localStorage.setItem(this.credentialsKey, JSON.stringify(credentials));
    }
    this.session.set(session);
    // Vault the app password only when it is *new* to storage.
    //
    // The in-memory session carries it forward across refreshes and PDS
    // discovery (both go through here), so a bare `if (appPassword)` wrote to
    // the vault on every token refresh — churn the one-blob vault design is not
    // shaped for, and the exact cost that keeps `mockingbird_paste_edit_keys`
    // out of the manifest. Comparing against what was already stored means a
    // write happens on a real login and a password change, and nowhere else.
    if (appPassword && appPassword !== previous) {
      void this.syncCredentialToVault(session.handle, appPassword);
    }
  }

  /**
   * Push the app password to the vault, so the next device does not ask for it.
   *
   * Not awaited: connecting should feel instant, and a vault that is locked or
   * switched off must not fail the login. `VaultBridge.writeThrough` reports
   * `skipped` in those cases rather than throwing.
   */
  private async syncCredentialToVault(identifier: string, appPassword: string): Promise<void> {
    if (this.isIdentity) {
      const did = this.session()?.did;
      if (did) await this.syncIdentityCredentialToVault(did, identifier, appPassword);
      return;
    }
    await this.bridge.writeThrough(
      this.credentialsBase,
      JSON.stringify({ identifier, appPassword } satisfies VaultedBskyCredential),
      this.vaultAccountKey(),
    );
  }

  /**
   * The vaulted app password for this account, or null.
   *
   * Read by the login page so a device that has the vault open can offer to
   * sign in without a paste. Deliberately returns the credential rather than
   * logging in itself: minting the session is `login`/`loginAsIdentity`'s job,
   * and which of the two applies is the caller's decision, not this method's.
   */
  vaultedCredential(): VaultedBskyCredential | null {
    const raw = this.bridge.readThrough(this.credentialsBase, this.vaultAccountKey());
    if (!raw) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (this.isIdentity && !isVaultedBskyCredential(parsed)) {
        const did = this.session()?.did;
        return did && parsed && typeof parsed === 'object'
          ? ((parsed as VaultedBskyIdentityCredentials)[did] ?? null)
          : null;
      }
      return isVaultedBskyCredential(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /** Push whatever app password is stored locally, for the settings page's
   *  explicit "sync now". Returns what happened so the UI can report it. */
  async syncToVault(): Promise<SyncOutcome> {
    const session = this.session();
    const appPassword = this.storedAppPassword();
    if (!session || !appPassword) return { kind: 'skipped' };
    if (this.isIdentity) {
      return this.syncIdentityCredentialToVault(session.did, session.handle, appPassword);
    }
    return this.bridge.writeThrough(
      this.credentialsBase,
      JSON.stringify({
        identifier: session.handle,
        appPassword,
      } satisfies VaultedBskyCredential),
      this.vaultAccountKey(),
    );
  }

  /** The app password from the local credentials blob, when one was stored. */
  private storedAppPassword(): string | null {
    if (this.isIdentity) return this.session()?.appPassword ?? null;
    try {
      const raw = localStorage.getItem(this.credentialsKey);
      return raw ? ((JSON.parse(raw) as BskyCredentials).appPassword ?? null) : null;
    } catch {
      return null;
    }
  }

  /**
   * The registry base this instance vaults under, matching the storage key it
   * already chose at construction.
   */
  private get credentialsBase(): string {
    return this.isIdentity ? BSKY_IDENTITY_CREDENTIALS_KEY : CREDENTIALS_KEY_BASE;
  }

  /**
   * The vault scope key. The identity credential is registered `browser`-scoped
   * (its storage key is unscoped, because the DID it would be scoped by lives
   * inside it), so it passes null; the connector is `account`-scoped.
   */
  private vaultAccountKey(): string | null {
    return this.isIdentity ? null : this.accountKey.current();
  }

  /**
   * The identity vault remains browser-scoped for backward compatibility, but
   * its value is now a DID-keyed map so adding an alt cannot overwrite another
   * identity's app password. A legacy singleton is folded into the map.
   */
  private async syncIdentityCredentialToVault(
    did: string,
    identifier: string,
    appPassword: string,
    legacyDid: string | null = this.session()?.did ?? null,
  ): Promise<SyncOutcome> {
    const raw = this.bridge.readThrough(BSKY_IDENTITY_CREDENTIALS_KEY, null);
    let credentials: VaultedBskyIdentityCredentials = {};
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isVaultedBskyCredential(parsed)) {
          if (legacyDid) {
            credentials[legacyDid] = {
              identifier: parsed.identifier,
              appPassword: parsed.appPassword,
            };
          }
        } else {
          credentials =
            parsed && typeof parsed === 'object' ? (parsed as VaultedBskyIdentityCredentials) : {};
        }
      } catch {
        credentials = {};
      }
    }
    credentials[did] = { identifier, appPassword };
    return this.bridge.writeThrough(
      BSKY_IDENTITY_CREDENTIALS_KEY,
      JSON.stringify(credentials),
      null,
    );
  }
}
