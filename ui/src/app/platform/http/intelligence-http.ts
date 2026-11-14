import { inject, Injectable } from '@angular/core';
import { PLATFORM_CONNECTORS, PLATFORM_INTELLIGENCE } from './platform-http';

/** Shared fetch adapter: browser defaults, bounded native provider commands. */
@Injectable({ providedIn: 'root' })
export class IntelligenceHttp {
  private native = inject(PLATFORM_INTELLIGENCE);
  private connectors = inject(PLATFORM_CONNECTORS);
  async models(url: string): Promise<Response> {
    if (!this.native) return fetch(url);
    const result = await this.native.request({ url, method: 'GET' });
    return new Response(result.body, { status: result.status, headers: result.headers });
  }
  async authenticated(url: string, init: RequestInit): Promise<Response> {
    if (!this.native) return fetch(url, init);
    if (!this.connectors) throw new Error('Native AI transport is unavailable.');
    const handle = new Headers(init.headers).get('Authorization')?.replace(/^Bearer /, '') ?? '';
    const result = await this.connectors.request({
      provider: 'openrouter',
      handle,
      url,
      method: init.method === 'POST' ? 'POST' : 'GET',
      ...(typeof init.body === 'string' ? { body: JSON.parse(init.body) as unknown } : {}),
    });
    return new Response(result.body, { status: result.status, headers: result.headers });
  }
}
