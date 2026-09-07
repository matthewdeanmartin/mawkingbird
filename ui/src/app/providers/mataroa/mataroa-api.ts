import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { CorsProxy, CorsProxyRefusal } from '../cors-proxy/cors-proxy';
import { externalFetch } from '../external-fetch';
import { ProxyConsent } from '../proxy-consent-store';
import { MataroaSettings } from './mataroa-settings';

const POSTS_URL = 'https://mataroa.blog/api/posts/';

export interface MataroaPost {
  title: string;
  slug: string;
  body: string;
  published_at: string | null;
  url: string;
}

export interface MataroaPostsResponse {
  ok: boolean;
  post_list: MataroaPost[];
}

export interface MataroaCreatedPost {
  ok: boolean;
  slug: string;
  url: string;
}

/** Authenticated Mataroa writes, always through the explicitly-consented proxy. */
@Injectable({ providedIn: 'root' })
export class MataroaApi {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(MataroaSettings);
  private readonly proxy = inject(CorsProxy);
  private readonly consent = inject(ProxyConsent);

  listPosts(): Observable<MataroaPostsResponse> {
    return this.request<MataroaPostsResponse>('GET', POSTS_URL);
  }

  createPost(title: string, body: string): Observable<MataroaCreatedPost> {
    return this.request<MataroaCreatedPost>('POST', POSTS_URL, {
      title,
      body,
      published_at: new Date().toISOString().slice(0, 10),
    });
  }

  private request<T>(method: 'GET' | 'POST', url: string, body?: unknown): Observable<T> {
    const config = this.settings.resolve();
    if (!config) {
      return throwError(() => new Error('Connect a Mataroa blog in Settings first.'));
    }
    const proxy = this.proxy.entry();
    if (!proxy || !this.proxy.available()) {
      return throwError(() => new Error('Set up a CORS proxy before using Mataroa.'));
    }
    if (!proxy.forwardsCustomHeaders) {
      return throwError(() => new Error('Choose a CORS proxy that forwards custom headers.'));
    }
    if (!this.consent.granted('mataroa', proxy.id)) {
      return throwError(
        () => new Error('Allow Mataroa requests through this CORS proxy in Settings first.'),
      );
    }

    let proxied: { url: string; headers: HttpHeaders };
    try {
      proxied = this.proxy.proxyCredentialedRequest(url, true, 'mataroa');
    } catch (error: unknown) {
      return throwError(() =>
        error instanceof CorsProxyRefusal
          ? error
          : new Error('This Mataroa request cannot be proxied.'),
      );
    }

    let headers = proxied.headers.set('Authorization', `Bearer ${config.apiKey}`);
    headers = headers.set('Content-Type', 'application/json');
    return this.http.request<T>(method, proxied.url, {
      headers,
      context: externalFetch(),
      ...(body === undefined ? {} : { body }),
    });
  }
}
