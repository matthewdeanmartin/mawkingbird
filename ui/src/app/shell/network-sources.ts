/**
 * Which networks this account can actually *use* — the one predicate pair the
 * chrome reads.
 *
 * ## Why this exists
 *
 * The rails were written when every authenticated account was Mastodon-primary,
 * so they ask `auth.isAuthenticated` and render Mastodon widgets. For a
 * Bluesky-primary account that is wrong in both directions at once: it shows
 * four widgets that cannot work (Just My Server has no instances to narrow to, a
 * donate block asking them to fund a server they do not use, a server-info card
 * describing an instance that is not their home, Fediverse trends links into
 * endpoints there is no token for) and shows no Bluesky equivalent of any of it.
 *
 * The same defect exists in reverse: a Mastodon-primary account that links
 * Bluesky gains a Bluesky *source* and no Bluesky chrome at all.
 *
 * So the question the chrome should ask is not "is someone signed in" and not
 * "what kind of account is this", but **"is there a usable source for network
 * X"** — which is true for two different reasons per network, and that is
 * exactly what makes a single predicate worth naming.
 *
 * ```
 *                     usableMastodon        usableBluesky
 * mastodon-primary    yes (identity)        only if connector linked
 * bluesky-primary     only if opted in      yes (identity)
 * anonymous           yes (reads a server)  only if connector linked
 * ```
 *
 * A user with both sees both. That is correct, and the crowding it causes is
 * deliberately deferred — see the sprint. What this must never do is *stack* for
 * someone who only has one network: a Bluesky-primary account without a Mastodon
 * connector loses four Mastodon widgets and gains two Bluesky ones, which is net
 * better, not worse.
 */

import { inject } from '@angular/core';
import { Auth } from '../auth';
import { BlueskySession } from '../providers/bluesky/bluesky-session';
import { MastodonConnector } from '../providers/mastodon/mastodon-connector';

/** The two predicates, as signals, for a component to hold. */
export interface NetworkSources {
  /** A Mastodon source exists: the identity itself, or an opted-in connector. */
  readonly usableMastodon: () => boolean;
  /** A Bluesky source exists: the identity itself, or a linked connector. */
  readonly usableBluesky: () => boolean;
}

/**
 * Build the predicate pair for the current injection context.
 *
 * A function rather than a service so it stays a thin read over the three
 * services that already own these facts — there is no state here, and a service
 * would invite one.
 */
export function networkSources(): NetworkSources {
  const auth = inject(Auth);
  const bsky = inject(BlueskySession);
  const connector = inject(MastodonConnector);

  return {
    usableMastodon: () => {
      // Bluesky-primary is the *only* kind that has to opt in. This is the
      // Sprint 4 reversal showing up in the chrome, and it is the reason that
      // sprint modelled `absent` as a state rather than defaulting to anonymous.
      if (auth.isBlueskyPrimary) {
        return connector.optedIn();
      }
      // Everyone else keeps exactly the rails they had. That includes:
      //
      //   mastodon-primary — Mastodon is the identity;
      //   anonymous        — browsing anonymously *is* reading a Mastodon
      //                      server, which is the whole shape of that account;
      //   signed out       — the rail still renders (the shell does not gate it)
      //                      and used to show the Fediverse card to visitors.
      //
      // Defaulting the last one to `false` would have been a silent regression
      // for every logged-out visitor, which is not what this sprint is for: the
      // standing rule is that only Bluesky-primary accounts see any change.
      return true;
    },
    // `linked` is true for both of BlueskySession's roles — the primary identity
    // and a connector under someone else's account — which is exactly the union
    // this predicate wants. See the bluesky-session-two-roles note.
    usableBluesky: () => bsky.linked(),
  };
}
