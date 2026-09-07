import { inject, Injectable } from '@angular/core';
import { Auth } from '../../auth';
import { ProviderId } from '../../models';
import { capabilitiesFor, ProviderCapabilities } from '../provider';

/**
 * Central policy for features that require a real signed-in identity.
 *
 * Shared UI asks this service instead of scattering Anonymous checks. The
 * local implementations for follows, bookmarks, lists, and tags can turn
 * individual capabilities back on in their delivery sprints.
 */
@Injectable({ providedIn: 'root' })
export class AnonymousCapabilities {
  private auth = inject(Auth);

  get active(): boolean {
    return this.auth.isAnonymous;
  }

  get canCompose(): boolean {
    return !this.active;
  }

  get canManageRelationships(): boolean {
    return !this.active;
  }

  /** Follow/Unfollow has a complete browser-local implementation in Anonymous. */
  readonly canFollow = true;
  readonly canManageLists = true;

  get canUseServerActions(): boolean {
    return !this.active;
  }

  readonly canBookmark = true;

  /**
   * Bluesky is a *separate* account with its own credential, so nothing about it
   * needs a Mastodon token — the app password talks straight to bsky.social
   * through `externalFetch`. Gating it on being signed in here was an over-broad
   * reading of "Anonymous can't write": it made the anonymous session, which is
   * the one people try first, the only one that couldn't show a real timeline.
   *
   * Storage is still per-account (`scopedKey`), so Anonymous gets exactly one
   * Bluesky link of its own — the same one-each rule every other account gets,
   * not a shared one.
   */
  readonly canUseBluesky = true;

  /**
   * What the viewer can do to a post from `provider`.
   *
   * `this.active` means Anonymous mode: no token at all, reads go out through
   * `externalFetch()`, and every write would be a 401. That is the only case that
   * takes the buttons away.
   *
   * It takes them away for *every* provider, not just `anonymous-mastodon`: a
   * status still tagged `mastodon` (or carrying no provider) is just as
   * unwritable without a token.
   *
   * When a token *is* held, `anonymous-mastodon` posts are writable like any other.
   * That provider covers a Mastodon-compatible server targeted directly — including
   * a textboard like mawkingbird_server, where a durable session identity replies,
   * likes, boosts, and follows exactly like a logged-in Mastodon account. Returning
   * a flat `false` for the provider used to make likes and boosts unreachable
   * against our own server: `StatusCard.toggleFavourite` returns early on
   * `!caps.favourite`, so the click produced no request and no error to show.
   */
  statusCaps(provider: ProviderId): ProviderCapabilities {
    return capabilitiesFor(provider, !this.active);
  }
}
