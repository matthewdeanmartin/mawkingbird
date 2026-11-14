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

import type { NativeConnectorTransport } from './connector-types';
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
