import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { InstanceInfo, Status, Tag } from '../../models';
import { Terminology } from '../../terminology';

type ExploreTab = 'posts' | 'hashtags';

/**
 * Logged-out discovery surface, mirroring mastodon.social's public landing: a server
 * intro, trending posts/hashtags, and sign-in calls to action. Served with anonymous
 * access (no auth guard); trends + instance metadata are public endpoints.
 */
// i18n pages.explore.introLede: <strong>{{domain}}</strong> is one of the many independent Mastodon servers you can use to participate in the fediverse.
// i18n pages.explore.theServerStaff: the server staff
// i18n pages.explore.administeredBy: Administered by
// i18n pages.explore.serverStats: Server stats
// i18n pages.explore.activeUsers: <strong>{{count}}</strong> active users
// i18n pages.explore.loadingServerInfo: Loading server info…
// i18n pages.explore.trending: Trending
// i18n pages.explore.tabs.posts: Posts
// i18n pages.explore.tabs.hashtags: Hashtags
// i18n pages.explore.loadingPosts: Loading trending posts…
// i18n pages.explore.noTrendingPosts: Nothing trending yet — seed some sample data to populate this.
// i18n pages.explore.repliesCount: {{count}} replies
// i18n pages.explore.boostsCount: {{count}} {{boosts}}
// i18n pages.explore.favouritesCount: {{count}} favourites
// i18n pages.explore.loadingHashtags: Loading trending hashtags…
// i18n pages.explore.noTrendingHashtags: No trending hashtags yet.
// i18n pages.explore.recentUses: {{count}} recent uses
// i18n pages.explore.cta.headline: The best way to keep up with what's happening.
// i18n pages.explore.cta.blurb: Follow anyone across the fediverse and see it all in chronological order. No algorithms, ads, or clickbait in sight.
// i18n pages.explore.cta.backToTimeline: Back to your timeline
// i18n pages.explore.cta.createAccount: Create account
// i18n pages.explore.cta.login: Login
@Component({
  selector: 'app-explore',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './explore.html',
  styleUrl: './explore.css',
})
export class Explore implements OnInit {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  private api = inject(Api);
  protected auth = inject(Auth);

  protected tab = signal<ExploreTab>('posts');

  protected instance = signal<InstanceInfo | null>(null);
  protected posts = signal<Status[]>([]);
  protected tags = signal<Tag[]>([]);

  protected loadingPosts = signal(true);
  protected loadingTags = signal(true);

  ngOnInit(): void {
    this.api.instanceInfo().subscribe({
      next: (info) => this.instance.set(info),
      error: () => this.instance.set(null),
    });
    this.api.trendingStatuses().subscribe({
      next: (posts) => {
        this.posts.set(posts);
        this.loadingPosts.set(false);
      },
      error: () => this.loadingPosts.set(false),
    });
    this.api.trendingTags().subscribe({
      next: (tags) => {
        this.tags.set(tags);
        this.loadingTags.set(false);
      },
      error: () => this.loadingTags.set(false),
    });
  }

  selectTab(tab: ExploreTab): void {
    this.tab.set(tab);
  }

  /** Sum of a tag's recent-history `uses` for the "N people in the past N days" line. */
  tagUses(tag: Tag): number {
    return (tag.history ?? []).reduce((sum, h) => sum + Number(h.uses || 0), 0);
  }
}
