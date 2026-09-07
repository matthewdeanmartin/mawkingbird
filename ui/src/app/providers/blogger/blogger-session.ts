import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { scopedKey } from '../../account-scope';
import {
  appCallbackUrl,
  codeChallengeFor,
  createCodeVerifier,
  createOAuthState,
  statesMatch,
} from '../../pkce';

/**
 * Google OAuth client id for the Blogger connector.
 *
 * Public by design — a browser app cannot hold a secret, so Google's "web
 * application" client is used **without** its client secret and PKCE carries
 * the proof instead. Anyone can read this id out of the bundle and that is
 * fine; it authorizes nothing on its own.
 *
 * Empty in a build that has not been given one, which hides the connector
 * entirely rather than offering a button that cannot work — the same contract
 * as `DROPBOX_APP_KEY`.
 */
export const BLOGGER_CLIENT_ID = new InjectionToken<string>('BLOGGER_CLIENT_ID', {
  providedIn: 'root',
  factory: () => environment.bloggerClientId,
});

/**
 * A user's own Google OAuth client id, overriding the one this build ships.
 *
 * Two reasons someone needs this, and neither is exotic:
 *
 *  - **The shared client is capped.** Google's `auth/blogger` scope is
 *    *sensitive*, so until the shipped client passes Google's app verification
 *    it can only serve 100 hand-added test users. Everyone else is stuck.
 *  - **Quota is per-project.** All users of the shipped client share its
 *    Blogger API quota, so one heavy user can rate-limit strangers.
 *
 * Bringing your own project fixes both, and removes the "Google hasn't
 * verified this app" interstitial too — you are the owner of your own project.
 *
 * Stored **unscoped**, like the OpenRouter key and for the same reason: a
 * Google Cloud project belongs to the human, not to whichever Mastodon persona
 * happens to be signed in. Not a secret — a client id is public by design — but
 * it lives in localStorage so it survives the tab.
 */
const CLIENT_ID_OVERRIDE_KEY = 'mockingbird_blogger_client_id';

const TOKEN_KEY_BASE = 'mockingbird_blogger_token';
const VERIFIER_KEY = 'mockingbird_blogger_pkce_verifier';
const STATE_KEY = 'mockingbird_blogger_oauth_state';

/**
 * The chosen blog and the profile-feed opt-in, kept in `localStorage`.
 *
 * Separate from the token on purpose. The *token* is a secret and belongs in
 * `sessionStorage` where it dies with the tab; which blog you write to, and
 * whether its posts appear on your profile, are preferences — losing them every
 * time you close the browser would mean re-choosing forever. Nothing here is
 * a credential, so it is safe to persist.
 *
 * This is also what lets the profile feed work when you are *not* signed in to
 * Google: reading a public RSS feed needs no token, only the address.
 */
const BLOG_CHOICE_KEY_BASE = 'mockingbird_blogger_blog';

interface StoredBlogChoice {
  blogId: string;
  blogName: string;
  blogUrl: string;
  includeInProfile: boolean;
}

/** Where Google sends the browser back. Must match a registered redirect URI. */
export const BLOGGER_CALLBACK_PATH = 'integrations/blogger/callback';

/**
 * The one scope this connector asks for.
 *
 * `auth/blogger` covers reading the user's blogs and publishing to them. Google
 * classifies it as *sensitive*, so an unverified app shows a warning
 * interstitial before the consent screen; that is a property of the registered
 * client, not something the code can or should route around.
 */
export const BLOGGER_SCOPE = 'https://www.googleapis.com/auth/blogger';

interface StoredBloggerToken {
  accessToken: string;
  expiresAt: number;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
}

interface GoogleErrorResponse {
  error?: string | { message?: string };
  error_description?: string;
}

function tokenKey(): string {
  return scopedKey(TOKEN_KEY_BASE);
}

function choiceKey(): string {
  return scopedKey(BLOG_CHOICE_KEY_BASE);
}

function readToken(): StoredBloggerToken | null {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(tokenKey()) ?? 'null',
    ) as Partial<StoredBloggerToken> | null;
    if (!parsed || typeof parsed.accessToken !== 'string' || typeof parsed.expiresAt !== 'number') {
      return null;
    }
    return { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function readChoice(): StoredBlogChoice | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(choiceKey()) ?? 'null',
    ) as Partial<StoredBlogChoice> | null;
    if (!parsed || typeof parsed.blogId !== 'string' || typeof parsed.blogUrl !== 'string') {
      return null;
    }
    return {
      blogId: parsed.blogId,
      blogName: typeof parsed.blogName === 'string' ? parsed.blogName : parsed.blogId,
      blogUrl: parsed.blogUrl,
      includeInProfile: parsed.includeInProfile === true,
    };
  } catch {
    return null;
  }
}

/**
 * A Blogger blog's RSS feed.
 *
 * Blogger serves this at a fixed path under the blog's own address for both
 * `*.blogspot.com` and custom domains. Unlike the Blogger *API*, the feed sends
 * no `Access-Control-Allow-Origin` (and often redirects to FeedBurner), so
 * reading it from the browser goes through the user's configured CORS proxy —
 * the same route the Mataroa profile feed takes.
 */
export function bloggerFeedUrl(blogUrl: string): string | null {
  try {
    return new URL('feeds/posts/default?alt=rss', ensureTrailingSlash(blogUrl)).toString();
  } catch {
    return null;
  }
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * A browser-only Blogger (Google) OAuth/PKCE session.
 *
 * **Access tokens only, deliberately.** Google will issue a refresh token for
 * an installed-app flow, and it is tempting because it means never signing in
 * again. It is also a credential that lives in the browser indefinitely and can
 * mint new access tokens for a year — a much worse thing to leak than an hour-
 * long token. Publishing to a blog is an occasional, deliberate act, so the
 * trade is not worth it: the token sits in `sessionStorage`, dies with the tab,
 * and reconnecting is two clicks.
 *
 * The token is account-scoped (`scopedKey`) like every other per-persona
 * credential: a blog linked while signed in as one account is not silently
 * available to another.
 */
@Injectable({ providedIn: 'root' })
export class BloggerSession {
  private shippedClientId = inject(BLOGGER_CLIENT_ID);
  private token = signal<StoredBloggerToken | null>(readToken());
  private choice = signal<StoredBlogChoice | null>(readChoice());
  private overrideClientId = signal<string>(localStorage.getItem(CLIENT_ID_OVERRIDE_KEY) ?? '');

  /** The user's own client id, when they have supplied one. */
  readonly ownClientId = computed(() => this.overrideClientId());
  /** True when this build ships a client id, so "use my own" is genuinely optional. */
  readonly hasShippedClientId = this.shippedClientId.trim().length > 0;

  /** The client id actually used: the user's own if set, else the build's. */
  private get clientId(): string {
    return this.overrideClientId().trim() || this.shippedClientId.trim();
  }

  /** Signed in to Google. Says nothing about whether a blog has been chosen. */
  readonly connected = computed(() => this.token() !== null);
  /** The blog posts will go to, if one has been chosen. */
  readonly blogId = computed(() => this.choice()?.blogId ?? null);
  readonly blogName = computed(() => this.choice()?.blogName ?? null);
  readonly blogUrl = computed(() => this.choice()?.blogUrl ?? null);

  /**
   * Publishing needs *both* a token and a chosen blog — the composer keys off
   * this so it never offers a target that would fail on send.
   */
  readonly ready = computed(() => this.connected() && this.choice() !== null);

  /** Show this blog's posts on the user's own profile. */
  readonly includeInProfile = computed(() => this.choice()?.includeInProfile === true);

  /**
   * The blog's RSS feed, when one is chosen. Deliberately independent of the
   * token: a public feed needs no credential, so the profile keeps showing the
   * blog after the Google session expires, and for an anonymous browser that
   * never signed in at all.
   */
  readonly feedUrl = computed(() => {
    const url = this.choice()?.blogUrl;
    return url ? bloggerFeedUrl(url) : null;
  });

  /**
   * False when there is no client id at all — neither shipped nor supplied.
   * The connector explains itself rather than offering a button that cannot work.
   */
  get configured(): boolean {
    return this.clientId.length > 0;
  }

  /**
   * Use a different Google OAuth client from now on.
   *
   * Any existing token was minted by the *previous* client, so it is dropped:
   * keeping it would leave a session that the new client did not authorize and
   * cannot refresh. The chosen blog survives — it is the same blog either way.
   */
  setOwnClientId(clientId: string): void {
    const next = clientId.trim();
    if (next === this.overrideClientId()) {
      return;
    }
    if (next) {
      localStorage.setItem(CLIENT_ID_OVERRIDE_KEY, next);
    } else {
      localStorage.removeItem(CLIENT_ID_OVERRIDE_KEY);
    }
    this.overrideClientId.set(next);
    this.disconnect();
  }

  async connect(): Promise<void> {
    if (!this.configured) {
      throw new Error('Blogger has not been configured for this build yet.');
    }
    const verifier = createCodeVerifier();
    const state = createOAuthState();
    const challenge = await codeChallengeFor(verifier);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);

    const authorizeUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorizeUrl.search = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: appCallbackUrl(BLOGGER_CALLBACK_PATH),
      scope: BLOGGER_SCOPE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      // Without this Google silently reuses a prior grant and can return a
      // token for an account the user did not mean to use — the picker makes
      // "which Google account?" an explicit answer every time.
      prompt: 'select_account',
    }).toString();
    location.assign(authorizeUrl.toString());
  }

  async finishAuthorization(params: URLSearchParams): Promise<void> {
    const oauthError = params.get('error_description') ?? params.get('error');
    if (oauthError) {
      this.clearPendingAuthorization();
      throw new Error(describeGoogleOAuthError(oauthError));
    }

    const code = params.get('code');
    const state = params.get('state');
    const expectedState = sessionStorage.getItem(STATE_KEY);
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    if (!code || !statesMatch(expectedState, state) || !verifier) {
      this.clearPendingAuthorization();
      throw new Error(
        'Google returned an invalid or expired authorization response. Please try again.',
      );
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        // No client_secret: PKCE's code_verifier is the proof. Google accepts
        // this for a web client as long as the redirect_uri is registered.
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          client_id: this.clientId,
          redirect_uri: appCallbackUrl(BLOGGER_CALLBACK_PATH),
          code_verifier: verifier,
        }),
      });
      if (!response.ok) {
        throw new Error(await googleError(response, 'Google rejected the authorization code.'));
      }
      const result = (await response.json()) as GoogleTokenResponse;
      this.adoptToken(result.access_token, result.expires_in);
    } finally {
      this.clearPendingAuthorization();
    }
  }

  /**
   * A usable access token, or null when there is none or it is about to expire.
   *
   * The 30-second margin means a request started now does not die in flight on
   * a token that expires mid-call.
   */
  accessToken(): string | null {
    const token = this.token();
    if (!token) {
      return null;
    }
    if (token.expiresAt <= Date.now() + 30_000) {
      this.disconnect();
      return null;
    }
    return token.accessToken;
  }

  /**
   * Adopt an already-obtained token. The OAuth callback is the only production
   * caller; tests use it to reach a connected state without a browser redirect.
   */
  adoptToken(accessToken: string, expiresInSeconds: number): void {
    this.store({ accessToken, expiresAt: Date.now() + expiresInSeconds * 1000 });
  }

  /** Remember which blog to publish to, and where to read its feed. */
  chooseBlog(blogId: string, blogName: string, blogUrl: string): void {
    this.storeChoice({
      blogId,
      blogName,
      blogUrl,
      // Preserve the opt-in across a blog switch only if it was already on;
      // turning it on for a blog the user never opted into would be a surprise.
      includeInProfile: this.choice()?.includeInProfile === true,
    });
  }

  setIncludeInProfile(include: boolean): void {
    const current = this.choice();
    if (!current) {
      return;
    }
    this.storeChoice({ ...current, includeInProfile: include });
  }

  /**
   * Sign out of Google.
   *
   * Drops the token only. The chosen blog and the profile-feed opt-in survive,
   * because they are not secrets and the profile feed does not need a session —
   * signing out should stop you *publishing*, not silently empty your profile.
   * {@link forget} is the one that clears everything.
   */
  disconnect(): void {
    sessionStorage.removeItem(tokenKey());
    this.token.set(null);
  }

  /** Disconnect and forget the blog entirely, including the profile feed. */
  forget(): void {
    this.disconnect();
    localStorage.removeItem(choiceKey());
    this.choice.set(null);
  }

  private store(token: StoredBloggerToken): void {
    sessionStorage.setItem(tokenKey(), JSON.stringify(token));
    this.token.set(token);
  }

  private storeChoice(choice: StoredBlogChoice): void {
    localStorage.setItem(choiceKey(), JSON.stringify(choice));
    this.choice.set(choice);
  }

  private clearPendingAuthorization(): void {
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
  }
}

/**
 * Google's OAuth error codes are terse and two of them are routinely hit during
 * setup, so they get a sentence that says what to actually do.
 */
function describeGoogleOAuthError(raw: string): string {
  if (raw.includes('redirect_uri_mismatch')) {
    return `Google rejected the redirect address. Add ${appCallbackUrl(
      BLOGGER_CALLBACK_PATH,
    )} to the OAuth client's authorized redirect URIs.`;
  }
  if (raw.includes('access_denied')) {
    return 'You declined access, so nothing was connected.';
  }
  return raw;
}

/** The most specific message Google offers for a failed request. */
export async function googleError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as GoogleErrorResponse;
    const detail =
      body.error_description ?? (typeof body.error === 'string' ? body.error : body.error?.message);
    return detail ? `${fallback} ${detail}` : fallback;
  } catch {
    return fallback;
  }
}
