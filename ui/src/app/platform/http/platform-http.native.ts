import { nativeIntelligenceInterceptor } from './native-intelligence-http';
import { nativePublishingInterceptor } from './native-publishing-http';
import { InjectionToken } from '@angular/core';
import { nativePublicInterceptor, nativePublicFetch } from './native-public-http';
import { nativeSocialInterceptor, invokeSocial } from './native-social-http';

export const PLATFORM_HTTP_INTERCEPTORS = [
  nativeIntelligenceInterceptor,
  nativePublishingInterceptor,
  nativeSocialInterceptor,
  nativePublicInterceptor,
];

/** Native live-note updates use bounded polling, with no renderer WebSocket/token. */
export const PLATFORM_MISSKEY_POLL:
  | ((
      server: string,
      endpoint: string,
      handle: string | null,
      sinceId?: string,
    ) => Promise<unknown>)
  | null = async (server, endpoint, handle, sinceId) => {
  const result = await invokeSocial<{ status: number; body: string }>('misskey_request', {
    server,
    endpoint,
    handle,
    body: { limit: 30, ...(sinceId ? { sinceId } : {}) },
  });
  if (result.status !== 200)
    throw new Error('Misskey timeline refresh failed. See Help > Open logs.');
  return JSON.parse(result.body);
};
export const publicInstanceFetch = nativePublicFetch;

/** Probe the same native image resource path used by rendered images. */
export function publicMediaProbe(url: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = (failed: boolean, error?: unknown) => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', aborted);
      image.removeAttribute('src');
      if (failed) reject(error);
      else resolve();
    };
    const aborted = () => finish(true, signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    image.onload = () => finish(false);
    image.onerror = () => finish(true, new Error('Native image probe failed.'));
    const base =
      location.protocol === 'http:'
        ? 'http://native-image.localhost/'
        : 'native-image://localhost/';
    image.src = `${base}?url=${encodeURIComponent(url)}`;
  });
}

/** No proxy settings or renderer credentials cross this public-feed boundary. */
export const PLATFORM_FEED_READ = new InjectionToken<((url: string) => Promise<string>) | null>(
  'PLATFORM_FEED_READ',
  { providedIn: 'root', factory: () => nativeFeedRead },
);

async function nativeFeedRead(url: string): Promise<string> {
  const bridge = (
    window as unknown as {
      __TAURI__?: { core: { invoke<T>(command: string, args: object): Promise<T> } };
    }
  ).__TAURI__;
  if (!bridge) throw new Error('Native feed reader is unavailable.');
  try {
    return await bridge.core.invoke<string>('public_feed_get', { url });
  } catch (error) {
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Native feed request failed; see native logs.';
    throw new Error(message, { cause: error });
  }
}

/** Public HTML is data for the shared extractor, never a navigable native page. */
export const PLATFORM_ARTICLE_READ = new InjectionToken<
  | ((url: string) => Promise<{
      status: number;
      finalUrl: string;
      body: string;
    }>)
  | null
>('PLATFORM_ARTICLE_READ', { providedIn: 'root', factory: () => nativeArticleRead });

async function nativeArticleRead(
  url: string,
): Promise<{ status: number; finalUrl: string; body: string }> {
  const bridge = (
    window as unknown as {
      __TAURI__?: { core: { invoke<T>(command: string, args: object): Promise<T> } };
    }
  ).__TAURI__;
  if (!bridge) throw new Error('Native article reader is unavailable.');
  return bridge.core.invoke('public_article_get', { url });
}

/** YouTube web-client endpoints the native transport will carry; nothing else. */
export type YoutubeEndpoint = 'search' | 'browse' | 'player' | 'next';
export type NativeYoutubeTransport = (
  endpoint: YoutubeEndpoint,
  body: string,
  headers: [string, string][],
) => Promise<string>;

/** Rust allow-lists the endpoint and headers and strips stream URLs from player responses. */
export const PLATFORM_YOUTUBE = new InjectionToken<NativeYoutubeTransport | null>(
  'PLATFORM_YOUTUBE',
  { providedIn: 'root', factory: () => nativeYoutube },
);

async function nativeYoutube(
  endpoint: YoutubeEndpoint,
  body: string,
  headers: [string, string][],
): Promise<string> {
  const bridge = (
    window as unknown as {
      __TAURI__?: { core: { invoke<T>(command: string, args: object): Promise<T> } };
    }
  ).__TAURI__;
  if (!bridge) throw new Error('Native YouTube reader is unavailable.');
  try {
    return await bridge.core.invoke<string>('youtube_innertube', { endpoint, body, headers });
  } catch (error) {
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'YouTube request failed; see native logs.';
    throw new Error(message, { cause: error });
  }
}

import type { NativeConnectorTransport } from './connector-types';
import type { NativeTwitterTransport } from './connector-types';
import type { NativeWebmentionTransport } from './connector-types';
export const PLATFORM_WEBMENTIONS = new InjectionToken<NativeWebmentionTransport | null>(
  'PLATFORM_WEBMENTIONS',
  {
    providedIn: 'root',
    factory: () => ({
      discover: (url) => connectorInvoke('webmention_discover', { url }),
      send: (endpoint, source, targetUrl) =>
        connectorInvoke('webmention_send', { endpoint, source, targetUrl }),
    }),
  },
);
export const PLATFORM_TWITTER = new InjectionToken<NativeTwitterTransport | null>(
  'PLATFORM_TWITTER',
  {
    providedIn: 'root',
    factory: () => ({
      connect: (token, previous) =>
        connectorInvoke('twitter_connect', { token, previous: previous ?? null }),
      request: (handle, url) => connectorInvoke('twitter_request', { handle, url }),
      forget: (handle) => connectorInvoke('twitter_forget', { handle }),
    }),
  },
);
export const PLATFORM_CONNECTORS = new InjectionToken<NativeConnectorTransport | null>(
  'PLATFORM_CONNECTORS',
  {
    providedIn: 'root',
    factory: () => ({
      connect: (provider, token, handle, workspace, domain) =>
        connectorInvoke('connector_connect', {
          provider,
          token,
          handle: handle ?? null,
          workspace: workspace ?? null,
          domain: domain ?? null,
        }),
      forget: (handle) => connectorInvoke('connector_forget', { handle }),
      request: (input) =>
        connectorInvoke('connector_request', {
          ...input,
          body: input.body ?? null,
          workspace: input.workspace ?? null,
        }),
    }),
  },
);
async function connectorInvoke<T>(command: string, args: object): Promise<T> {
  try {
    return await invokeSocial<T>(command, args);
  } catch (error) {
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Connector request failed. See Help > Open logs.';
    throw new Error(message, { cause: error });
  }
}

/** Local publishing uses Rust and never a remote CORS relay. */
export const PLATFORM_LOCAL_PUBLISHING = new InjectionToken<boolean>('PLATFORM_LOCAL_PUBLISHING', {
  providedIn: 'root',
  factory: () => true,
});

import type { NativeHugoTransport } from './connector-types';
export const PLATFORM_HUGO = new InjectionToken<NativeHugoTransport | null>('PLATFORM_HUGO', {
  providedIn: 'root',
  factory: () => ({
    connect: (token, repo, handle) =>
      connectorInvoke('hugo_connect', { token, repo, handle: handle ?? null }),
    request: (input) => connectorInvoke('hugo_request', { ...input, body: input.body ?? null }),
    forget: (handle) => connectorInvoke('hugo_forget', { handle }),
  }),
});

import type { NativeIntelligenceTransport } from './connector-types';
export const PLATFORM_INTELLIGENCE = new InjectionToken<NativeIntelligenceTransport | null>(
  'PLATFORM_INTELLIGENCE',
  {
    providedIn: 'root',
    factory: () => ({
      login: () => connectorInvoke('openrouter_login', {}),
      request: (input) =>
        connectorInvoke('intelligence_public_request', { ...input, body: input.body ?? null }),
    }),
  },
);

import type {
  NativeLocalAiTransport,
  NativeMediaTransport,
  NativeNetworkTransport,
  NativeOcrTransport,
  NativeUpdatesTransport,
} from './connector-types';
/** Native-only device features, each a typed Rust command (parity items 1, 3, 4, 5, 6, 10). */
export const PLATFORM_NETWORK = new InjectionToken<NativeNetworkTransport | null>(
  'PLATFORM_NETWORK',
  {
    providedIn: 'root',
    factory: () => ({
      status: () => connectorInvoke('network_proxy_status', {}),
      refresh: () => connectorInvoke('network_proxy_refresh', {}),
      set: (input) =>
        connectorInvoke('network_proxy_set', {
          mode: input.mode,
          host: input.host ?? null,
          port: input.port ?? null,
          username: input.username ?? null,
          password: input.password ?? null,
        }),
    }),
  },
);
export const PLATFORM_UPDATES = new InjectionToken<NativeUpdatesTransport | null>(
  'PLATFORM_UPDATES',
  { providedIn: 'root', factory: () => ({ check: () => connectorInvoke('check_for_update', {}) }) },
);
export const PLATFORM_MEDIA = new InjectionToken<NativeMediaTransport | null>('PLATFORM_MEDIA', {
  providedIn: 'root',
  factory: () => ({
    saveImage: (url, fileName, alt) =>
      connectorInvoke('media_save_image', { url, fileName, alt: alt ?? null }),
    copyImage: (url) => connectorInvoke('media_copy_image', { url }),
  }),
});
export const PLATFORM_OCR = new InjectionToken<NativeOcrTransport | null>('PLATFORM_OCR', {
  providedIn: 'root',
  factory: () => ({
    available: () => connectorInvoke('ocr_available', {}),
    read: (image) => connectorInvoke('ocr_read_image', { image }),
  }),
});
export const PLATFORM_LOCAL_AI = new InjectionToken<NativeLocalAiTransport | null>(
  'PLATFORM_LOCAL_AI',
  {
    providedIn: 'root',
    factory: () => ({
      status: () => connectorInvoke('local_ai_status', {}),
      setEndpoint: (endpoint) =>
        connectorInvoke('local_ai_set_endpoint', { endpointUrl: endpoint }),
      request: (input) =>
        connectorInvoke('local_ai_request', {
          path: input.path,
          method: input.method,
          body: input.body ?? null,
        }),
    }),
  },
);
