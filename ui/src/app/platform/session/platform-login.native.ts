import { InjectionToken } from '@angular/core';
import type { NativeSocial } from './native-social-types';

export const NATIVE_SOCIAL = new InjectionToken<NativeSocial | null>('native-social', {
  providedIn: 'root',
  factory: () => ({
    blueskyLogin: (identifier) => invoke('bluesky_login', { identifier }),
    misskeyLogin: (server) => invoke('misskey_login', { server }),
    blueskyFetch: async (handle, url, init) => {
      const headers = new Headers(init?.headers);
      if (
        [...headers.keys()].some(
          (key) => !['content-type', 'atproto-accept-labelers'].includes(key),
        )
      ) {
        throw new Error(
          'This Bluesky service is not supported by native transport yet. See Help > Open logs.',
        );
      }
      const result = await invoke<{
        status: number;
        body: string;
        headers: Record<string, string>;
      }>('bluesky_request', {
        handle,
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        labelers: (headers.get('atproto-accept-labelers') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      return new Response(result.status === 204 ? null : result.body, {
        status: result.status,
        headers: result.headers,
      });
    },
  }),
});

function invoke<T>(command: string, args: object): Promise<T> {
  const bridge = (
    window as unknown as {
      __TAURI__: { core: { invoke<T>(command: string, args: object): Promise<T> } };
    }
  ).__TAURI__;
  return bridge.core.invoke<T>(command, args);
}

/** Returns an opaque OS-store reference, never the provider's bearer token. */
export const NATIVE_MASTODON_LOGIN = new InjectionToken<
  ((server: string, access: 'read' | 'full') => Promise<string>) | null
>('native-mastodon-login', {
  providedIn: 'root',
  factory: () => (server: string, access: 'read' | 'full') =>
    invoke<string>('mastodon_login', { server, access }),
});

export function forgetNativeAccount(handle: string | null): void {
  if (handle?.startsWith('native-bluesky:') || handle?.startsWith('native-misskey:')) {
    void invoke('forget_social_account', { handle }).catch(() => undefined);
    return;
  }
  if (handle?.startsWith('native-mastodon:')) {
    // The backend records failures persistently; keep account switching synchronous.
    void invoke('forget_mastodon_account', { handle }).catch(() => undefined);
  }
}
