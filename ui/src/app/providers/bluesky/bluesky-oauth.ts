import { Injectable } from '@angular/core';
import type { BrowserOAuthClient, OAuthSession } from '@atproto/oauth-client-browser';
import {
  blueskyOAuthClientMetadata,
  blueskyOAuthRedirectUri,
  isBlueskyOAuthLoopback,
} from './bluesky-oauth-config';

const HANDLE_RESOLVER = 'https://bsky.social';

export interface BlueskyOAuthProfile {
  service: string;
  handle: string;
  did: string;
  displayName?: string;
  avatar?: string;
}

export interface BlueskyOAuthResult {
  profile: BlueskyOAuthProfile;
  state: string | null;
}

interface ProfileResponse {
  handle: string;
  displayName?: string;
  avatar?: string;
}

/**
 * Browser-only ATProto OAuth owner.
 *
 * The official SDK keeps PKCE state, DPoP keys, access tokens, and refresh
 * tokens in IndexedDB. Mawkingbird stores only the DID/profile marker needed
 * to list alts; no OAuth bearer token is copied into localStorage or the vault.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyOAuth {
  private clientValue: Promise<BrowserOAuthClient> | null = null;

  /** Begin an authorization redirect for a first-class Bluesky identity. */
  async signIn(identifier: string, adding: boolean): Promise<never> {
    if (location.hostname === 'localhost') {
      // OAuth state lives in origin-bound IndexedDB. Move before creating it so
      // the eventual 127.0.0.1 callback can read the same PKCE/DPoP material.
      const loopback = new URL(location.href);
      loopback.hostname = '127.0.0.1';
      location.replace(loopback.href);
      return new Promise<never>(() => undefined);
    }
    return (await this.client()).signInRedirect(identifier, {
      state: adding ? 'identity:add' : 'identity:login',
      redirect_uri: blueskyOAuthRedirectUri(),
    });
  }

  /** Exchange the callback, then fetch enough profile data to populate the picker. */
  async callback(): Promise<BlueskyOAuthResult> {
    const result = await (await this.client()).initCallback(undefined, blueskyOAuthRedirectUri());
    const profile = await this.profile(result.session);
    return { profile, state: result.state };
  }

  /** Restore one DID from the SDK's multi-session IndexedDB store. */
  async restore(did: string): Promise<OAuthSession> {
    return (await this.client()).restore(did);
  }

  /** Make a DPoP-bound request; token refresh is handled inside the SDK. */
  async fetch(did: string, pathname: string, init?: RequestInit): Promise<Response> {
    const session = await this.restore(did);
    return session.fetchHandler(pathname, init);
  }

  /** Revoke and remove one SDK-owned session. */
  async revoke(did: string): Promise<void> {
    await (await this.client()).revoke(did);
  }

  private client(): Promise<BrowserOAuthClient> {
    if (!this.clientValue) {
      this.clientValue = import('@atproto/oauth-client-browser').then(
        ({ BrowserOAuthClient, buildLoopbackClientId }) => {
          if (isBlueskyOAuthLoopback()) {
            const callback = new URL(blueskyOAuthRedirectUri());
            return BrowserOAuthClient.load({
              handleResolver: HANDLE_RESOLVER,
              clientId: buildLoopbackClientId({
                hostname: location.hostname,
                port: location.port,
                pathname: callback.pathname,
              }),
            });
          }
          return new BrowserOAuthClient({
            handleResolver: HANDLE_RESOLVER,
            clientMetadata: blueskyOAuthClientMetadata(),
          });
        },
      );
    }
    return this.clientValue;
  }

  private async profile(session: OAuthSession): Promise<BlueskyOAuthProfile> {
    const response = await session.fetchHandler(
      `/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(session.did)}`,
    );
    if (!response.ok) {
      throw new Error(`Bluesky profile request failed (${response.status}).`);
    }
    const profile = (await response.json()) as ProfileResponse;
    const token = await session.getTokenInfo(false);
    return {
      service: token.aud.replace(/\/$/, ''),
      handle: profile.handle,
      did: session.did,
      ...(profile.displayName ? { displayName: profile.displayName } : {}),
      ...(profile.avatar ? { avatar: profile.avatar } : {}),
    };
  }
}
