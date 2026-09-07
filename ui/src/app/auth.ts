import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { ClientPrefs } from './client-prefs';
import { adoptMastodonStorageScope } from './account-scope';
import { Account } from './models';
import { AnonymousAccount } from './providers/anonymous/anonymous-account';
import {
  blueskyIdentities,
  blueskyIdentity,
  blueskyIdentityDid,
  blueskyIdentityPresent,
  clearAllBlueskyIdentities,
  clearBlueskyIdentity,
  setActiveBlueskyIdentity,
} from './providers/bluesky/bluesky-identity-store';
import { BlueskyOAuth } from './providers/bluesky/bluesky-oauth';
import {
  clearMastodonConnectorTokenForDid,
  mastodonConnectorToken,
} from './providers/mastodon/mastodon-connector';
import { Server } from './server';
import { SessionDiagnostics } from './session-diagnostics';

const TOKEN_KEY = 'mastodon_mock_token';
const SESSIONS_KEY = 'mastodon_mock_sessions';
/**
 * Bearer tokens, split out of {@link SESSIONS_KEY} and keyed by session id.
 *
 * The session list — which accounts, on which instances — is exactly what a
 * settings export wants to carry, and the token is exactly what it must never
 * carry. Keeping them in one object made that impossible to express, so the
 * secret lives here and the two are joined by `Session.id`. See
 * `storage-registry.ts`.
 */
const SESSION_TOKENS_KEY = 'mastodon_mock_session_tokens';
export const ACCOUNT_MODE_KEY = 'mastodon_mock_account_mode';

/**
 * Which network an account is *primary* on.
 *
 * An account has a kind, and the kind decides which network owns the identity;
 * every other network attaches to it as a connector. `mastodon` was the only
 * real kind for most of this app's life, which is why so much of it assumes a
 * bearer token exists.
 *
 * `anonymous` predates this type and was bolted onto an enum whose name said
 * Mastodon — it was always a poor fit for a Mastodon-primary identity model.
 * Generalising to kinds makes it a first-class citizen, as a side effect of
 * making `bluesky` one.
 */
export type AccountKind = 'mastodon' | 'bluesky' | 'anonymous';

/**
 * @deprecated Use {@link AccountKind}. Kept so existing imports keep compiling;
 * the two are the same type.
 */
export type AccountMode = AccountKind;

/** Read the persisted kind, ignoring anything this build does not recognise. */
function storedKind(): AccountKind | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(ACCOUNT_MODE_KEY);
  } catch {
    return null;
  }
  if (raw === 'anonymous') {
    return 'anonymous';
  }
  if (raw === 'bluesky') {
    // A `bluesky` kind is only honoured when the identity it names is actually
    // in storage. Otherwise a stale mode key — left by a settings import that
    // carried the profile but not the JWTs, or by a half-finished unlink —
    // would strand the app in an account that cannot make a single request.
    return blueskyIdentityPresent() ? 'bluesky' : null;
  }
  if (raw === 'mastodon') {
    return 'mastodon';
  }
  // No mode key at all: the pre-modes layout, where the presence of a token was
  // itself the signal. Still the state after `setToken` on an old build.
  try {
    return localStorage.getItem(TOKEN_KEY) ? 'mastodon' : null;
  } catch {
    return null;
  }
}

/** A saved login: a token plus a snapshot of the account it belongs to. */
export interface Session {
  /** Stable local id joining this session to its token in storage. */
  id: string;
  token: string;
  /**
   * Instance this token belongs to (base URL, e.g. "https://mastodon.social"; "" means
   * "this server"). A token is only valid against its own instance, so switching accounts
   * must restore this server first — otherwise verify_credentials hits the wrong host and
   * 401s. May be undefined for sessions saved before this field existed.
   */
  server?: string;
  /** Account snapshot for the switcher UI (avatar, name). Refreshed on verify. */
  account: Account | null;
}

/** One row in the account switcher, including the permanent virtual account. */
export interface AccountChoice {
  key: string;
  kind: AccountMode;
  token: string | null;
  /** Stable identity key for tokenless Bluesky account choices. */
  did?: string;
  server: string;
  account: Account | null;
}

/** The non-secret half of a saved session, as persisted. */
type StoredSession = Omit<Session, 'token'>;

/**
 * Rejoin the session list with its tokens.
 *
 * A session whose token is missing is dropped: without it there is nothing to
 * authenticate with, so keeping the row would only offer the user a login that
 * cannot work. That is also what happens after importing settings on a new
 * machine — the accounts come back as soon as they are signed into again.
 */
function loadSessions(): Session[] {
  try {
    const rows = JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]') as unknown;
    const tokens = JSON.parse(localStorage.getItem(SESSION_TOKENS_KEY) ?? '{}') as Record<
      string,
      string
    >;
    if (!Array.isArray(rows)) {
      return [];
    }
    return (rows as StoredSession[])
      .filter((row) => typeof row?.id === 'string' && typeof tokens[row.id] === 'string')
      .map((row) => ({ ...row, token: tokens[row.id] }));
  } catch {
    return [];
  }
}

/** A fresh session id. Opaque and local — never derived from the token. */
function newSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Where a Bluesky-primary account "lives", for the switcher's server column.
 *
 * Bluesky has no per-user instance the way Mastodon does, so there is nothing
 * to restore on a switch. The constant keeps `AccountChoice.server` a string
 * rather than making it nullable for one kind.
 */
const BSKY_PRIMARY_SERVER = 'https://bsky.app';

/**
 * The Bluesky-primary identity as a Mastodon-shaped {@link Account}, for the
 * switcher and the rail.
 *
 * This is the same adaptation the Bluesky provider does for posts and profiles,
 * applied to the one account the app is *signed in as*. Doing it here keeps the
 * rule that nothing outside `providers/` learns another protocol exists: the
 * switcher gets an `Account`, exactly as it does for Mastodon and Anonymous.
 *
 * Only the fields a switcher row can show are populated. Counts are zero rather
 * than invented — the real figures need a `getProfile` call, and four zeroes
 * that look like a tally would be worse than the rail's existing behaviour of
 * omitting the stats row until they arrive.
 */
function blueskyIdentityAccount(
  requestedDid: string | null = blueskyIdentityDid(),
): { did: string; account: Account } | null {
  const identity = blueskyIdentity(requestedDid);
  if (!identity) return null;
  const profile = identity.profile;
  const did = profile.did;
  const handle = profile.handle;
  if (!did || !handle) {
    return null;
  }
  return {
    did,
    account: {
      // Namespaced, per the standing rule that foreign ids can never collide
      // with real Mastodon ids in an id-keyed timeline or cache.
      id: `bsky:${did}`,
      username: handle,
      acct: handle,
      display_name: profile.displayName || handle,
      note: '',
      url: `https://bsky.app/profile/${handle}`,
      avatar: profile.avatar ?? '',
      avatar_static: profile.avatar ?? '',
      header: '',
      header_static: '',
      followers_count: 0,
      following_count: 0,
      statuses_count: 0,
      bot: false,
      locked: false,
      fields: [],
    },
  };
}

/**
 * Holds the active access token plus a Twitter-style stable of saved sessions so a
 * tester can switch accounts without re-pasting tokens. The active token is mirrored
 * to ``TOKEN_KEY`` for the interceptor and back-compat.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  private server = inject(Server);
  private anonymous = inject(AnonymousAccount);
  private prefs = inject(ClientPrefs);
  private diagnostics = inject(SessionDiagnostics);
  private blueskyOAuth = inject(BlueskyOAuth);

  /** The active account's kind. Null when signed out. */
  readonly kind = signal<AccountKind | null>(storedKind());

  /**
   * @deprecated Use {@link kind}. An alias, so the ~250 existing readers of
   * `mode()` keep working unchanged.
   */
  readonly mode = this.kind;

  /**
   * The bearer token for Mastodon API calls, whoever it belongs to.
   *
   * Two different things arrive here, and the interceptor cannot tell them
   * apart — which is the point. For a mastodon-primary account this is the
   * *identity's* token, restored from `TOKEN_KEY`. For a Bluesky-primary account
   * it is the **connector's** token, restored from the connector's own scoped
   * storage. Both authenticate the same requests; only one of them says who the
   * user is. See {@link connectMastodon}.
   */
  readonly token = signal<string | null>(
    this.kind() === 'mastodon'
      ? localStorage.getItem(TOKEN_KEY)
      : this.kind() === 'bluesky'
        ? mastodonConnectorToken()
        : null,
  );
  private mastodonAccount = signal<Account | null>(null);
  /** The Bluesky-primary account's DID, when that is the active kind. */
  private blueskyDid = signal<string | null>(
    this.kind() === 'bluesky' ? blueskyIdentityDid() : null,
  );
  readonly account = linkedSignal(() => {
    if (this.kind() === 'anonymous') {
      return this.anonymous.account();
    }
    if (this.kind() === 'bluesky') {
      // Read through blueskyDid so this recomputes on a switch; the DID itself
      // is only the trigger, the profile behind it is the payload.
      return this.blueskyDid() ? (blueskyIdentityAccount()?.account ?? null) : null;
    }
    return this.mastodonAccount();
  });

  /** Every account the tester has logged into and not removed. */
  readonly sessions = signal<Session[]>(loadSessions());
  private readonly blueskyRevision = signal(0);

  /** Every saved first-class Bluesky identity, including the active one. */
  readonly blueskyAccounts = computed<AccountChoice[]>(() => {
    // Signals are dependencies; the identity collection itself lives in localStorage.
    this.kind();
    this.blueskyDid();
    this.blueskyRevision();
    return blueskyIdentities().flatMap((stored) => {
      const identity = blueskyIdentityAccount(stored.profile.did);
      return identity
        ? [
            {
              key: `bluesky:${identity.did}`,
              kind: 'bluesky' as const,
              token: null,
              did: identity.did,
              server: BSKY_PRIMARY_SERVER,
              account: identity.account,
            },
          ]
        : [];
    });
  });

  /** Saved sessions other than the active one (for the "switch to" menu). */
  readonly otherSessions = computed<AccountChoice[]>(() => {
    const choices: AccountChoice[] = this.sessions()
      .filter((s) => this.kind() !== 'mastodon' || s.token !== this.token())
      .map((s) => ({
        key: `mastodon:${s.id}`,
        kind: 'mastodon' as const,
        token: s.token,
        server: s.server ?? '',
        account: s.account,
      }));
    // Every Bluesky-primary identity except the currently active DID.
    const activeDid = this.kind() === 'bluesky' ? this.blueskyDid() : null;
    for (const identity of this.blueskyAccounts()) {
      if (identity.did !== activeDid) choices.push(identity);
    }
    if (this.kind() !== 'anonymous') {
      choices.push({
        key: 'anonymous',
        kind: 'anonymous',
        token: null,
        server: this.anonymous.server(),
        account: this.anonymous.account(),
      });
    }
    return choices;
  });

  get isAuthenticated(): boolean {
    return this.kind() !== null;
  }

  /**
   * The browser-local Anonymous identity is active.
   *
   * ## Read this before using it in new code
   *
   * This predicate is **overloaded**, and the two meanings it carries diverge
   * for a Bluesky-primary account. Across the app it is used to mean both:
   *
   *   A. "there is no Mastodon token, so don't make authenticated calls"
   *      — streaming, `verify_credentials`, the follow nudge;
   *   B. "read and write the browser-local anonymous stores"
   *      — the anonymous home feed, its cache, its merge behaviour.
   *
   * A Bluesky-primary account needs **A true and B false**: it has no Mastodon
   * token, but its timeline comes from Bluesky, not from the local corpus. One
   * boolean cannot answer both, so new code must pick the one it means:
   * {@link lacksMastodonToken} for A, {@link isAnonymousIdentity} for B.
   *
   * This is left returning exactly what it always has — `kind() === 'anonymous'`
   * — so that every existing call site keeps its current behaviour. Migrating
   * them happens per page, alongside the work that teaches each page about
   * Bluesky-primary accounts, so each change is reviewable against a page that
   * actually exercises it.
   */
  get isAnonymous(): boolean {
    return this.kind() === 'anonymous';
  }

  /**
   * Meaning B: the browser-local Anonymous identity, and nothing else.
   *
   * Use this to decide whether to touch the anonymous follows / bookmarks /
   * tags / feed-corpus stores. Currently identical to {@link isAnonymous}; it
   * exists so that a call site's *intent* is recorded, and so the two can be
   * told apart when `isAnonymous` is eventually retired.
   */
  get isAnonymousIdentity(): boolean {
    return this.kind() === 'anonymous';
  }

  /**
   * Meaning A: no Mastodon bearer token is available for API calls.
   *
   * True for Anonymous, for Bluesky-primary, and when signed out. Gate
   * authenticated Mastodon work on this — streaming, `verify_credentials`, the
   * home timeline, anything that would 401 without a token.
   */
  get lacksMastodonToken(): boolean {
    return this.kind() !== 'mastodon';
  }

  /** Bluesky owns this account's identity; Mastodon is a connector, if present. */
  get isBlueskyPrimary(): boolean {
    return this.kind() === 'bluesky';
  }

  /** Whether Anonymous is the only account available in this browser. */
  get shouldOfferLogin(): boolean {
    return this.isAnonymous && this.sessions().length === 0 && blueskyIdentities().length === 0;
  }

  /**
   * Make ``token`` active, adding it to the saved stable if it's new. Captures the
   * currently-selected instance so the session can be restored to the right host later.
   */
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ACCOUNT_MODE_KEY, 'mastodon');
    this.kind.set('mastodon');
    this.token.set(token);
    this.blueskyDid.set(null);
    const server = this.server.baseUrl();
    const existing = this.sessions().find((s) => s.token === token);
    if (!existing) {
      const saved = this.sessions().length;
      const id = newSessionId();
      this.persistSessions([...this.sessions(), { id, token, server, account: null }]);
      this.diagnostics.transition('add-session', saved, this.sessions().length, { id, server });
    } else if (existing.server === undefined) {
      // Backfill the server for a legacy session created before this field existed.
      this.persistSessions(this.sessions().map((s) => (s.token === token ? { ...s, server } : s)));
    }
  }

  /**
   * Attach a Mastodon token **as a connector**, leaving the identity alone.
   *
   * This is the seam that makes "Mastodon under Bluesky" possible, and its whole
   * value is in what it does *not* do. Compare {@link setToken}, which is the
   * mastodon-primary login: that one writes `ACCOUNT_MODE_KEY`, sets `kind` to
   * `'mastodon'`, clears `blueskyDid` and adds a row to the session stable. Run
   * it under a Bluesky-primary account and the account silently changes kind —
   * the user signs in to a Mastodon server and is quietly ejected from their own
   * Bluesky identity.
   *
   * So this path writes exactly one thing: the token, into the signal
   * `auth.interceptor.ts` reads. Every existing Mastodon call site then
   * authenticates with no change at all, because the interceptor was always
   * asking `Auth.token()` and never asking what kind of account was behind it.
   *
   * Specifically **not** written, each for a reason:
   *
   * - `ACCOUNT_MODE_KEY` / `kind` — the identity is Bluesky and stays Bluesky.
   * - `blueskyDid` — clearing it would drop the identity this connector hangs off.
   * - the session stable — a connector is not a login. A row here would put a
   *   phantom account in the switcher, which is precisely the *other* thing the
   *   user might have meant ("keep it separate"), and the two must stay
   *   distinguishable.
   * - `TOKEN_KEY` — see below.
   *
   * ## Why the token is not mirrored to `TOKEN_KEY`
   *
   * `setToken` mirrors there for the interceptor and for back-compat. Doing the
   * same here would create a genuine account-corruption path. `storedKind()`
   * falls back to "a token exists, therefore mastodon-primary" when the mode key
   * is missing, and a `bluesky` mode key is discarded as stale when the identity
   * behind it is gone (a settings import that carried the profile but not the
   * JWTs, a half-finished unlink). Combine the two and a bsky-primary user with a
   * connector reloads as **mastodon-primary, signed in as the connector's
   * account** — a different person, silently. The token lives in the connector's
   * own storage instead, and is restored into this signal on load.
   *
   * The connector's own account snapshot is **not** stored here either — it
   * belongs to `MastodonConnector`, alongside the server it was verified
   * against. Writing it to `mastodonAccount` would leak a Mastodon profile into
   * the signal that renders the *identity* (see {@link setAccount}, which
   * refuses the same write for the same reason).
   */
  connectMastodon(token: string, account: Account | null = null): void {
    this.token.set(token);
    this.diagnostics.info('connect-mastodon-connector', {
      kind: this.kind() ?? 'unauthenticated',
      handle: account?.username ?? null,
      saved: this.sessions().length,
    });
  }

  /**
   * Drop a connector token, leaving the identity untouched.
   *
   * The counterpart to {@link connectMastodon}, and deliberately not
   * {@link logout}: there is no account to forget here, only a credential to
   * stop using.
   */
  disconnectMastodon(): void {
    if (this.kind() === 'mastodon') {
      // Not a connector — this is the identity's own token, and removing it here
      // would sign the user out through a door that promises not to.
      return;
    }
    this.token.set(null);
  }

  /** Record the verified account for the active token (updates the switcher snapshot). */
  setAccount(account: Account | null): void {
    if (this.isAnonymous) {
      if (account) {
        this.anonymous.updateAccount(account);
      }
      return;
    }
    if (this.isBlueskyPrimary) {
      // The Bluesky-primary identity is rendered from its own stored profile,
      // not from a verified Mastodon account. Writing here would put a Mastodon
      // snapshot behind a Bluesky identity and, worse, `persistSessions` below
      // would rewrite the stable using a null token.
      return;
    }
    this.mastodonAccount.set(account);
    this.account.set(account);
    // Mirror the server-side posting default so the composer can open on it
    // without a request. `source` is only populated on verify_credentials, so
    // this quietly no-ops for the account snapshots that lack it.
    this.prefs.setDefaultVisibility(account?.source?.privacy);
    const token = this.token();
    if (account && token) {
      adoptMastodonStorageScope(account.id, this.server.baseUrl(), [token]);
      this.persistSessions(this.sessions().map((s) => (s.token === token ? { ...s, account } : s)));
    }
  }

  /**
   * Replace a saved account's credential after reauthorization.
   *
   * The verified account id is paired with its issuing server; numeric ids from
   * different instances are unrelated. Keeping the existing session id and
   * account snapshot makes this a credential rotation, not a second identity.
   */
  adoptReauthorizedSession(account: Account, newToken: string, server: string): boolean {
    const existing = this.sessions().find(
      (session) =>
        session.token !== newToken &&
        session.account?.id === account.id &&
        (session.server ?? '') === server,
    );
    if (!existing) return false;

    adoptMastodonStorageScope(account.id, server, [existing.token, newToken]);

    const next = this.sessions()
      .filter((session) => session.token !== newToken)
      .map((session) =>
        session.id === existing.id ? { ...session, token: newToken, account, server } : session,
      );
    this.persistSessions(next);
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(ACCOUNT_MODE_KEY, 'mastodon');
    this.kind.set('mastodon');
    this.token.set(newToken);
    this.blueskyDid.set(null);
    this.mastodonAccount.set(account);
    this.account.set(account);
    this.prefs.setDefaultVisibility(account.source?.privacy);
    return true;
  }

  /**
   * Switch to a previously-saved session. Restores that session's instance first so API
   * calls target the host the token is valid for. Returns false if unknown.
   */
  switchTo(token: string): boolean {
    const session = this.sessions().find((s) => s.token === token);
    if (!session) {
      this.diagnostics.warn('switch-to-unknown-session', { saved: this.sessions().length });
      return false;
    }
    this.diagnostics.info('switch-to', {
      session: session.id,
      handle: session.account?.username ?? null,
      server: session.server ?? '',
      saved: this.sessions().length,
    });
    if (session.server !== undefined) {
      this.server.setBaseUrl(session.server);
    }
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ACCOUNT_MODE_KEY, 'mastodon');
    this.kind.set('mastodon');
    this.token.set(token);
    this.blueskyDid.set(null);
    this.mastodonAccount.set(session.account);
    return true;
  }

  /** Enter the permanent local account without deleting any saved logins. */
  enterAnonymous(server?: string): void {
    const saved = this.sessions().length;
    this.anonymous.activate(server);
    this.server.setBaseUrl(this.anonymous.server());
    localStorage.removeItem(TOKEN_KEY);
    localStorage.setItem(ACCOUNT_MODE_KEY, 'anonymous');
    this.token.set(null);
    this.mastodonAccount.set(null);
    this.blueskyDid.set(null);
    this.kind.set('anonymous');
    // Entering Anonymous never touches the stable. Logged with the count anyway:
    // this is the step users reported their accounts disappearing *at*, and the
    // evidence that it did not is worth having in the console.
    this.diagnostics.transition('enter-anonymous', saved, this.sessions().length, {
      server: this.anonymous.server(),
    });
  }

  /**
   * Activate the Bluesky-primary identity already present in storage.
   *
   * Deliberately does **not** create one — signing in with Bluesky is the login
   * page's job (and does not exist yet). This only makes an existing identity
   * the active account, which is what the switcher needs.
   *
   * Leaves the Mastodon stable completely alone, exactly as `enterAnonymous`
   * does. Returns false when there is no usable identity to enter, rather than
   * activating a kind the app cannot serve.
   */
  enterBluesky(did: string | null = blueskyIdentityDid()): boolean {
    const requestedDid = did ?? blueskyIdentities()[0]?.profile.did ?? null;
    const identity = blueskyIdentityAccount(requestedDid);
    if (!identity) {
      this.diagnostics.warn('enter-bluesky-without-identity', {
        saved: this.sessions().length,
      });
      return false;
    }
    if (!setActiveBlueskyIdentity(identity.did)) return false;
    this.blueskyRevision.update((revision) => revision + 1);
    const saved = this.sessions().length;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.setItem(ACCOUNT_MODE_KEY, 'bluesky');
    this.mastodonAccount.set(null);
    this.blueskyDid.set(identity.did);
    this.kind.set('bluesky');
    // Restore this account's Mastodon connector, if it has one. Order matters:
    // the connector is stored under a scope suffix derived from the DID, so the
    // mode key above must already be written or this reads the wrong namespace
    // (or none) and the connector appears to have been forgotten by a switch.
    this.token.set(mastodonConnectorToken());
    // Same reasoning as enter-anonymous: this must never cost a saved account,
    // and the console is the only place that can prove it did not.
    this.diagnostics.transition('enter-bluesky', saved, this.sessions().length, {
      handle: identity.account.username,
    });
    return true;
  }

  /** Re-read an updated Bluesky identity snapshot without switching accounts. */
  refreshBlueskyAccount(): void {
    if (!this.isBlueskyPrimary) return;
    this.blueskyRevision.update((revision) => revision + 1);
    this.blueskyDid.set(blueskyIdentityDid());
  }

  /** Switch to the virtual account, the Bluesky identity, or a saved Mastodon token. */
  switchAccount(choice: AccountChoice): boolean {
    if (choice.kind === 'anonymous') {
      this.enterAnonymous();
      return true;
    }
    if (choice.kind === 'bluesky') {
      return this.enterBluesky(choice.did ?? null);
    }
    return choice.token !== null && this.switchTo(choice.token);
  }

  /**
   * Prepare to sign in again as a saved account whose token was rejected.
   *
   * Points the app at that account's instance and clears the active token,
   * *without* deleting the saved session — if the user abandons the login page
   * the account is still in the switcher. Deliberately does not activate the
   * dead token: leaving a known-bad token active makes every subsequent request
   * 401 and the app look broken.
   */
  prepareReauth(token: string): void {
    const session = this.sessions().find((s) => s.token === token);
    if (session?.server !== undefined) {
      this.server.setBaseUrl(session.server);
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_MODE_KEY);
    this.kind.set(null);
    this.token.set(null);
    this.blueskyDid.set(null);
    this.mastodonAccount.set(null);
  }

  /**
   * Drop the active identity without touching the saved stable. Used when a
   * switch fails and there is nothing to revert to, so the app must not be left
   * holding a token its server rejects.
   */
  exitToLoggedOut(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_MODE_KEY);
    this.kind.set(null);
    this.token.set(null);
    this.blueskyDid.set(null);
    this.mastodonAccount.set(null);
  }

  /** Forget one saved session. If it was active, fall back to another (or sign out). */
  removeSession(token: string): void {
    const saved = this.sessions().length;
    const target = this.sessions().find((s) => s.token === token);
    const remaining = this.sessions().filter((s) => s.token !== token);
    this.persistSessions(remaining);
    this.diagnostics.transition('remove-session', saved, remaining.length, {
      removed: target?.id ?? null,
      wasActive: this.token() === token,
    });
    if (this.token() === token) {
      const next = remaining[0];
      if (next) {
        this.switchTo(next.token);
      } else {
        this.logout();
      }
    }
  }

  /** Forget one saved Bluesky identity without disturbing its alts. */
  removeBlueskyIdentity(did: string): void {
    const wasActive = this.kind() === 'bluesky' && this.blueskyDid() === did;
    this.revokeBlueskyOAuth(did);
    clearMastodonConnectorTokenForDid(did);
    clearBlueskyIdentity(did);
    this.blueskyRevision.update((revision) => revision + 1);
    if (wasActive) {
      this.exitToLoggedOut();
    }
  }

  /**
   * Step out of the active identity, forgetting nothing.
   *
   * This is what "Log out" means on the way to the login screen, and it is
   * deliberately **not** {@link logout}. That method forgets the active account —
   * correct for "remove this account", catastrophic for a user who clicked a
   * dialog promising not to delete their data. Reported from the field: signing
   * out of `@mistersql` deleted it from the stable and silently activated
   * `@vegdevops`, so the app looked like it had switched accounts rather than
   * destroyed one, and a second pass took the other as well.
   *
   * No auto-switch either. Landing in the *other* identity is the surprise that
   * made the loss hard to notice; someone who asked to leave gets the login
   * screen, with every saved account still in the switcher.
   */
  leaveActive(): void {
    const saved = this.sessions().length;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_MODE_KEY);
    this.kind.set(null);
    this.token.set(null);
    this.blueskyDid.set(null);
    this.mastodonAccount.set(null);
    // Note what is *not* here: the Bluesky-primary identity is left in storage,
    // for the same reason the Mastodon stable is. Leaving to the login screen
    // must never cost an account, whichever kind was active.
    this.diagnostics.transition('leave-active', saved, saved, {
      reason: 'user left to the login screen; stable deliberately untouched',
    });
  }

  /**
   * Sign out of the active account **and forget it**, keeping the rest of the stable.
   *
   * Callers that mean "I am done with this browser for now" want
   * {@link leaveActive} instead — this one deletes the saved login, which is only
   * ever right when the user asked to remove the account.
   */
  logout(): void {
    const saved = this.sessions().length;
    if (this.isAnonymous) {
      const next = this.sessions()[0];
      if (next) {
        this.diagnostics.transition('logout-anonymous-fallback', saved, saved, {
          switchedTo: next.id,
        });
        this.switchTo(next.token);
        return;
      }
      localStorage.removeItem(ACCOUNT_MODE_KEY);
      this.kind.set(null);
      this.token.set(null);
      this.mastodonAccount.set(null);
      this.diagnostics.transition('logout-anonymous', saved, saved);
      return;
    }
    if (this.isBlueskyPrimary) {
      // "Remove this account" for a Bluesky-primary identity means forgetting
      // the Bluesky identity — not filtering the Mastodon stable by a token
      // that is null. Without this branch the Mastodon path below removes
      // nothing (no session matches a null token) and then silently activates
      // a saved Mastodon account: the app would look like it had *switched*
      // rather than signed out, which is the exact surprise that made the
      // reported account-loss bug so hard to notice. See leaveActive().
      const did = this.blueskyDid();
      if (did) clearMastodonConnectorTokenForDid(did);
      if (did) this.revokeBlueskyOAuth(did);
      clearBlueskyIdentity(did);
      this.blueskyRevision.update((revision) => revision + 1);
      // The Mastodon connector hung off this identity and must not outlive it.
      // Remove it while the DID is still known so the account-scoped secret
      // cannot become unreachable browser residue.
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ACCOUNT_MODE_KEY);
      this.kind.set(null);
      this.token.set(null);
      this.blueskyDid.set(null);
      this.mastodonAccount.set(null);
      this.diagnostics.transition('logout-bluesky-identity', saved, this.sessions().length, {
        reason: 'forgot the Bluesky-primary identity; Mastodon stable untouched',
      });
      return;
    }
    const remaining = this.sessions().filter((s) => s.token !== this.token());
    this.persistSessions(remaining);
    const next = remaining[0];
    if (next) {
      this.diagnostics.transition('logout-forget-active', saved, remaining.length, {
        switchedTo: next.id,
      });
      this.switchTo(next.token);
      return;
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_MODE_KEY);
    this.kind.set(null);
    this.token.set(null);
    this.mastodonAccount.set(null);
    this.diagnostics.transition('logout-forget-active', saved, remaining.length, {
      switchedTo: null,
    });
  }

  /** Leave Anonymous for the login screen without activating or deleting a saved account. */
  exitAnonymous(): void {
    if (!this.isAnonymous) {
      return;
    }
    this.diagnostics.transition('exit-anonymous', this.sessions().length, this.sessions().length);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_MODE_KEY);
    this.kind.set(null);
    this.token.set(null);
    this.mastodonAccount.set(null);
  }

  /**
   * Forget every saved session and sign out entirely.
   *
   * "Every" now includes the Bluesky-primary identity. Leaving it behind would
   * make this the one exit that promises to take everything and quietly does
   * not — and the account would reappear in the switcher afterwards, which
   * reads as the wipe having failed.
   */
  logoutAll(): void {
    const saved = this.sessions().length;
    this.persistSessions([]);
    for (const identity of blueskyIdentities()) {
      clearMastodonConnectorTokenForDid(identity.profile.did);
      this.revokeBlueskyOAuth(identity.profile.did);
    }
    clearAllBlueskyIdentities();
    this.blueskyRevision.update((revision) => revision + 1);
    this.diagnostics.transition('logout-all', saved, 0);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACCOUNT_MODE_KEY);
    this.kind.set(null);
    this.token.set(null);
    this.blueskyDid.set(null);
    this.mastodonAccount.set(null);
  }

  /**
   * Persist the stable list and the tokens to separate keys, so the list can be
   * exported and the tokens never can.
   */
  private persistSessions(sessions: Session[]): void {
    this.sessions.set(sessions);
    const rows: StoredSession[] = sessions.map(({ token: _token, ...rest }) => rest);
    const tokens = Object.fromEntries(sessions.map((s) => [s.id, s.token]));
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(rows));
    localStorage.setItem(SESSION_TOKENS_KEY, JSON.stringify(tokens));
  }

  /** Revoke only SDK-owned OAuth sessions; legacy app passwords are revoked at bsky.app. */
  private revokeBlueskyOAuth(did: string): void {
    if (blueskyIdentity(did)?.credentials.authMethod === 'oauth') {
      // Forgetting the local account must still complete while offline.
      void this.blueskyOAuth.revoke(did).catch(() => undefined);
    }
  }
}
