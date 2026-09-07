import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { corsProxyOrigin, isTestBuild } from '../../build-flavor';
import { authDebug, registerAuthOrigins } from './auth-debug';
import { MawkingbirdMetrics, billingTier } from '../../observability/mawkingbird-metrics';
import { forgetAccountLocalState } from './account-local-state';

/**
 * The Mawkingbird account session.
 *
 * ## What replaced what
 *
 * This supersedes `workos-session.ts` and the `@workos-inc/authkit-js` SDK.
 * Identity now comes from Mawkingbird's own services: a magic link sent by the
 * account service, exchanged for a short-lived RS256 token by the token
 * service.
 *
 * The change removed a real bug and a real bill at once.
 *
 * **The bug.** AuthKit keeps its refresh token in memory when `devMode` is
 * false, so a page reload had nothing to restore from and fell back to a
 * cookie belonging to `api.workos.com` — a third-party cookie for this origin,
 * which Safari and Firefox drop outright. Pressing F5 signed people out. The
 * interim fix was `devMode: true`, which moved a multi-day refresh token into
 * `localStorage`; that is now gone, because the long-lived credential is an
 * HttpOnly cookie on the account service that no script here can read.
 *
 * **The bill.** Every free user, and every anonymous textboard visitor, would
 * have counted toward an identity vendor's user total. They now never touch
 * one: an anonymous token is minted locally by the token service with no
 * storage and no account, and email sign-in involves no vendor at all.
 *
 * ## Two kinds of token, one shape
 *
 * `anon` for a visitor who has not signed in, `email` once they have. Both are
 * the same signed format and both go in the same header, so nothing downstream
 * branches on which kind it holds — it reads the `auth` claim if it cares.
 *
 * ## Where the token lives
 *
 * In memory, deliberately. It is short-lived (24h free, 1h paid) and cheap to
 * re-mint, and the thing that actually survives a reload is the HttpOnly
 * session cookie — which is exactly where a long-lived credential belongs and
 * exactly where `localStorage` is not. This service therefore registers no
 * storage key, so the export classification in `portable-config.ts` is
 * untouched.
 *
 * ## Failure posture
 *
 * Signed out is a normal state, not an error. A failed mint leaves {@link user}
 * null and the app anonymous; the proxy reads an absent token as the free tier,
 * so the worst outcome of anything here going wrong is free-tier rate limits.
 */

/** Where the token service lives. Overridable so specs need no network. */
export const AUTH_ORIGIN = new InjectionToken<string>('AUTH_ORIGIN', {
  providedIn: 'root',
  factory: () => authOrigin(),
});

/** Where the account service lives. */
export const ACCOUNT_ORIGIN = new InjectionToken<string>('ACCOUNT_ORIGIN', {
  providedIn: 'root',
  factory: () => accountOrigin(),
});

/**
 * The token and account service origins for this deployment.
 *
 * Derived from the same test/production split as the CORS proxy, so a `/test/`
 * build talks to the sandbox services and cannot mint a token production would
 * accept — the issuer differs, and the proxy pins it.
 *
 * Both environments are on mawkingbird.com subdomains, and that is required
 * rather than cosmetic: these are called with `credentials: 'include'`, and a
 * session cookie from a `workers.dev` host is third-party to this app, which
 * Chrome drops by default. Must agree with `hostsFor()`
 * in `mawkingbird_auth/src/shared/hosts.ts` — a disagreement means the app
 * talks to a service that will not accept its origin.
 *
 * Production being same-site with the app is what lets the session cookie use
 * `SameSite=Lax`, which restores the browser's own CSRF protection. On
 * `workers.dev` it had to be `SameSite=None`, leaving the origin allowlist to
 * do that job alone.
 */
export function authOrigin(): string {
  return isTestBuild() ? 'https://auth-test.mawkingbird.com' : 'https://auth.mawkingbird.com';
}

export function accountOrigin(): string {
  return isTestBuild() ? 'https://account-test.mawkingbird.com' : 'https://account.mawkingbird.com';
}

// Registered at module load so the diagnostic banner can print the hostnames
// this bundle was actually built with — the fastest way to spot a stale deploy.
registerAuthOrigins(authOrigin, accountOrigin);

/** How strongly the caller proved who they are. */
export type AuthStrength = 'anon' | 'email' | 'idp';

/** What the caller pays for. */
export type Tier = 'free' | 'plus' | 'business';

/** A minted token and what it says. */
interface MintedToken {
  token: string;
  /** Unix **seconds**, as the service mints it. */
  expiresAt: number;
  auth: AuthStrength;
  tier: Tier;
}

/** The signed-in account, as the UI needs to describe it. */
export interface AccountUser {
  auth: AuthStrength;
  tier: Tier;
}

/** Re-mint this long before expiry, so a request never carries a stale token. */
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class MawkingbirdSession {
  private authBase = inject(AUTH_ORIGIN);
  private accountBase = inject(ACCOUNT_ORIGIN);
  private metrics = inject(MawkingbirdMetrics);

  /** The signed-in account, or null when anonymous. */
  readonly user = signal<AccountUser | null>(null);

  /** True once the first mint has settled, whether or not anyone signed in. */
  readonly ready = signal(false);

  /** The last failure worth showing, or null. */
  readonly error = signal<string | null>(null);

  /** True while a sign-in email is being requested. */
  readonly sendingLink = signal(false);

  private held: MintedToken | null = null;

  /** An in-flight mint, shared so concurrent callers make one request. */
  private minting: Promise<MintedToken | null> | null = null;

  /**
   * Settle the session on startup.
   *
   * Attempts a signed-in mint first; falls back to anonymous. Both are normal
   * outcomes, and neither is an error.
   */
  async ensureReady(): Promise<void> {
    try {
      await this.token();
    } finally {
      this.ready.set(true);
    }
  }

  /**
   * A usable token, minting or re-minting as needed.
   *
   * Returns null only when even an anonymous mint fails, which means the token
   * service is unreachable. The app keeps working; it is just rate-limited as
   * an unidentified caller.
   */
  async token(): Promise<string | null> {
    if (this.held && this.held.expiresAt * 1000 - REFRESH_MARGIN_MS > Date.now()) {
      return this.held.token;
    }
    // Deduplicated: several proxied requests can start at once, and each
    // minting its own token would spend the endpoint's rate limit on itself.
    this.minting ??= this.mint().finally(() => {
      this.minting = null;
    });
    const minted = await this.minting;
    return minted?.token ?? null;
  }

  /**
   * Request a sign-in link.
   *
   * Resolves true whenever the request was accepted — which is **always**, for
   * any well-formed address, whether or not it has an account. The service
   * answers identically either way on purpose: "does this person use
   * Mawkingbird?" is not a question a stranger gets to ask. The UI must
   * therefore say "check your inbox" rather than anything implying the address
   * was recognised.
   */
  async requestSignInLink(
    email: string,
    returnTo = '/settings/mawkingbird-plus',
  ): Promise<boolean> {
    this.error.set(null);
    this.sendingLink.set(true);
    // Logged with the full URL: the request's *destination* is the thing most
    // likely to be wrong after a hostname change, and a stale bundle calling an
    // old host is invisible from the app's own logs otherwise.
    authDebug('signin:requesting-link', { url: `${this.accountBase}/auth/email/start` });
    // Declared outside the try so the catch below can time a failure too.
    const emailStart = performance.now();
    try {
      const response = await fetch(`${this.accountBase}/auth/email/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The session cookie is set by this service on a different origin, so
        // it only travels on credentialed requests.
        credentials: 'include',
        body: JSON.stringify({ email, returnTo }),
      });
      // Sign-in happens before any subscription is known to this browser, so
      // it is free traffic by construction.
      this.metrics.record('account', 'free', performance.now() - emailStart, response.ok);
      authDebug('signin:link-response', { status: response.status });
      if (response.status === 429) {
        this.error.set('Too many sign-in emails. Please wait a minute and try again.');
        return false;
      }
      if (!response.ok) {
        // Relay the service's own sentence when it sent one. Those messages are
        // written for a person to read, and the alternative — one generic
        // "please try again" for a malformed address, an unconfigured
        // deployment, and a mail outage alike — sends people to the console.
        const relayed = await this.errorMessageFrom(response);
        this.error.set(relayed ?? `Could not send the sign-in email. (HTTP ${response.status})`);
        return false;
      }
      return true;
    } catch (error: unknown) {
      // A CORS refusal lands here and is indistinguishable from being offline
      // without the message — and CORS is the likeliest cause right after a
      // hostname change, because the origin allowlist has to agree.
      this.metrics.record('account', 'free', performance.now() - emailStart, false);
      authDebug('signin:link-failed', {
        message: error instanceof Error ? error.message : 'unknown',
      });
      this.error.set('Could not reach the sign-in service. Check your connection.');
      return false;
    } finally {
      this.sendingLink.set(false);
    }
  }

  /**
   * Sign out.
   *
   * Revokes the session so no further tokens can be minted. Any token already
   * held remains valid until it expires — which is why the UI should say so
   * rather than implying an instant global sign-out.
   */
  async signOut(): Promise<void> {
    const signOutStart = performance.now();
    try {
      const response = await fetch(`${this.accountBase}/auth/signout`, {
        method: 'POST',
        credentials: 'include',
      });
      this.metrics.record(
        'account',
        billingTier(this.held?.tier ?? null),
        performance.now() - signOutStart,
        response.ok,
      );
    } catch {
      this.metrics.record(
        'account',
        billingTier(this.held?.tier ?? null),
        performance.now() - signOutStart,
        false,
      );
      // Revoking failed, but forgetting the local token is still correct: the
      // user asked to be signed out here.
    }
    this.held = null;
    this.user.set(null);
    // Forget what belonged to that account, and only that. Signing out left
    // this behind, so the next account inherited the previous one's sync
    // decision — including a stopped-syncing state it never chose.
    forgetAccountLocalState();
    // Re-mint anonymously so the app keeps a working token.
    await this.token();
  }

  /** Discard the held token and mint a fresh one. Called after checkout. */
  async refresh(): Promise<void> {
    this.held = null;
    await this.token();
  }

  /** The tier of the token currently held, or null when nothing is held. */
  heldTier(): Tier | null {
    return this.held?.tier ?? null;
  }

  /**
   * Whether this session is strong enough to own stored data.
   *
   * Mirrors `canOwnStorage()` in the profile service's `authorize.ts`, and is
   * an exclusion of `anon` for the same reason: an anonymous identity is
   * *designed* to be forgotten when its token expires, so anything stored under
   * it is garbage the day after it is written. That is a property of the
   * identity, not an entitlement — which is why this is not a tier check. A
   * free-but-signed-in account can own storage; an anonymous one never can, at
   * any tier.
   *
   * Duplicating the rule on the client is deliberate. The service stays the
   * authority and still refuses (`403 code: anonymous`); this only spares the
   * app a request whose answer is knowable locally and cannot change without a
   * sign-in — which is itself a re-mint, so the answer is never stale.
   *
   * Null when no token is held yet: unknown is not the same as anonymous, and
   * callers should wait rather than assume.
   */
  canOwnStorage(): boolean | null {
    return this.held ? this.held.auth !== 'anon' : null;
  }

  /**
   * Re-mint if the held token's tier is behind what the account is entitled to.
   *
   * ## Why this is needed
   *
   * Checkout can finish just after a `cookie` grant minted `tier: 'free'`.
   * The Account webhook then updates the authoritative billing row, but the
   * held token is cached until it expires. Anything that asked in between keeps
   * receiving its old free-tier claim, and the profile service correctly
   * answers 402 until the client deliberately re-mints.
   *
   * Re-reading the manifest does not help while the token itself is stale,
   * which is what made the earlier fix look racy: the retry was real, it was
   * just re-asking with the same wrong credential.
   *
   * Returns true when a fresh token was minted, so a caller can retry the
   * request that provoked this.
   */
  async upgradeIfStale(entitled: boolean): Promise<boolean> {
    if (!entitled || this.held === null || this.held.tier !== 'free') {
      return false;
    }
    authDebug('mint:upgrading-stale-tier', { heldTier: this.held.tier });
    await this.refresh();
    return this.held !== null && (this.held as MintedToken).tier !== 'free';
  }

  private async mint(): Promise<MintedToken | null> {
    authDebug('mint:start', { authBase: this.authBase });

    const signedIn = await this.post({ grant: 'cookie' });
    if (signedIn) {
      authDebug('mint:signed-in', { auth: signedIn.auth, tier: signedIn.tier });
      this.held = signedIn;
      this.user.set({ auth: signedIn.auth, tier: signedIn.tier });
      return signedIn;
    }

    // A 401 from the cookie grant is what an expired 90-day session looks like.
    // Not an error — fall back to anonymous and show signed-out UI.
    //
    // But it is ALSO what a dropped session cookie looks like, and those need
    // telling apart. The cookie is HttpOnly and on another origin, so script
    // here cannot inspect it; `mint:cookie-refused` immediately after a
    // redemption means the browser did not send it, which is a SameSite or
    // third-party-cookie problem rather than an expiry.
    authDebug('mint:cookie-refused', {
      hint: 'expired session, or the browser did not send the session cookie',
    });
    const anonymous = await this.post({ grant: 'anon' });
    authDebug('mint:anonymous', { ok: anonymous !== null });
    this.held = anonymous;
    this.user.set(null);

    // Being signed out is normal and must not shout. But if even the anonymous
    // mint failed, the service is unreachable and the page would otherwise show
    // a bare "Not signed in" for what is actually an outage — which is exactly
    // the confusion this whole debugging session was made of.
    if (!anonymous) {
      this.error.set(
        'Could not reach the Mawkingbird account service. Signing in will not work until it is back.',
      );
    }
    return anonymous;
  }

  /**
   * The service's own error sentence, when it sent one.
   *
   * Safe to show verbatim: every error string these Workers emit is written for
   * a person, and they deliberately never relay an upstream provider's message
   * (which could name an account or a key).
   */
  private async errorMessageFrom(response: Response): Promise<string | null> {
    try {
      const body = (await response.json()) as { error?: unknown };
      return typeof body.error === 'string' && body.error ? body.error : null;
    } catch {
      return null;
    }
  }

  private async post(body: { grant: 'anon' | 'cookie' }): Promise<MintedToken | null> {
    // A mint is always attributed to the free tier. It is the call that
    // *obtains* the credential, so there is nothing paid to attribute it to
    // yet — and reading the previously held token's tier would credit the new
    // subscription for the request that established it.
    const mintStart = performance.now();
    try {
      const response = await fetch(`${this.authBase}/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      this.metrics.record('auth', 'free', performance.now() - mintStart, response.ok);
      if (!response.ok) {
        // Logged with the status, because 401 and 503 mean very different
        // things here: the first is "no usable session", the second is "this
        // deployment is misconfigured", and they are indistinguishable in the
        // UI without this line.
        authDebug('mint:rejected', { grant: body.grant, status: response.status });
        return null;
      }
      const minted = (await response.json()) as Partial<MintedToken>;
      if (typeof minted.token !== 'string' || typeof minted.expiresAt !== 'number') {
        return null;
      }
      return {
        token: minted.token,
        expiresAt: minted.expiresAt,
        auth: minted.auth ?? 'anon',
        tier: minted.tier ?? 'free',
      };
    } catch (error: unknown) {
      // A network-level failure, not an HTTP error: CORS refusal, DNS, offline.
      // A CORS refusal is the likeliest cause on a fresh deployment and looks
      // identical to being offline from here, so the origin is logged too.
      this.metrics.record('auth', 'free', performance.now() - mintStart, false);
      authDebug('mint:unreachable', {
        grant: body.grant,
        message: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    }
  }
}

/** The proxy this deployment talks to. Re-exported so callers need one import. */
export { corsProxyOrigin };
