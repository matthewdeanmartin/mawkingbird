import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Marks a request that is part of signing in to a Mastodon server.
 *
 * It goes to the server the visitor just picked, so the question "does the
 * active identity have a Mastodon server?" does not apply: a Bluesky or Misskey
 * account has none until this has happened.
 */
export const SIGN_IN_REQUEST = new HttpContextToken<boolean>(() => false);

/** Convenience: `http.post(url, body, { context: signInRequest() })`. */
export function signInRequest(): HttpContext {
  return new HttpContext().set(SIGN_IN_REQUEST, true);
}
