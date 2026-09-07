import { computed, inject, Injectable } from '@angular/core';
import { BlueskyProvider } from './bluesky/bluesky-provider';
import { FeedProvider } from './provider';
import { RssProvider } from './rss/rss-provider';
import { AnonymousBlueskyProvider } from './anonymous/anonymous-bluesky-provider';
import { AnonymousMastodonProvider } from './anonymous/anonymous-mastodon-provider';
import { PasteFeedProvider } from './paste/paste-feed-provider';
import { TwitterProvider } from './twitter/twitter-provider';
import { FeatureFlagId, FeatureFlags } from '../feature-flags';

/**
 * The rollout flag each provider answers to, where it has one.
 *
 * A flagged-off provider drops out of {@link ProviderRegistry.linked}, so its
 * posts leave the merged timeline and it stops being offered — but nothing it
 * stored is deleted. Turning the flag back on restores the feed intact, which
 * is the point: these flags exist for third-party outages, and an outage should
 * not cost the user their subscriptions.
 *
 * Anonymous Mastodon has no entry. It is the fallback that makes the app work
 * signed-out, not a third-party integration that can go down.
 */
const PROVIDER_FLAGS: Record<string, FeatureFlagId> = {
  paste: 'pastebin',
  bluesky: 'connector-bluesky',
  rss: 'connector-rss',
  twitter: 'connector-twitter',
};

/**
 * The foreign providers this build knows about. Mastodon is not listed — it is
 * the primary network, not a provider.
 */
@Injectable({ providedIn: 'root' })
export class ProviderRegistry {
  private bluesky = inject(BlueskyProvider);
  private rss = inject(RssProvider);
  private anonymousMastodon = inject(AnonymousMastodonProvider);
  private anonymousBluesky = inject(AnonymousBlueskyProvider);
  private paste = inject(PasteFeedProvider);
  private twitter = inject(TwitterProvider);
  private featureFlags = inject(FeatureFlags);

  readonly all: FeedProvider[] = [
    this.anonymousMastodon,
    // The Bluesky half of the anonymous experience. Mutually exclusive with
    // `bluesky` below by construction: this one requires an anonymous identity,
    // that one requires a linked session.
    this.anonymousBluesky,
    this.bluesky,
    this.rss,
    this.twitter,
    this.paste,
  ];

  /**
   * Providers the user has actually connected (feeds added, account linked…).
   *
   * Bluesky used to be filtered out for the Anonymous account. It isn't any
   * more: the link carries its own credential and needs no Mastodon token, and
   * an anonymous session merging in a real Bluesky timeline is the whole pitch
   * the Invites page makes to Bluesky users. See
   * AnonymousCapabilities.canUseBluesky.
   */
  readonly linked = computed(() => this.all.filter((p) => p.linked() && this.flagAllows(p)));

  /** True when no rollout flag gates this provider, or its flag is on. */
  private flagAllows(provider: FeedProvider): boolean {
    const flag = PROVIDER_FLAGS[provider.id];
    return flag === undefined || this.featureFlags.enabled(flag);
  }
}
