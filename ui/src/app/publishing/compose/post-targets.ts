import { PostTarget } from './compose';

/**
 * What is linked, flagged on, and signed in *right now*.
 *
 * A plain data snapshot rather than the services themselves, so the rules below
 * stay pure and testable — and so a second caller (the publish wizard) can ask
 * the same question without acquiring the composer's eight injected providers.
 */
export interface TargetAvailability {
  anonymous: boolean;
  bskyLinked: boolean;
  /** Mataroa: credentials stored. */
  mataroaConnected: boolean;
  /**
   * Blogger: session usable *and a blog chosen*.
   *
   * `ready`, not merely connected: the session survives without a chosen blog,
   * but a post aimed at that state has nowhere to go.
   */
  bloggerReady: boolean;
  /** Hugo: repo and token both stored. */
  hugoConnected: boolean;
  pastebinEnabled: boolean;
  mataroaEnabled: boolean;
  bloggerEnabled: boolean;
  hugoEnabled: boolean;
}

/**
 * Where this session can post when it has no other opinion.
 *
 * Anonymous visitors have no Mastodon token, so their default is a paste when
 * pastebin is available — and `fedi` only as a last resort, where the composer
 * will show its own signed-out state.
 */
export function fallbackTarget(state: TargetAvailability): PostTarget {
  return state.anonymous && state.pastebinEnabled ? 'paste' : 'fedi';
}

/**
 * Whether a target can actually be posted to right now.
 *
 * The single source of truth for that question. It was the composer's private
 * `restorableTarget` until the publish wizard needed the same answer, and
 * forking it would have meant a wizard that offers a destination the composer
 * then refuses — the user picking somewhere their post cannot go, and finding
 * out one step later.
 *
 * The rules mirror the composer's picker exactly: Fedi and "both" need a
 * Mastodon token; Bluesky, the blogs and pastes need only their own link, and
 * work for anonymous visitors too.
 */
export function isTargetUsable(target: PostTarget, state: TargetAvailability): boolean {
  switch (target) {
    case 'fedi':
      return !state.anonymous;
    case 'bsky':
      return state.bskyLinked;
    case 'both':
      // Includes a Fedi post, so it needs the token as well as the link.
      return !state.anonymous && state.bskyLinked;
    case 'blog':
      return state.mataroaConnected && state.mataroaEnabled;
    case 'blogger':
      return state.bloggerReady && state.bloggerEnabled;
    case 'hugo':
      return state.hugoConnected && state.hugoEnabled;
    case 'paste':
      return state.pastebinEnabled;
  }
}

/**
 * The target a restored draft may actually use.
 *
 * A draft can outlive the connection it was written for — the Bluesky link gets
 * revoked, the blog connector is flagged off, the session drops to anonymous.
 * Rather than restoring a target whose option no longer exists in the picker
 * (which shows a blank select and posts somewhere surprising), anything
 * unusable falls back to the default for this session.
 */
export function restorableTarget(target: PostTarget, state: TargetAvailability): PostTarget {
  return isTargetUsable(target, state) ? target : fallbackTarget(state);
}

/** Every target this session could post to, in picker order. */
export const ALL_TARGETS: readonly PostTarget[] = [
  'fedi',
  'bsky',
  'both',
  'paste',
  'blog',
  'blogger',
  'hugo',
];

export function usableTargets(state: TargetAvailability): PostTarget[] {
  return ALL_TARGETS.filter((target) => isTargetUsable(target, state));
}

/** How to name a target in the wizard's list. */
export function targetLabel(target: PostTarget): string {
  switch (target) {
    case 'fedi':
      return 'Mastodon';
    case 'bsky':
      return 'Bluesky';
    case 'both':
      return 'Mastodon and Bluesky';
    case 'paste':
      return 'Paste service';
    case 'blog':
      return 'Mataroa blog';
    case 'blogger':
      return 'Blogger';
    case 'hugo':
      return 'Hugo site';
  }
}
