import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Which *job* a request is doing, so a failure can be reported against the thing
 * that actually broke rather than against "the server".
 *
 * The app already talks to more than one host — the browsing instance, a separate
 * search server when the home one has no full-text index (`search-server.ts`), tag
 * timelines that some instances refuse anonymously, and every followed account's
 * own instance. Today most of these resolve to the same host, but the *failures*
 * are already independent: "search is unavailable here" and "your server is
 * unreachable" are different sentences and want different UI.
 *
 * Roles are introduced now, ahead of per-role server configuration, because the
 * cost is a context token and the alternative is retrofitting severity into every
 * call site later. See `sprint/anon-office-4-health.md`.
 */
export type ServerRole =
  /**
   * The instance the app is reading through. Its failure is the one that stops
   * everything, and the only one that earns a full-screen fail whale.
   */
  | 'home'
  /**
   * Full-text search, which is frequently a *different* server (see
   * `search-server.ts`). A dead search index leaves every other feature working,
   * so it reports inline on the search page and never whales.
   */
  | 'search'
  /**
   * Hashtag timelines. Plenty of instances serve these anonymously while refusing
   * `timelines/public` (`mastodon-social-anonymous-endpoints`), so this can fail
   * entirely on its own.
   */
  | 'tag'
  /**
   * Another account's instance, read to build the anonymous feed. **Dozens of
   * these per feed refresh, and one being down is normal** — a blocked or dead
   * peer is ordinary weather, not an outage. Never whales; Feed Doctor is where
   * these surface.
   */
  | 'peer'
  /**
   * Decoration: instance metadata, custom emojis, server rules, announcements,
   * trend probes. The app is fully usable when every one of these fails, so they
   * are recorded and otherwise ignored.
   *
   * This is the tier whose absence caused the bug: `/api/v2/instance` failing
   * used to blank the entire app.
   */
  | 'background';

export const SERVER_ROLE = new HttpContextToken<ServerRole>(() => 'home');

/** Convenience: `http.get(url, { context: serverRole('background') })`. */
export function serverRole(role: ServerRole): HttpContext {
  return new HttpContext().set(SERVER_ROLE, role);
}

/**
 * Whether a failure in this role should raise the full-screen fail whale.
 *
 * Only `home`. Everything else degrades a feature the user can route around, and
 * blanking the app for one of them is the defect this exists to fix — the whale
 * claims "can't reach the server", which is simply false when the timeline is
 * fine and only the emoji list failed.
 */
export function whales(role: ServerRole): boolean {
  return role === 'home';
}
