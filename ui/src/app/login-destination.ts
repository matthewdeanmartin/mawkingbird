import { FOCUSED_APPS } from './shell/mode-nav';

/**
 * The page to open after signing in: a mini-app's root named in `?next=`, else Home.
 *
 * An allowlist, not a same-origin check: `?next=` arrives in a URL anyone can
 * craft, and only pages built to pick up after sign-in belong here.
 */
export function loginDestination(next: string | null | undefined): string {
  return next && FOCUSED_APPS.some((app) => app.root === next) ? next : '/home';
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
