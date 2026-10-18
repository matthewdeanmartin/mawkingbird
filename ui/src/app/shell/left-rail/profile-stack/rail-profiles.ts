import { accountProfilePath } from '../../../account-route';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Api } from '../../../api';
import { Auth } from '../../../auth';
import { Terminology } from '../../../terminology';
import { MastodonConnector } from '../../../providers/mastodon/mastodon-connector';
import { AnonymousFollows } from '../../../providers/anonymous/anonymous-follows';
import { AnonymousTags } from '../../../providers/anonymous/anonymous-tags';
import { BlueskyApi } from '../../../providers/bluesky/bluesky-api';
import { BlueskySession } from '../../../providers/bluesky/bluesky-session';
import { BskyProfile } from '../../../providers/bluesky/bluesky-types';
import { RailProfile } from './rail-profile';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, auditTime, expand, filter, groupBy, mergeMap, reduce } from 'rxjs';
import { accountScopeSuffix } from '../../../account-scope';

/**
 * Assembles the left rail's stack of identity cards — one per network the
 * browser is connected to.
 *
 * This is a service rather than logic inside the card component because the set
 * of identities is a property of the session, not of one widget: a future
 * network joins the stack by adding a branch here, and every consumer (the rail,
 * the account menu, whatever comes next) sees it. The counts that only the
 * client knows — the Anonymous identity's follows and followed hashtags — are
 * gathered here too, so the component stays presentation.
 */
@Injectable({ providedIn: 'root' })
export class RailProfiles {
  private auth = inject(Auth);
  private api = inject(Api);
  private mastodonConnector = inject(MastodonConnector);
  private anonymousFollows = inject(AnonymousFollows);
  private anonymousTags = inject(AnonymousTags);
  private blueskySession = inject(BlueskySession);
  private blueskyApi = inject(BlueskyApi);
  private words = inject(Terminology).words;

  private hashtagCount = signal(0);
  private blueskyProfile = signal<BskyProfile | null>(null);
  private loaded = false;
  private profileRevision = 0;
  private tagRevision = 0;
  private blueskyRevision = 0;

  constructor() {
    this.blueskyApi.profileChanges.pipe(auditTime(100), takeUntilDestroyed()).subscribe((did) => {
      if (this.loaded && did === this.blueskySession.session()?.did) this.loadBluesky();
    });
    this.api.accountChanges
      .pipe(
        filter((event) => event.scope === accountScopeSuffix()),
        groupBy((event) => event.kind),
        mergeMap((group) => group.pipe(auditTime(100))),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        if (!this.loaded || event.scope !== accountScopeSuffix()) return;
        if (event.kind === 'tags') this.loadTags();
        else this.refreshProfile();
      });
  }

  private loadBluesky(): void {
    const did = this.blueskySession.session()?.did;
    const revision = ++this.blueskyRevision;
    this.blueskyApi.getProfile().subscribe({
      next: (profile) => {
        if (did === this.blueskySession.session()?.did && revision === this.blueskyRevision)
          this.blueskyProfile.set(profile);
      },
      error: () => undefined,
    });
  }

  private refreshProfile(): void {
    if (this.auth.isAnonymous || this.auth.isBlueskyPrimary) return;
    const token = this.auth.token();
    const revision = ++this.profileRevision;
    this.api.verifyCredentials().subscribe({
      next: (account) => {
        if (token === this.auth.token() && revision === this.profileRevision)
          this.auth.setAccount(account);
      },
      error: () => undefined,
    });
  }

  private loadTags(): void {
    const token = this.auth.token();
    const revision = ++this.tagRevision;
    this.api
      .followedTagsPage()
      .pipe(
        expand((page) => (page.nextMaxId ? this.api.followedTagsPage(page.nextMaxId) : EMPTY)),
        reduce((tags, page) => {
          for (const tag of page.tags) tags.add(tag.name.toLowerCase());
          return tags;
        }, new Set<string>()),
      )
      .subscribe({
        next: (tags) => {
          if (token === this.auth.token() && revision === this.tagRevision)
            this.hashtagCount.set(tags.size);
        },
        error: () => undefined,
      });
  }

  /**
   * Stats for a Bluesky-primary active card, once `getProfile` has answered.
   * Empty until then — the card renders without a stats row rather than showing
   * zeroes that read as a real tally.
   */
  private blueskyStats(): { label: string; value: number }[] {
    const profile = this.blueskyProfile();
    if (!profile) {
      return [];
    }
    return [
      { label: this.words().Posts, value: profile.postsCount ?? 0 },
      { label: 'Following', value: profile.followsCount ?? 0 },
      { label: 'Followers', value: profile.followersCount ?? 0 },
    ];
  }

  /** Follows for the active identity; the server's figure, or the local one. */
  readonly followingCount = computed(() =>
    this.auth.isAnonymous
      ? this.anonymousFollows.count()
      : (this.auth.account()?.following_count ?? 0),
  );

  /**
   * The stack, back to front: peeking tabs keep this order and the selected card
   * is the one that opens. The active identity leads — it is the one the app is
   * posting as, so it should be the card sitting there on first load.
   */
  readonly profiles = computed<RailProfile[]>(() => {
    const cards: RailProfile[] = [];
    const active = this.auth.account();
    if (active && !this.auth.isAnonymous) {
      // The active card names the network the app is signed in *to*. Before
      // Bluesky could be an identity this was a two-way choice, and anything
      // that was not Anonymous was Mastodon by definition — which labelled a
      // Bluesky-primary account "🐘 Mastodon" under its own bsky.social handle.
      const blueskyActive = this.auth.isBlueskyPrimary;
      cards.push({
        key: blueskyActive ? `bluesky:${active.id}` : `mastodon:${active.id}`,
        badge: blueskyActive ? '🦋' : '🐘',
        network: blueskyActive ? 'Bluesky' : 'Mastodon',
        displayName: active.display_name || active.username,
        handle: active.username,
        avatar: active.avatar_static || active.avatar,
        header: active.header_static || active.header,
        bioHtml: active.note || undefined,
        // A Bluesky-primary account's stats come from `getProfile`, not from the
        // active `Account`: the identity adapter zeroes its counts rather than
        // inventing them (four zeroes that look like a tally are worse than
        // none), and `load()` has already fetched the real figures for the card.
        // No Hashtags row — followed hashtags are a Mastodon concept this
        // account does not have until Sprint 4 attaches one.
        stats: blueskyActive
          ? this.blueskyStats()
          : [
              {
                label: this.words().Posts,
                value: active.statuses_count,
                link: accountProfilePath(active),
              },
              {
                label: 'Following',
                value: this.followingCount(),
                link: accountProfilePath(active),
                queryParams: { tab: 'following' },
              },
              {
                label: 'Followers',
                value: active.followers_count,
                link: accountProfilePath(active),
                queryParams: { tab: 'followers' },
              },
              {
                label: 'Hashtags',
                value: this.hashtagCount(),
                link: ['/feeds/tags'],
              },
            ],
        link: accountProfilePath(active),
        account: active,
        active: true,
      });
    }
    // The connector card. Skipped when Bluesky *is* the active identity: the
    // session behind it is the same account already shown above, so rendering it
    // again would stack the user's own account on top of itself — once correctly
    // labelled and once as a connector they never linked.
    const bsky = this.auth.isBlueskyPrimary ? null : this.blueskySession.session();
    if (bsky) {
      const profile = this.blueskyProfile();
      cards.push({
        key: `bluesky:${bsky.did}`,
        badge: '🦋',
        network: 'Bluesky',
        displayName: profile?.displayName || bsky.displayName || bsky.handle,
        handle: bsky.handle,
        avatar: profile?.avatar || bsky.avatar,
        header: profile?.banner,
        bioText: profile?.description || undefined,
        // Counts only exist once getProfile has answered; an empty row beats
        // four zeroes that look like a real (and wrong) tally.
        stats: profile
          ? [
              { label: this.words().Posts, value: profile.postsCount ?? 0 },
              { label: 'Following', value: profile.followsCount ?? 0 },
              { label: 'Followers', value: profile.followersCount ?? 0 },
            ]
          : [],
        href: `https://bsky.app/profile/${bsky.handle}`,
        active: false,
      });
    }
    const connector = this.mastodonConnector.current();
    if (this.auth.isBlueskyPrimary && connector.state === 'signed-in' && connector.account) {
      const local = connector.account;
      cards.push({
        key: `mastodon:${local.id}`,
        badge: '🐘',
        network: 'Mastodon',
        displayName: local.display_name || local.username,
        handle: local.username,
        avatar: local.avatar_static || local.avatar,
        header: local.header_static || local.header,
        bioHtml: local.note || undefined,
        stats: [
          { label: this.words().Posts, value: local.statuses_count },
          { label: 'Following', value: local.following_count },
          { label: 'Followers', value: local.followers_count },
        ],
        active: false,
        href: local.url,
      });
    }
    return cards;
  });

  /**
   * Fetch the figures the cards can't derive locally. Safe to call repeatedly —
   * the rail is rebuilt on every navigation, and these are once-per-session.
   */
  load(): void {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    if (this.auth.isAnonymous) {
      this.hashtagCount.set(this.anonymousTags.count());
    } else if (this.auth.isBlueskyPrimary) {
      // `followedTags()` is an authenticated Mastodon call and would 401 here.
      // Followed hashtags are a Mastodon concept this account does not have until
      // Sprint 4 attaches one.
      this.hashtagCount.set(0);
    } else {
      this.loadTags();
    }
    if (this.blueskySession.linked()) {
      this.loadBluesky();
    }
  }
}
