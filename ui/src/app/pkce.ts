/**
 * PKCE (RFC 7636) and CSRF-state primitives shared by every OAuth flow in the
 * app — the Mastodon sign-in and the Dropbox connector.
 *
 * A browser-only client cannot keep a client secret, so an authorization code
 * on its own is not enough: anyone who observes or injects a code could redeem
 * it. PKCE binds the code to a one-time secret (the *verifier*) that never
 * leaves this browser — only its SHA-256 hash (the *challenge*) travels to the
 * authorization server. `state` is the separate, equally necessary half: it
 * binds the callback to the flow *this* browser started, so an attacker cannot
 * feed us a code minted for their own account (login CSRF).
 *
 * Both values are generated with `crypto.getRandomValues`; nothing here should
 * ever fall back to `Math.random`.
 */

/** Bytes of entropy for a verifier. RFC 7636 allows 43–128 chars; 64 bytes → 86. */
const VERIFIER_BYTES = 64;

/** Bytes of entropy for a `state` value. 32 bytes is far beyond guessable. */
const STATE_BYTES = 32;

/** URL-safe base64 (RFC 4648 §5) with padding stripped, as OAuth expects. */
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** `byteLength` cryptographically random bytes, base64url-encoded. */
export function randomBase64Url(byteLength: number): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** Base64url of the SHA-256 digest of `value` — the S256 code challenge. */
export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

/** A fresh PKCE verifier. Keep it in this browser; send only the challenge. */
export function createCodeVerifier(): string {
  return randomBase64Url(VERIFIER_BYTES);
}

/** A fresh anti-CSRF `state` value for an authorization request. */
export function createOAuthState(): string {
  return randomBase64Url(STATE_BYTES);
}

/** The S256 challenge for a verifier. */
export function codeChallengeFor(verifier: string): Promise<string> {
  return sha256Base64Url(verifier);
}

/**
 * Constant-time-ish comparison for the returned `state`.
 *
 * The timing properties barely matter for a value the attacker cannot query
 * repeatedly, but comparing lengths first and never short-circuiting keeps the
 * check honest and costs nothing. Empty/missing values always fail.
 */
export function statesMatch(expected: string | null, received: string | null): boolean {
  if (!expected || !received || expected.length !== received.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * An absolute URL for an in-app OAuth callback route, honouring the base href.
 *
 * **Do not build these from `location.origin`.** Mawkingbird is deployed more
 * than once per origin: production is `https://mawkingbird.com/` and canary is
 * `https://mawkingbird.com/canary/` on the *same* origin (see
 * `.github/workflows/mockingbird-canary.yml`), and the embedded mock build is
 * served from `/_ui/`. `location.origin` discards that path entirely, so a
 * callback built from it sends the user to whichever deployment happens to own
 * the site root — from canary, that is production, which then has no pending
 * PKCE verifier and fails the flow.
 *
 * `document.baseURI` resolves the `<base href>` Angular was built with, so this
 * returns the callback belonging to *this* copy of the app.
 *
 * @param path Route path without a leading slash, e.g.
 *   `integrations/openrouter/callback`.
 */
export function appCallbackUrl(path: string): string {
  return new URL(path.replace(/^\//, ''), document.baseURI).toString();
}
