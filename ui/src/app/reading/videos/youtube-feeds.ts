import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { corsProxyOrigin } from '../../platform/build/build-flavor';
import { canUseHostedProxy } from '../../accounts/mawkingbird/mawkingbird-access';
import {
  PLATFORM_ARTICLE_READ,
  PLATFORM_FEED_READ,
  PLATFORM_YOUTUBE,
  YoutubeEndpoint,
} from '../../platform/http/platform-http';
import {
  chaptersFromDescription,
  YoutubeComment,
  YoutubeCommentPage,
  YoutubeVideoDetails,
} from './youtube-details';

type CommentsThread = Awaited<ReturnType<import('youtubei.js/web').Innertube['getComments']>>;

/** Plain text only: comment HTML/runs are flattened, never rendered. */
function commentPage(page: CommentsThread): YoutubeCommentPage {
  const comments = page.contents.flatMap((thread): YoutubeComment[] => {
    const comment = thread.comment;
    if (!comment) return [];
    return [
      {
        id: comment.comment_id,
        author: comment.author?.name ?? '',
        published: comment.published_time ?? '',
        likes: comment.like_count ?? '',
        text: comment.content?.toString() ?? '',
        replies: comment.reply_count ?? '',
        byCreator: !!comment.author_is_channel_owner,
      },
    ];
  });
  return {
    comments,
    more: page.has_continuation ? async () => commentPage(await page.getContinuation()) : null,
  };
}

/** The web-client identification headers youtubei.js sends; Rust refuses any others. */
const YOUTUBE_CLIENT_HEADERS = [
  'x-youtube-client-name',
  'x-youtube-client-version',
  'x-goog-visitor-id',
];
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { FeatureFlags } from '../../platform/build/feature-flags';
import { SupporterStatus } from '../../accounts/mawkingbird/supporter-status';
import {
  PLUS_TOKEN_HEADER,
  PlusTokenSource,
} from '../../accounts/mawkingbird/plus-token.interceptor';
import { externalFetch } from '../../platform/http/external-fetch';
import { RssCache } from '../rss/rss-cache';
import { QUIET_PROXY_LIMIT } from '../../connections/cors-proxy/proxy-limit-details';
import { ParsedFeed, parseFeed } from '../../../lib/rss/rss-parser';
import { channelFromHtml, channelInput } from './youtube-channel';
import { CHANNEL_ID, videoFeedUrl } from './video-subscriptions';

export interface YoutubeSearchItem {
  id: string;
  title: string;
  channelId: string | null;
  channelTitle: string;
  videoId?: string;
}

@Injectable({ providedIn: 'root' })
export class YoutubeFeeds {
  private http = inject(HttpClient);
  private cache = inject(RssCache);
  private prefs = inject(ClientPrefs);
  private flags = inject(FeatureFlags);
  private supporter = inject(SupporterStatus);
  private tokens = inject(PlusTokenSource);
  /** Native reads YouTube directly; it needs no proxy and calls no Mawkingbird service. */
  private nativeFeedRead = inject(PLATFORM_FEED_READ);
  private nativePageRead = inject(PLATFORM_ARTICLE_READ);
  /** Native's direct, allow-listed YouTube web-client reads; null in browsers. */
  private nativeYoutube = inject(PLATFORM_YOUTUBE);

  /**
   * Whether the web build may use the Mawkingbird proxy from this address. A
   * copy hosted elsewhere must not call it (ops/SELF_HOSTING.md): the Worker
   * refuses other origins anyway, so asking would only cost a request.
   */
  private hostedProxy(): boolean {
    return canUseHostedProxy();
  }

  /** A channel's RSS: directly on Native, through the Mawkingbird proxy on the web. */
  private async readFeed(url: string): Promise<string> {
    if (this.nativeFeedRead) {
      if (!this.flags.enabled('connector-rss')) {
        throw new Error('Video feeds are disabled in connection settings.');
      }
      return this.nativeFeedRead(url);
    }
    return this.request(url);
  }

  /** A channel page, for resolving @handles: directly on Native, else proxied. */
  private async readPage(url: string): Promise<string> {
    if (this.nativePageRead) {
      if (!this.flags.enabled('connector-rss')) {
        throw new Error('Video feeds are disabled in connection settings.');
      }
      const page = await this.nativePageRead(url);
      if (page.status === 404) throw new HttpErrorResponse({ status: 404, url });
      if (page.status >= 400) throw new Error(`YouTube answered ${page.status}.`);
      return page.body;
    }
    return this.request(url);
  }

  private async request(
    target: string,
    search = false,
    body?: string,
    upstreamHeaders?: Headers,
  ): Promise<string> {
    if (!this.flags.enabled('connector-cors-proxy') || !this.flags.enabled('connector-rss')) {
      throw new Error('Video feeds are disabled in connection settings.');
    }
    if (!this.hostedProxy()) {
      throw new Error(
        'Video feeds use the Mawkingbird proxy, which is only available on mawkingbird.com.',
      );
    }
    const route = search ? 'youtube-search' : 'youtube';
    let headers = new HttpHeaders();
    if (search) {
      if (!this.supporter.isSupporter())
        throw new Error('YouTube search requires Mawkingbird Plus.');
      const token = await this.tokens.token();
      if (!token || !this.supporter.isSupporter())
        throw new Error('Could not confirm Plus access.');
      headers = headers.set(PLUS_TOKEN_HEADER, token);
      for (const name of [
        'content-type',
        'x-youtube-client-name',
        'x-youtube-client-version',
        'x-goog-visitor-id',
      ]) {
        const value = upstreamHeaders?.get(name);
        if (value) headers = headers.set(name, value);
      }
    }
    const query = new URLSearchParams({ route, url: target });
    return firstValueFrom(
      this.http
        .request(search ? 'POST' : 'GET', `${corsProxyOrigin()}/?${query}`, {
          headers,
          body,
          responseType: 'text',
          context: externalFetch().set(QUIET_PROXY_LIMIT, !search),
          withCredentials: false,
        })
        .pipe(timeout(25_000)),
    );
  }

  async resolve(input: string): Promise<{ id: string; title: string }> {
    const parsed = channelInput(input);
    if (!parsed) throw new Error('Paste a YouTube channel link, @handle, channel ID or RSS URL.');
    if ('id' in parsed) {
      // Resolve the display name, but allow subscribing through an upstream outage.
      try {
        const feed = await this.feed(parsed.id);
        return { id: parsed.id, title: feed.title || parsed.id };
      } catch {
        return { id: parsed.id, title: parsed.id };
      }
    }
    const candidates = [parsed.url];
    const alias = /^https:\/\/www\.youtube\.com\/(?:c|user)\/([A-Za-z0-9_-]+)$/.exec(
      parsed.url,
    )?.[1];
    if (alias) candidates.push(`https://www.youtube.com/@${alias}`);
    let failure: unknown;
    for (const url of candidates) {
      try {
        const channel = channelFromHtml(await this.readPage(url));
        if (channel) return channel;
        failure = new Error('This page did not provide a YouTube channel.');
      } catch (error) {
        failure = error;
        // An alternate alias cannot fix connection settings, throttling or an outage.
        if (!(error instanceof HttpErrorResponse) || error.status !== 404) throw error;
      }
    }
    throw failure;
  }

  async feed(id: string, refresh = false): Promise<ParsedFeed> {
    if (!CHANNEL_ID.test(id)) throw new Error('Invalid YouTube channel ID');
    const url = videoFeedUrl(id);
    const cached = await this.cache.get(
      url,
      refresh ? 0 : this.prefs.rssCacheTtlHours() * 3_600_000,
    );
    if (cached && !cached.stale) return cached.feed;
    try {
      const feed = parseFeed(await this.readFeed(url));
      await this.cache.put(url, feed);
      return feed;
    } catch (error) {
      // Preserve the last successful read when YouTube returns intermittent 404/500.
      if (cached) return cached.feed;
      throw error;
    }
  }

  /**
   * Whether YouTube search is available here: always on Native (it asks
   * YouTube directly, with no Mawkingbird service), else with Plus through the
   * proxy. Native must not be gated on Plus (spec/youtube-client.md, S1).
   */
  canSearch(): boolean {
    return !!this.nativeYoutube || this.supporter.isSupporter();
  }

  /** Video details (duration, chapters, family-safe flag) need Native's direct reads. */
  canReadDetails(): boolean {
    return !!this.nativeYoutube;
  }

  private innertube: Promise<import('youtubei.js/web').Innertube> | null = null;

  /**
   * One anonymous web-client session. Native carries search, browse, player and
   * next (Rust allow-lists them again); the web proxy carries search only.
   */
  private session(): Promise<import('youtubei.js/web').Innertube> {
    this.innertube ??= (async () => {
      // This large optional library stays behind the action, away from root imports.
      const { Innertube } = await import('youtubei.js/web');
      return Innertube.create({
        retrieve_player: false,
        retrieve_innertube_config: false,
        generate_session_locally: true,
        fetch: (input, init) => this.route(input, init),
      });
    })().catch((error: unknown) => {
      this.innertube = null;
      throw error;
    });
    return this.innertube;
  }

  private async route(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const endpoint = /^\/youtubei\/v1\/(search|browse|player|next)$/.exec(url.pathname)?.[1] as
      YoutubeEndpoint | undefined;
    if (url.origin !== 'https://www.youtube.com' || !endpoint || typeof init?.body !== 'string') {
      throw new Error('Only anonymous YouTube reads are supported.');
    }
    const headers = new Headers(init.headers);
    let json: string;
    if (this.nativeYoutube) {
      if (!this.flags.enabled('connector-rss')) {
        throw new Error('Video feeds are disabled in connection settings.');
      }
      json = await this.nativeYoutube(
        endpoint,
        init.body,
        YOUTUBE_CLIENT_HEADERS.flatMap((name) => {
          const value = headers.get(name);
          return value ? [[name, value] as [string, string]] : [];
        }),
      );
    } else if (endpoint === 'search') {
      json = await this.request(url.href, true, init.body, headers);
    } else {
      throw new Error('This YouTube feature needs the Mawkingbird app.');
    }
    return new Response(json, { headers: { 'Content-Type': 'application/json' } });
  }

  async details(videoId: string): Promise<YoutubeVideoDetails> {
    if (!/^[\w-]{11}$/.test(videoId)) throw new Error('Invalid YouTube video ID');
    if (!this.canReadDetails()) throw new Error('This YouTube feature needs the Mawkingbird app.');
    const info = (await (await this.session()).getBasicInfo(videoId)).basic_info;
    const description = info.short_description ?? '';
    return {
      id: videoId,
      title: info.title ?? '',
      channelId: CHANNEL_ID.test(info.channel_id ?? '') ? info.channel_id! : null,
      channelTitle: info.author ?? info.channel?.name ?? '',
      durationSeconds: info.duration || null,
      description,
      familySafe: info.is_family_safe ?? null,
      live: !!info.is_live,
      chapters: chaptersFromDescription(description),
    };
  }

  /**
   * Top YouTube comments, read-only and anonymous (the `next` endpoint the
   * watch page itself uses: no key, no OAuth). Native only. Each page offers
   * the next one; nothing is fetched until the reader asks.
   */
  async comments(videoId: string): Promise<YoutubeCommentPage> {
    if (!/^[\w-]{11}$/.test(videoId)) throw new Error('Invalid YouTube video ID');
    if (!this.canReadDetails()) throw new Error('This YouTube feature needs the Mawkingbird app.');
    return commentPage(await (await this.session()).getComments(videoId, 'TOP_COMMENTS'));
  }

  async search(query: string, type: 'video' | 'channel'): Promise<YoutubeSearchItem[]> {
    if (!query.trim() || query.length > 200) throw new Error('Search must be 1–200 characters.');
    if (!this.canSearch()) throw new Error('YouTube search requires Mawkingbird Plus.');
    const { YTNodes } = await import('youtubei.js/web');
    const page = await (await this.session()).search(query.trim(), { type });
    return page.results.flatMap((node): YoutubeSearchItem[] => {
      if (type === 'channel' && node.is(YTNodes.Channel) && CHANNEL_ID.test(node.id)) {
        return [
          {
            id: node.id,
            title: node.author.name,
            channelId: node.id,
            channelTitle: node.author.name,
          },
        ];
      }
      if (type === 'video' && node.is(YTNodes.Video) && /^[\w-]{11}$/.test(node.video_id)) {
        return [
          {
            id: node.video_id,
            videoId: node.video_id,
            title: node.title.toString(),
            channelId: CHANNEL_ID.test(node.author.id) ? node.author.id : null,
            channelTitle: node.author.name,
          },
        ];
      }
      return [];
    });
  }
}
