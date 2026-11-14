import { InjectionToken } from '@angular/core';
import type { NativeSocial } from './native-social-types';

export const NATIVE_SOCIAL = new InjectionToken<NativeSocial | null>('native-social', {
  providedIn: 'root',
  factory: () => null,
});

/** Browser builds retain their existing OAuth flow and credential lifecycle. */
export const NATIVE_MASTODON_LOGIN = new InjectionToken<
  ((server: string, access: 'read' | 'full') => Promise<string>) | null
>('native-mastodon-login', {
  providedIn: 'root',
  factory: () => null,
});
export function forgetNativeAccount(handle: string | null): void {
  void handle;
}
