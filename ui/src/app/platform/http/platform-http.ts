import { InjectionToken } from '@angular/core';

export const PLATFORM_MISSKEY_POLL:
  | ((
      server: string,
      endpoint: string,
      handle: string | null,
      sinceId?: string,
    ) => Promise<unknown>)
  | null = null;
import type { HttpInterceptorFn } from '@angular/common/http';
import type { ConnectivityLevel } from './connector-types';

/** Browser transport stays unchanged; native replaces this module at build time. */
export const PLATFORM_HTTP_INTERCEPTORS: HttpInterceptorFn[] = [];

export function publicInstanceFetch(url: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, { signal });
}

export async function publicMediaProbe(url: string, signal: AbortSignal): Promise<void> {
  await fetch(url, { mode: 'no-cors', signal });
}

/** Native builds provide direct Rust feed reads; browsers retain their existing transport. */
export const PLATFORM_FEED_READ = new InjectionToken<((url: string) => Promise<string>) | null>(
  'PLATFORM_FEED_READ',
  { providedIn: 'root', factory: () => null },
);

/** Public HTML is data for the shared extractor, never a navigable native page. */
export const PLATFORM_ARTICLE_READ = new InjectionToken<
  | ((url: string) => Promise<{
      status: number;
      finalUrl: string;
      body: string;
    }>)
  | null
>('PLATFORM_ARTICLE_READ', { providedIn: 'root', factory: () => null });

/** YouTube web-client endpoints the native transport will carry; nothing else. */
export type YoutubeEndpoint = 'search' | 'browse' | 'player' | 'next';
export type NativeYoutubeTransport = (
  endpoint: YoutubeEndpoint,
  body: string,
  headers: [string, string][],
) => Promise<string>;

/**
 * Anonymous YouTube reads (search, channels, video details, comments) made
 * directly by Native. Browsers have none: they use the Plus proxy for search
 * and RSS for everything else. See spec/youtube-client.md.
 */
export const PLATFORM_YOUTUBE = new InjectionToken<NativeYoutubeTransport | null>(
  'PLATFORM_YOUTUBE',
  { providedIn: 'root', factory: () => null },
);

/**
 * Wikidata's answer for one YouTube channel ID (its Mastodon address), as
 * SPARQL JSON. Native asks through Rust (the webview may not fetch remote
 * hosts); browsers fetch Wikidata directly, which allows any origin.
 */
export const PLATFORM_WIKIDATA = new InjectionToken<
  ((channelId: string) => Promise<string>) | null
>('PLATFORM_WIKIDATA', { providedIn: 'root', factory: () => null });

/**
 * SponsorBlock segments for a 4-hex-digit hash prefix, as JSON. Native asks
 * through Rust; browsers fetch SponsorBlock directly (it allows any origin).
 */
export const PLATFORM_SPONSORBLOCK = new InjectionToken<
  ((prefix: string) => Promise<string>) | null
>('PLATFORM_SPONSORBLOCK', { providedIn: 'root', factory: () => null });

import type { NativeConnectorTransport } from './connector-types';
import type { NativeTwitterTransport } from './connector-types';
import type { NativeWebmentionTransport } from './connector-types';
export const PLATFORM_WEBMENTIONS = new InjectionToken<NativeWebmentionTransport | null>(
  'PLATFORM_WEBMENTIONS',
  { providedIn: 'root', factory: () => null },
);
export const PLATFORM_TWITTER = new InjectionToken<NativeTwitterTransport | null>(
  'PLATFORM_TWITTER',
  { providedIn: 'root', factory: () => null },
);
export const PLATFORM_CONNECTORS = new InjectionToken<NativeConnectorTransport | null>(
  'PLATFORM_CONNECTORS',
  { providedIn: 'root', factory: () => null },
);

/** Local publishing uses Rust and never a remote CORS relay. */
export const PLATFORM_LOCAL_PUBLISHING = new InjectionToken<boolean>('PLATFORM_LOCAL_PUBLISHING', {
  providedIn: 'root',
  factory: () => false,
});

import type { NativeHugoTransport } from './connector-types';
export const PLATFORM_HUGO = new InjectionToken<NativeHugoTransport | null>('PLATFORM_HUGO', {
  providedIn: 'root',
  factory: () => null,
});

import type { NativeIntelligenceTransport } from './connector-types';
export const PLATFORM_INTELLIGENCE = new InjectionToken<NativeIntelligenceTransport | null>(
  'PLATFORM_INTELLIGENCE',
  { providedIn: 'root', factory: () => null },
);

import type {
  NativeLocalAiTransport,
  NativeMediaTransport,
  NativeNetworkTransport,
  NativeOcrTransport,
  NativeUpdatesTransport,
} from './connector-types';
/** Native-only device features. Null on the web build, so their controls never render there. */
export const PLATFORM_NETWORK = new InjectionToken<NativeNetworkTransport | null>(
  'PLATFORM_NETWORK',
  { providedIn: 'root', factory: () => null },
);
export const PLATFORM_UPDATES = new InjectionToken<NativeUpdatesTransport | null>(
  'PLATFORM_UPDATES',
  { providedIn: 'root', factory: () => null },
);
export const PLATFORM_MEDIA = new InjectionToken<NativeMediaTransport | null>('PLATFORM_MEDIA', {
  providedIn: 'root',
  factory: () => null,
});
export const PLATFORM_OCR = new InjectionToken<NativeOcrTransport | null>('PLATFORM_OCR', {
  providedIn: 'root',
  factory: () => null,
});
export const PLATFORM_LOCAL_AI = new InjectionToken<NativeLocalAiTransport | null>(
  'PLATFORM_LOCAL_AI',
  { providedIn: 'root', factory: () => null },
);

/**
 * A tiny same-origin file the connection meter fetches, with caching off, to tell
 * "the connection is back" from "still nothing" while the app is otherwise quiet.
 * Relative to the base href so previews probe their own deployment.
 */
export const CONNECTIVITY_PROBE_PATH: string | null = 'probe.txt';

/**
 * Browsers have no trustworthy OS connectivity API, so the web build probes
 * {@link CONNECTIVITY_PROBE_PATH} instead. Native replaces this with a host command.
 */
export const CONNECTIVITY_CHECK: (() => Promise<ConnectivityLevel>) | null = null;
