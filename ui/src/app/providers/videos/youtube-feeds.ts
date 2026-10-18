import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { corsProxyOrigin } from '../../build-flavor';
import { ClientPrefs } from '../../client-prefs';
import { FeatureFlags } from '../../feature-flags';
import { SupporterStatus } from '../account/supporter-status';
import { PLUS_TOKEN_HEADER, PlusTokenSource } from '../account/plus-token.interceptor';
import { externalFetch } from '../external-fetch';
import { RssCache } from '../rss/rss-cache';
import { QUIET_PROXY_LIMIT } from '../cors-proxy/proxy-limit-details';
import { ParsedFeed, parseFeed } from '../rss/rss-parser';
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

  private async request(
    target: string,
    search = false,
    body?: string,
    upstreamHeaders?: Headers,
  ): Promise<string> {
    if (!this.flags.enabled('connector-cors-proxy') || !this.flags.enabled('connector-rss')) {
      throw new Error('Video feeds are disabled in connection settings.');
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
        const channel = channelFromHtml(await this.request(url));
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
      const feed = parseFeed(await this.request(url));
      await this.cache.put(url, feed);
      return feed;
    } catch (error) {
      // Preserve the last successful read when YouTube returns intermittent 404/500.
      if (cached) return cached.feed;
      throw error;
    }
  }

  async search(query: string, type: 'video' | 'channel'): Promise<YoutubeSearchItem[]> {
    if (!query.trim() || query.length > 200) throw new Error('Search must be 1–200 characters.');
    if (!this.supporter.isSupporter()) throw new Error('YouTube search requires Mawkingbird Plus.');
    // This large optional library stays behind the action, away from root imports.
    const { Innertube, YTNodes } = await import('youtubei.js/web');
    const yt = await Innertube.create({
      retrieve_player: false,
      retrieve_innertube_config: false,
      generate_session_locally: true,
      fetch: async (input, init) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        );
        if (
          url.origin !== 'https://www.youtube.com' ||
          url.pathname !== '/youtubei/v1/search' ||
          typeof init?.body !== 'string'
        ) {
          throw new Error('Only anonymous YouTube search is supported.');
        }
        const json = await this.request(url.href, true, init.body, new Headers(init.headers));
        return new Response(json, { headers: { 'Content-Type': 'application/json' } });
      },
    });
    const page = await yt.search(query.trim(), { type });
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
