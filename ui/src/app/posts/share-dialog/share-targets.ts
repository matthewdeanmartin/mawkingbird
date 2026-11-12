import { PostTarget } from '../../publishing/compose/compose';
import { ProviderId } from '../../platform/api/models';
import { isTargetUsable, TargetAvailability } from '../../publishing/compose/post-targets';

/**
 * Splitting share destinations into "post it" and "send it to".
 *
 * ## The rule
 *
 * A destination appears in exactly one section, chosen per destination and per
 * session: posting through a configured connector when there is one, handing off
 * to the destination's own composer in a new tab when there is not. Showing both
 * for the same service would ask the user to understand the difference between
 * "post to Bluesky" and "post to Bluesky", which is our plumbing leaking into
 * their decision.
 *
 * ## Why it is not a preference
 *
 * There is no setting for this and should not be. When the connector exists,
 * posting through it is better in every respect the user cares about — it stays
 * in the app, it keeps the draft, it can reach several places at once. When it
 * does not, the intent is the only thing that works at all.
 */

/**
 * Intent destinations that duplicate a composer target.
 *
 * Bluesky is reachable both ways: through the app when the account is linked,
 * and through `bsky.app` when it is not. Everything else in the intent list —
 * Reddit, Hacker News, LinkedIn, Tumblr — has no connector at all, so it is
 * always an intent and never appears here.
 *
 * Mastodon has no entry because there is no Mastodon *intent*: a fediverse share
 * URL needs the reader's own instance host, which we do not know for someone not
 * signed in. A signed-in user reaches Mastodon through the composer instead.
 */
const INTENT_EQUIVALENT: Partial<Record<string, PostTarget>> = {
  bluesky: 'bsky',
};

/**
 * Composer targets to offer, in section order.
 *
 * `both` is deliberately absent: it posts to two places, and one press reaching
 * two destinations is exactly what the boss ruled out ("2 intents can't be done
 * with single click"). The composer still offers it once open — choosing it there
 * is a decision the user makes with the post in front of them.
 */
const SHAREABLE_TARGETS: readonly PostTarget[] = [
  'fedi',
  'bsky',
  'blog',
  'blogger',
  'hugo',
  'paste',
];

/** Everywhere a real post can be made right now. */
export function postTargetsFor(state: TargetAvailability): PostTarget[] {
  return SHAREABLE_TARGETS.filter((target) => isTargetUsable(target, state));
}

/**
 * The intent destinations still worth showing.
 *
 * Filters out any whose connector qualified for the "post it" section, so a
 * destination never appears twice.
 */
export function intentIdsFor(intentIds: readonly string[], state: TargetAvailability): string[] {
  return intentIds.filter((id) => {
    const equivalent = INTENT_EQUIVALENT[id];
    return !(equivalent && isTargetUsable(equivalent, state));
  });
}

/**
 * Where a post already lives, as a destination to leave out.
 *
 * Sharing a Mastodon post to Mastodon, or a Bluesky post to Bluesky, is not a
 * cross-platform share: the network already has Reply, Boost and Quote for it,
 * one press away on page 1. So the post's own network is never offered here —
 * neither the in-app composer nor the hand-off link.
 */
export function homeNetworkOf(provider: ProviderId | undefined): {
  target: PostTarget | null;
  intent: string | null;
} {
  switch (provider ?? 'mastodon') {
    case 'mastodon':
    case 'anonymous-mastodon':
    case 'misskey':
      return { target: 'fedi', intent: null };
    case 'bluesky':
      return { target: 'bsky', intent: 'bluesky' };
    case 'twitter':
      return { target: null, intent: 'twitter' };
    default:
      return { target: null, intent: null };
  }
}
