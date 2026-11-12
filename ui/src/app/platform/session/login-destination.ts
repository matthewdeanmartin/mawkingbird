import { FOCUSED_APPS } from '../../shell/mode-nav';

/**
 * The page to open after signing in: a mini-app's root named in `?next=`, else Home.
 *
 * An allowlist, not a same-origin check: `?next=` arrives in a URL anyone can
 * craft, and only pages built to pick up after sign-in belong here.
 */
export function loginDestination(next: string | null | undefined): string {
  if (!next) return '/home';
  // A tool's own query string survives (`/mastodon-analytics?acct=…`), so a
  // visitor who typed something before signing in gets it back. Only the path
  // is checked against the allowlist; a fragment is dropped, and anything that
  // is not a plain path ("//host", "https:…", "\\host") fails the path test.
  const queryAt = next.indexOf('?');
  const path = (queryAt < 0 ? next : next.slice(0, queryAt)).split('#')[0];
  if (!FOCUSED_APPS.some((app) => app.root === path)) return '/home';
  if (queryAt < 0) return path;
  const query = next.slice(queryAt + 1).split('#')[0];
  return query ? `${path}?${new URLSearchParams(query).toString()}` : path;
}

/**
 * Carries `next` across Bluesky's OAuth redirect, whose state the SDK owns.
 * Tab-lived and consumed once by the callback.
 */
const NEXT_KEY = 'mockingbird_login_next';

export function stashLoginNext(next: string): void {
  try {
    if (next === '/home') sessionStorage.removeItem(NEXT_KEY);
    else sessionStorage.setItem(NEXT_KEY, next);
  } catch {
    // Without storage the sign-in still works; it lands on Home.
  }
}

/** Read and clear a stashed destination, re-checked against the allowlist. */
export function takeLoginNext(): string {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    return loginDestination(next);
  } catch {
    return '/home';
  }
}

/** Settings → Connections → Bluesky, where a connector OAuth link returns by default. */
export const BLUESKY_CONNECTION_PAGE = '/settings/connections/bluesky';

/**
 * Carries the page that started a Bluesky *connector* link across the OAuth
 * redirect. Separate from `next`: a connector link returns to where the reader
 * was (the connection page, or a mini-app embedding it), not to a sign-in landing.
 */
const CONNECTOR_RETURN_KEY = 'mockingbird_bsky_connector_return';

function connectorDestination(path: string | null | undefined): string {
  return path && FOCUSED_APPS.some((app) => app.root === path) ? path : BLUESKY_CONNECTION_PAGE;
}

export function stashConnectorReturn(path: string): void {
  try {
    sessionStorage.setItem(CONNECTOR_RETURN_KEY, connectorDestination(path));
  } catch {
    // Storage blocked: the callback falls back to the connection page.
  }
}

/** The stashed connector return, without consuming it, or null for a sign-in. */
export function peekConnectorReturn(): string | null {
  try {
    const path = sessionStorage.getItem(CONNECTOR_RETURN_KEY);
    return path === null ? null : connectorDestination(path);
  } catch {
    return null;
  }
}

/** Read and clear the stashed connector return, re-checked against the allowlist. */
export function takeConnectorReturn(): string {
  const path = peekConnectorReturn();
  try {
    sessionStorage.removeItem(CONNECTOR_RETURN_KEY);
  } catch {
    // Nothing to clear when storage is blocked.
  }
  return path ?? BLUESKY_CONNECTION_PAGE;
}
