import { HomeTopics } from './home-topics';
import { ProfileLists } from './providers/account/profile-lists';
import { ProfileAccountKey } from './providers/account/profile-account-key';
import { SupporterStatus } from './providers/account/supporter-status';
import { accountScopeSuffix } from './account-scope';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, map, Observable, of, switchMap, from } from 'rxjs';
import { Api } from './api';
import { Auth } from './auth';
import { FavoriteFeed } from './home-algo-settings';
import { Status, TrendLink } from './models';
import { FeedSection } from './lists/feed-sections';
import { SERVER_FEEDS } from './lists/server-feeds';
import { ServerFeedKind } from './lists/list-source';
import { ListFeedResolver } from './lists/list-feed-resolver';
import { ClientLists } from './lists/client-lists';
import { TagBundles } from './lists/tag-bundles';
import { AnonymousLists } from './providers/anonymous/anonymous-lists';
import { AnonymousFollows } from './providers/anonymous/anonymous-follows';
import {
  AnonymousMastodonProvider,
  AnonymousFollowFeedSession,
} from './providers/anonymous/anonymous-mastodon-provider';
import { BlueskyFeeds } from './providers/bluesky/bluesky-feeds';
import { BlueskyApi } from './providers/bluesky/bluesky-api';
import { adaptPost } from './providers/bluesky/bluesky-adapter';
import { SavedSearches, isMastodonSaved, isBlueskySaved } from './pages/search/saved-searches';
import { serializeMastodonQuery } from './pages/search/mastodon-query-serializer';
import { RssSubscriptions } from './providers/rss/rss-subscriptions';
import { RssProvider } from './providers/rss/rss-provider';
import { feedToStatuses } from './providers/rss/rss-adapter';
import { VideoSubscriptions, videoFeedUrl } from './providers/videos/video-subscriptions';
import { YoutubeFeeds } from './providers/videos/youtube-feeds';
import { TwitterFollows } from './providers/twitter/twitter-follows';
import { TwitterFeed } from './providers/twitter/twitter-feed';
import { MastodonServers } from './mastodon-servers';
import { OtherServerFeeds } from './providers/other-server-feeds';

export interface FavoritePage {
  posts: Status[];
  cursor: string | null;
}
/** Loaded only by Home/Settings, never by the shell or route guards. */
@Injectable({ providedIn: 'root' })
export class HomeFeedCatalog {
  private api = inject(Api);
  private auth = inject(Auth);
  private topics = inject(HomeTopics);
  private profileLists = inject(ProfileLists);
  private profileKey = inject(ProfileAccountKey);
  private supporter = inject(SupporterStatus);
  private anonymousFeeds = new Map<string, AnonymousFollowFeedSession>();
  private lists = inject(AnonymousLists);
  private follows = inject(AnonymousFollows);
  private anonymous = inject(AnonymousMastodonProvider);
  private clients = inject(ClientLists);
  private bundles = inject(TagBundles);
  private resolver = inject(ListFeedResolver);
  private bsky = inject(BlueskyFeeds);
  private bskyApi = inject(BlueskyApi);
  private searches = inject(SavedSearches);
  private rss = inject(RssSubscriptions);
  private rssProvider = inject(RssProvider);
  private videos = inject(VideoSubscriptions);
  private youtube = inject(YoutubeFeeds);
  private twitter = inject(TwitterFollows);
  private tweets = inject(TwitterFeed);
  private servers = inject(MastodonServers);
  private remote = inject(OtherServerFeeds);

  async choices(type: Exclude<FeedSection, 'all'>): Promise<FavoriteFeed[]> {
    const choice = (id: string, label: string): FavoriteFeed => ({ type, id, label });
    switch (type) {
      case 'tags':
        return (await this.topics.followed()).map((t) => choice(t, '#' + t));
      case 'featured-tags':
        return (await firstValueFrom(this.api.featuredTags())).map((t) =>
          choice(t.name, '#' + t.name),
        );
      case 'lists':
        return (
          this.auth.isAnonymous ? this.lists.lists() : await firstValueFrom(this.api.lists())
        ).map((l) => choice(l.id, l.title));
      case 'client-lists': {
        const choices = this.clients.lists().map((l) => choice(l.id, l.title));
        if (this.supporter.isSupporter() && this.profileKey.current()) {
          await this.profileLists.load();
          choices.push(...this.profileLists.lists().map((l) => choice('profile:' + l.id, l.title)));
        }
        return choices;
      }
      case 'tag-bundles':
        return this.bundles.bundles().map((l) => choice(l.id, l.title));
      case 'searches':
        return this.searches
          .all()
          .filter((s) => !isMastodonSaved(s) || s.search.target !== 'accounts')
          .map((s) => choice(s.id, s.name));
      case 'server':
        return SERVER_FEEDS.map((f) => choice(f.feed, f.title));
      case 'other-servers':
        await this.servers.ready();
        return this.servers
          .servers()
          .flatMap((s) =>
            SERVER_FEEDS.map((f) => choice(`${s.domain}/${f.feed}`, `${s.domain} · ${f.title}`)),
          );
      case 'collections':
        return (await firstValueFrom(this.api.accountCollections(this.auth.account()!.id))).map(
          (c) => choice(c.id, c.name),
        );
      case 'endorsements':
        return this.auth.account()
          ? [
              choice(
                this.auth.account()!.id,
                this.auth.account()!.display_name || this.auth.account()!.username,
              ),
            ]
          : [];
      case 'rss':
        return this.rss.feeds().map((f) => choice(f.url, f.title || f.url));
      case 'videos':
        return this.videos.feeds().map((f) => choice(f.id, f.title));
      case 'twitter':
        return this.twitter.follows().map((f) => choice(f.username, '@' + f.username));
      default: {
        const entries = await firstValueFrom(
          type === 'bsky-popular' ? this.bsky.loadPopular() : this.bsky.load(),
        );
        return entries
          .filter(
            (e) =>
              type === 'bsky-popular' ||
              (type === 'bsky-pinned'
                ? e.pinned
                : !e.pinned && e.kind === (type === 'bsky-lists' ? 'list' : 'feed')),
          )
          .map((e) => choice(`${e.kind}:${e.uri}`, e.displayName));
      }
    }
  }

  page(feed: FavoriteFeed, cursor: string | null): Observable<FavoritePage> {
    const once = (source: Observable<Status[]>) =>
      source.pipe(map((posts) => ({ posts, cursor: null })));
    const paged = (source: Observable<Status[]>) =>
      source.pipe(
        map((posts) => ({
          posts,
          cursor: posts.length >= 20 && posts.at(-1)?.id !== cursor ? posts.at(-1)!.id : null,
        })),
      );
    const id = feed.id;
    switch (feed.type) {
      case 'tags':
      case 'featured-tags':
        return paged(this.api.tagTimeline(id, cursor ?? undefined));
      case 'lists': {
        if (!this.auth.isAnonymous) return paged(this.api.listTimeline(id, cursor ?? undefined));
        const key = `${accountScopeSuffix()}:${id}`;
        if (!cursor || !this.anonymousFeeds.has(key)) {
          this.anonymousFeeds.set(
            key,
            this.anonymous.createFollowFeed(
              this.follows.follows().filter((f) => this.lists.get(id)?.memberKeys.includes(f.key)),
            ),
          );
        }
        return this.anonymousFeeds
          .get(key)!
          .fetchPage()
          .pipe(
            map((p) => ({
              posts: p.statuses,
              cursor: p.hasMore ? String(Number(cursor ?? 0) + 1) : null,
            })),
          );
      }
      case 'client-lists':
        return once(
          from(id.startsWith('profile:') ? this.profileLists.load() : Promise.resolve()).pipe(
            switchMap(() =>
              this.resolver.resolveHandles(
                (id.startsWith('profile:')
                  ? this.profileLists.get(id.slice(8))
                  : this.clients.lists().find((l) => l.id === id)
                )?.memberHandles ?? [],
              ),
            ),
            switchMap((accounts) => this.resolver.mergeMemberTimelines(accounts.map((a) => a.id))),
            map((p) => p.statuses),
          ),
        );
      case 'tag-bundles':
        return once(
          this.resolver
            .mergeTagTimelines(this.bundles.get(id)?.tags ?? [])
            .pipe(map((p) => p.statuses)),
        );
      case 'collections':
        return once(
          this.api.getCollection(id).pipe(
            switchMap((c) => this.resolver.mergeMemberTimelines(c.accounts.map((a) => a.id))),
            map((p) => p.statuses),
          ),
        );
      case 'endorsements':
        return once(
          this.api.accountEndorsements(id).pipe(
            switchMap((accounts) => this.resolver.mergeMemberTimelines(accounts.map((a) => a.id))),
            map((p) => p.statuses),
          ),
        );
      case 'rss':
        return once(this.rssProvider.getFeed(id).pipe(map((p) => p.statuses)));
      case 'videos':
        return once(
          from(this.youtube.feed(id)).pipe(
            map((f) => feedToStatuses(videoFeedUrl(id), f, new Date().toISOString())),
          ),
        );
      case 'twitter': {
        const follow = this.twitter.follows().find((f) => f.username === id);
        return once(follow ? this.tweets.timeline(follow) : of([]));
      }
      case 'server':
      case 'other-servers': {
        const split = id.lastIndexOf('/');
        const host = feed.type === 'other-servers' ? id.slice(0, split) : null;
        const kind = (host ? id.slice(split + 1) : id) as ServerFeedKind;
        if (kind === 'news')
          return once(
            (host ? this.remote.news(host) : this.api.trendingLinks()).pipe(
              map((links) => this.news(links)),
            ),
          );
        const source = host
          ? this.remote.statuses(host, kind, cursor ?? undefined)
          : kind === 'trending'
            ? this.api.trendingStatuses()
            : this.api.publicTimeline(kind === 'local', cursor ?? undefined);
        return kind === 'trending' ? once(source) : paged(source);
      }
      case 'searches': {
        const saved = this.searches.all().find((s) => s.id === id);
        if (!saved) return once(of([]));
        if (isMastodonSaved(saved))
          return this.api
            .search(serializeMastodonQuery(saved.search.post ?? {}), 'statuses', {
              limit: 20,
              offset: Number(cursor ?? 0),
            })
            .pipe(
              map((p) => ({
                posts: p.statuses,
                cursor: p.statuses.length >= 20 ? String(Number(cursor ?? 0) + 20) : null,
              })),
            );
        if (!isBlueskySaved(saved)) return once(of([]));
        return this.bskyApi
          .searchPosts(saved.search, cursor)
          .pipe(map((p) => ({ posts: p.posts.map(adaptPost), cursor: p.cursor ?? null })));
      }
      default:
        return this.bsky
          .page(
            { kind: id.startsWith('list:') ? 'list' : 'feed', uri: id.slice(id.indexOf(':') + 1) },
            cursor,
          )
          .pipe(map((p) => ({ posts: p.statuses, cursor: p.cursor })));
    }
  }
  private news(links: TrendLink[]): Status[] {
    return feedToStatuses(
      'https://mawkingbird.com/feeds/news',
      {
        title: 'News',
        link: null,
        items: links.map((l) => ({
          guid: l.url,
          title: l.title,
          link: l.url,
          html: l.description,
          publishedAt: null,
          isFullContent: false,
          enclosures: [],
          categories: [],
          author: l.provider_name,
          commentsFeedUrl: null,
          commentCount: null,
        })),
      },
      new Date().toISOString(),
    );
  }
}
