import { computed, inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslocoService } from '@jsverse/transloco';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { SearchServer } from '../../search-server';
import { Status } from '../../models';
import { BlueskyApi } from '../../providers/bluesky/bluesky-api';
import { adaptPost } from '../../providers/bluesky/bluesky-adapter';
import { BskyThreadNode } from '../../providers/bluesky/bluesky-types';
import { RssProvider } from '../../providers/rss/rss-provider';
import { TwitterApi } from '../../providers/twitter/twitter-api';
import { TwitterFeed } from '../../providers/twitter/twitter-feed';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import {
  AnonymousPublicRef,
  parseAnonymousStatusRouteRef,
} from '../../providers/anonymous/anonymous-route-ref';
import { AnonymousBookmarks } from '../../providers/anonymous/anonymous-bookmarks';
import { ElizaService } from '../../eliza/eliza.service';
import { LocalPostStore } from '../../eliza/local-post-store';
import { isElizaId } from '../../eliza/eliza-identity';
import { messageStatus, parseMessageStatusRouteRef } from '../../providers/paste/message-payload';

/**
 * Resolving a status id into a post and its conversation, whatever it is a
 * post *of*.
 *
 * ## Why this is a service
 *
 * A route id in this app addresses eight different things — a Mastodon status,
 * a Bluesky post, an RSS item, a tweet, an Eliza or local practice post, a
 * message serialized into the URL, an anonymous public status — and each one
 * loads differently, pays differently, and fails differently. That branching
 * used to live inside `thread.ts`, which was fine while the thread page was the
 * only thing that could open a status.
 *
 * The reader page opens the same ids. Copying the branching would mean two
 * places to fix when a provider changes, and — worse — two places that could
 * disagree about what `rss:<feed>::<guid>` means. Both pages resolve through
 * here instead.
 *
 * ## Not a cache
 *
 * Each instance loads one thing. It is provided per-component, so navigating
 * between two documents does not leave the first one's descendants attached to
 * the second. Where a provider has its own cache (Twitter's feed cache, the RSS
 * item store) this goes through it, so opening a post that was just on screen
 * does not pay for it twice.
 */

/** Everything a reading surface needs to know about what it just loaded. */
@Injectable()
export class ThreadLoader {
  private api = inject(Api);
  private auth = inject(Auth);
  private searchServer = inject(SearchServer);
  private bsky = inject(BlueskyApi);
  private rss = inject(RssProvider);
  private twitterApi = inject(TwitterApi);
  private twitterFeed = inject(TwitterFeed);
  private anonymousPublic = inject(AnonymousPublicApi);
  private anonymousBookmarks = inject(AnonymousBookmarks);
  private eliza = inject(ElizaService);
  private localPosts = inject(LocalPostStore);
  private transloco = inject(TranslocoService);

  private sub = new Subscription();

  readonly status = signal<Status | null>(null);
  readonly ancestors = signal<Status[]>([]);
  readonly descendants = signal<Status[]>([]);
  readonly loading = signal(true);

  /** Why the post could not be loaded, when it could not be. */
  readonly loadError = signal<string | null>(null);

  /** True while viewing an RSS article: read-only, comments come from a feed. */
  readonly isRss = signal(false);

  /**
   * The feed this RSS item came from, so the reader can go back to it.
   *
   * Without this, leaving an article stranded the reader on a page that looks
   * like a timeline with no route back to `/rss`. Returning to the *specific*
   * feed rather than the pane's default keeps their place.
   */
  readonly rssFeedUrl = signal<string | null>(null);

  /** Whether the RSS item declared a comment feed we could load. */
  readonly rssHasCommentFeed = signal(false);

  /** True once a declared RSS comment feed came back empty or failed to load. */
  readonly rssCommentsUnavailable = signal(false);

  /** True when this thread is a tweet and its replies. */
  readonly isTwitter = signal(false);

  /** Why the X replies could not be loaded, if they could not. */
  readonly twitterError = signal<string | null>(null);

  readonly isAnonymousPublic = signal(false);
  readonly publicContextUnavailable = signal(false);
  readonly publicOriginalUrl = signal<string | null>(null);

  /**
   * True while viewing a message serialized into the URL: a synthetic,
   * read-only post with no network identity.
   */
  readonly isMessageStatus = signal(false);

  /** The whole thread in display order. */
  readonly thread = computed<Status[]>(() => {
    const s = this.status();
    return s ? [...this.ancestors(), s, ...this.descendants()] : [];
  });

  /** Drop any in-flight requests. Callers must do this on destroy. */
  destroy(): void {
    this.sub.unsubscribe();
    this.sub = new Subscription();
  }

  load(id: string): void {
    this.destroy();
    this.loading.set(true);
    this.loadError.set(null);
    this.status.set(null);
    this.ancestors.set([]);
    this.descendants.set([]);
    this.isRss.set(false);
    this.rssFeedUrl.set(null);
    this.isTwitter.set(false);
    this.twitterError.set(null);
    this.isAnonymousPublic.set(false);
    this.isMessageStatus.set(false);
    this.publicContextUnavailable.set(false);
    this.publicOriginalUrl.set(null);
    this.rssHasCommentFeed.set(false);
    this.rssCommentsUnavailable.set(false);

    if (id.startsWith('bsky:')) {
      this.loadBsky(id.slice('bsky:'.length));
      return;
    }
    if (id.startsWith('rss:')) {
      this.loadRss(id);
      return;
    }
    if (id.startsWith('twitter:')) {
      this.loadTwitter(id.slice('twitter:'.length));
      return;
    }
    if (isElizaId(id) || id.startsWith('local:')) {
      this.loadLocal(id);
      return;
    }
    const messagePayload = parseMessageStatusRouteRef(id);
    if (messagePayload) {
      // A self-contained message serialized into the URL: render it as a native
      // post with no network and no thread context. Read-only — there is no
      // real status to reply to, boost, favourite or bookmark.
      this.isMessageStatus.set(true);
      this.status.set(messageStatus(messagePayload, this.messagePermalink(id)));
      this.loading.set(false);
      return;
    }
    const publicRef = parseAnonymousStatusRouteRef(id) ?? parseAnonymousFeedId(id);
    if (publicRef) {
      this.loadPublicPost(publicRef);
      return;
    }

    this.sub.add(
      this.api.getStatus(id).subscribe({
        next: (s) => {
          this.status.set(s);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          // Without a handler the spinner never stopped. Unlike an account,
          // there is no recovery to attempt: post ids are per-server and a post
          // has no portable identifier to re-resolve it by, so the honest move
          // is to say so and point somewhere that works.
          const status = (error as { status?: number })?.status;
          this.loading.set(false);
          this.loadError.set(
            status === 404
              ? this.transloco.translate('pages.thread.error.postNotOnServer')
              : this.transloco.translate('pages.thread.error.loadPost'),
          );
        },
      }),
    );
    this.sub.add(
      this.api.getContext(id).subscribe((ctx) => {
        this.ancestors.set(ctx.ancestors);
        this.descendants.set(ctx.descendants);
      }),
    );
  }

  /**
   * A post that lives on another server: through the home server when we have
   * one, directly otherwise.
   *
   * ## Why this branch exists
   *
   * The id says "read this from graz.social". Doing that literally means an
   * unauthenticated request — `externalFetch()` strips the bearer token, and
   * correctly so, since it belongs to a different host. The remote server
   * therefore has no idea who is asking and serves only what is public.
   *
   * For a signed-out reader that is the whole story. For a signed-in one it is
   * a downgrade they never asked for: **followers-only and unlisted posts
   * silently do not exist**, and instances that require signed fetches refuse
   * outright. The reader sees a 404 or a thin thread and cannot tell that the
   * post is there and they are entitled to it.
   *
   * These ids reach a signed-in session easily — minted while browsing
   * anonymously, or from a search against a search server, then kept in
   * history, a bookmark, or the reader's library. Signing in does not rewrite
   * them.
   *
   * ## How the home server helps
   *
   * `GET /api/v2/search?q=<url>&resolve=true` asks our *own* server to fetch
   * the post over ActivityPub under our identity and hand back a local copy.
   * That is an ordinary authenticated call to the server we already talk to, on
   * an endpoint that already exists — not a new capability.
   *
   * The public read stays as the fallback, because resolution legitimately
   * fails: a server may not federate with that instance, or may be slow, or the
   * post may genuinely be public and unknown to it. Falling back is strictly
   * better than an error, and the reader keeps whatever the remote will give.
   */
  private loadPublicPost(ref: AnonymousPublicRef): void {
    // Nothing to resolve *with*: no Mastodon token means no home server that
    // could fetch on our behalf. Bluesky-primary and Anonymous both land here.
    // A separately configured search server is also not ours to ask — it is a
    // host we read anonymously by design.
    if (this.auth.lacksMastodonToken || this.searchServer.active() || !ref.originalUrl) {
      this.loadAnonymousPublic(ref);
      return;
    }

    this.sub.add(
      this.api.search(ref.originalUrl, 'statuses', { resolve: true, limit: 1 }).subscribe({
        next: (results) => {
          const resolved = results.statuses[0];
          if (!resolved) {
            // Our server does not know it. The remote may still show it.
            this.loadAnonymousPublic(ref);
            return;
          }
          this.status.set(resolved);
          this.publicOriginalUrl.set(ref.originalUrl ?? null);
          this.loading.set(false);
          // A local id, so the ordinary context endpoint applies — and with it
          // the replies our server can see and the remote would not have shown.
          this.sub.add(
            this.api.getContext(resolved.id).subscribe({
              next: (ctx) => {
                this.ancestors.set(ctx.ancestors);
                this.descendants.set(ctx.descendants);
              },
              error: () => this.publicContextUnavailable.set(true),
            }),
          );
        },
        error: () => this.loadAnonymousPublic(ref),
      }),
    );
  }

  /** Public Mastodon status and context; a blocked context never hides the post. */
  private loadAnonymousPublic(ref: AnonymousPublicRef): void {
    this.isAnonymousPublic.set(true);
    this.publicOriginalUrl.set(ref.originalUrl ?? null);
    this.sub.add(
      this.anonymousPublic.getStatus(ref).subscribe({
        next: (status) => {
          const saved = this.anonymousBookmarks.has(status);
          this.status.set(saved ? { ...status, bookmarked: true } : status);
          this.publicOriginalUrl.set(status.url ?? ref.originalUrl ?? null);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      }),
    );
    this.sub.add(
      this.anonymousPublic.getContext(ref).subscribe({
        next: (context) => {
          this.ancestors.set(context.ancestors);
          this.descendants.set(context.descendants);
        },
        error: () => this.publicContextUnavailable.set(true),
      }),
    );
  }

  /**
   * A browser-local practice thread: Eliza's posts and the viewer's own local
   * posts, assembled with no network. Missing ids (e.g. a stale link after
   * unfollow cleared the feed) fall through to the empty state.
   */
  private loadLocal(id: string): void {
    this.localPosts.refresh();
    const thread = this.localPosts.thread(id, this.eliza.timeline());
    if (!thread) {
      this.loading.set(false);
      return;
    }
    this.status.set(thread.status);
    this.ancestors.set(thread.ancestors);
    this.descendants.set(thread.descendants);
    this.loading.set(false);
  }

  /** The canonical in-app permalink for a URL-serialized message. */
  private messagePermalink(id: string): string | null {
    try {
      return new URL(`statuses/${id}`, document.baseURI).toString();
    } catch {
      return null;
    }
  }

  /** Bluesky thread: `getPostThread` mapped onto ancestors/descendants. */
  private loadBsky(uri: string): void {
    this.sub.add(
      this.bsky.getPostThread(uri).subscribe({
        next: ({ thread }) => {
          if (!thread.post) {
            this.loading.set(false);
            return;
          }
          this.status.set(adaptPost(thread.post));
          const ancestors: Status[] = [];
          for (let node = thread.parent; node; node = node.parent) {
            if (node.post) {
              ancestors.unshift(adaptPost(node.post));
            }
          }
          this.ancestors.set(ancestors);
          this.descendants.set(flattenReplies(thread.replies ?? []));
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      }),
    );
  }

  /**
   * A tweet and its direct replies.
   *
   * Costs **one** request, for the replies. The focus post itself comes out of
   * the feed cache — the reader was looking at it a moment ago — so clicking
   * into a thread does not pay twice for something already on screen.
   *
   * Deliberately no ancestors. Walking to the conversation root costs one
   * request per level with the depth unknowable in advance, which is the
   * unbounded chain the spec warns about (§6.10).
   */
  private loadTwitter(tweetId: string): void {
    this.isTwitter.set(true);
    this.ancestors.set([]);
    this.descendants.set([]);
    // Wait for the saved timelines to load before deciding to pay. On a reload
    // this is the difference between the post being already in hand and buying
    // it again.
    void this.twitterFeed.hydrated.then(() => this.showTwitterPost(tweetId));
  }

  private showTwitterPost(tweetId: string): void {
    const cached = this.twitterFeed.findCached(`twitter:${tweetId}`);
    if (cached) {
      this.status.set(cached);
      this.loading.set(false);
    } else {
      // Genuinely not held: a link to a post from an account nobody here
      // follows. One request, paid only on this path.
      this.sub.add(
        this.twitterApi.getPost(tweetId).subscribe({
          next: (status) => {
            this.status.set(status);
            this.loading.set(false);
          },
          error: (error: unknown) => {
            this.twitterError.set(
              error instanceof Error
                ? error.message
                : this.transloco.translate('pages.thread.twitter.loadPost'),
            );
            this.loading.set(false);
          },
        }),
      );
    }

    this.sub.add(
      this.twitterApi.getReplies(tweetId).subscribe({
        next: (page) => {
          this.descendants.set(page.statuses);
          // A cold load (reload, shared link) has no cached focus post. The
          // replies carry `inReplyToId` but not the parent itself, so rather
          // than spend a second request the page shows the replies under a note.
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.twitterError.set(
            error instanceof Error
              ? error.message
              : this.transloco.translate('pages.thread.twitter.loadReplies'),
          );
          this.loading.set(false);
        },
      }),
    );
  }

  /**
   * RSS article: resolve the item from its feed, then (if the publisher
   * declares a comment feed) load the comments as descendants.
   * Ids are `rss:<feedUrl>::<guid>`.
   */
  private loadRss(id: string): void {
    this.isRss.set(true);
    const body = id.slice('rss:'.length);
    const sep = body.indexOf('::');
    if (sep === -1) {
      this.loading.set(false);
      return;
    }
    const feedUrl = body.slice(0, sep);
    const guid = body.slice(sep + 2);
    this.rssFeedUrl.set(feedUrl);
    this.ancestors.set([]);
    this.descendants.set([]);
    this.sub.add(
      this.rss.getFeedItem(feedUrl, guid).subscribe({
        next: (view) => {
          this.status.set(view.status);
          this.loading.set(false);
          if (view.commentsFeedUrl) {
            this.rssHasCommentFeed.set(true);
            this.loadRssComments(view.commentsFeedUrl, feedUrl, view.status.id);
          }
        },
        error: () => this.loading.set(false),
      }),
    );
  }

  private loadRssComments(commentsFeedUrl: string, feedUrl: string, parentId: string): void {
    this.sub.add(
      this.rss.getComments(commentsFeedUrl, feedUrl, parentId).subscribe({
        next: (comments) => {
          this.descendants.set(comments);
          this.rssCommentsUnavailable.set(comments.length === 0);
        },
        // A declared comment feed that will not load (CORS, 404) is common.
        error: () => this.rssCommentsUnavailable.set(true),
      }),
    );
  }
}

/** Bluesky replies arrive as a tree; the reading surfaces want them flat. */
function flattenReplies(nodes: BskyThreadNode[]): Status[] {
  const out: Status[] = [];
  for (const node of nodes) {
    if (node.post) {
      out.push(adaptPost(node.post));
    }
    if (node.replies?.length) {
      out.push(...flattenReplies(node.replies));
    }
  }
  return out;
}

/**
 * The feed-side id for an anonymously-read Mastodon post, as a public ref.
 *
 * `anonymous-mastodon:<host>:<rawId>` is what `adaptAnonymousStatus` puts on
 * `Status.id`; the canonical route form is the base64 blob that also carries
 * the scheme and the original URL. Links are minted in the route form (see
 * `reader-route-id.ts`), but a feed id can still reach this page — from a
 * library entry written before that fix, or from anything else that reasonably
 * assumed `Status.id` addressed the post.
 *
 * Resolving it costs an assumption: the scheme is not in the id, so `https` is
 * assumed. That is true of every Mastodon server worth reading and is the same
 * assumption the rest of the app makes, but it is why the encoded form is
 * canonical rather than this one.
 */
function parseAnonymousFeedId(id: string): AnonymousPublicRef | null {
  const prefix = 'anonymous-mastodon:';
  if (!id.startsWith(prefix)) {
    return null;
  }
  const body = id.slice(prefix.length);
  const separator = body.indexOf(':');
  if (separator <= 0) {
    return null;
  }
  const host = body.slice(0, separator);
  const statusId = body.slice(separator + 1);
  // `anonymous-mastodon:rss:<id>` is a different beast built by the same
  // provider for its RSS bridge; it names no host and cannot be fetched here.
  if (!statusId || host === 'rss' || !host.includes('.')) {
    return null;
  }
  return { server: `https://${host}`, id: statusId };
}
