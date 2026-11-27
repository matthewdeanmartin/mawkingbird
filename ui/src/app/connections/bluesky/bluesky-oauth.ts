import { inject, Injectable } from '@angular/core';
import { PageDiagnostics } from '../../platform/diagnostics/page-diagnostics';
import { BlueskySignInRequiredError } from './bluesky-auth-error';
import type { OAuthClient, OAuthSession } from '@atproto/oauth-client-browser';
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

/**
 * What the redirect is for, carried through the authorization server and back.
 * `connector:link` attaches Bluesky to the active Mastodon or Anonymous account
 * instead of signing in as it.
 */
export type BlueskyOAuthIntent =
  'identity:login' | 'identity:add' | 'identity:signup' | 'identity:signup-add' | 'connector:link';

/** The intents that open the server's sign-up form first (`prompt=create`). */
export function isSignupIntent(intent: string | null): boolean {
  return intent === 'identity:signup' || intent === 'identity:signup-add';
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
  private clientValue: Promise<OAuthClient> | null = null;
  private readonly diagnostics = inject(PageDiagnostics);

  /**
   * The SDK's own account of a session ending or being refreshed, for the
   * diagnostic timeline. Sign-outs used to leave no trace there, so "why does
   * Bluesky keep signing me out?" had no answer. Storage is isolated by OAuth client ID
   * and keyed by DID within that client; `client` says which path's client saw the event.
   */
  private readonly sessionHooks = {
    onSessionDeleted: (sub: string, cause: unknown) => {
      this.diagnostics.warn('Bluesky OAuth', 'session:deleted', {
        account: shortDid(sub),
        client: clientPath(),
        cause: describeCause(cause),
      });
    },
    onSessionUpdated: (sub: string) => {
      this.diagnostics.info('Bluesky OAuth', 'session:refreshed', {
        account: shortDid(sub),
        client: clientPath(),
      });
    },
  };

  /** Begin an authorization redirect, as an identity or as a connector. */
  async signIn(identifier: string, intent: BlueskyOAuthIntent): Promise<never> {
    if (location.hostname === 'localhost') {
      // OAuth state lives in origin-bound IndexedDB. Move before creating it so
      // the eventual 127.0.0.1 callback can read the same PKCE/DPoP material.
      const loopback = new URL(location.href);
      loopback.hostname = '127.0.0.1';
      location.replace(loopback.href);
      return new Promise<never>(() => undefined);
    }
    const client = await this.client();
    const url = await client.authorize(identifier, {
      state: intent,
      redirect_uri: blueskyOAuthRedirectUri(),
      // The authorization server shows its own sign-up form, then finishes
      // authorizing the new account and redirects back here signed in.
      // bsky.social lists `create` in prompt_values_supported (checked 2026-11-20).
      ...(isSignupIntent(intent) && { prompt: 'create' as const }),
    });
    location.assign(url.href);
    // Match the browser SDK's back/forward-cache cancellation: returning to the
    // login page must release its busy state and discard the abandoned PKCE flow.
    return new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        const error = new Error('User navigated back');
        void client.abortRequest(url).then(
          () => reject(error),
          (cause: unknown) => reject(new AggregateError([error, cause])),
        );
      }, 5_000);
    });
  }

  /** Exchange the callback, then fetch enough profile data to populate the picker. */
  async callback(): Promise<BlueskyOAuthResult> {
    const params = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    const result = await (
      await this.client()
    ).callback(params, { redirect_uri: blueskyOAuthRedirectUri() });
    const profile = await this.profile(result.session);
    return { profile, state: result.state };
  }

  /** Restore one DID from the SDK's multi-session IndexedDB store. */
  async restore(did: string): Promise<OAuthSession> {
    return (await this.client()).restore(did);
  }

  /** Make a DPoP-bound request; token refresh is handled inside the SDK. */
  async fetch(did: string, pathname: string, init?: RequestInit): Promise<Response> {
    try {
      const session = await this.restore(did);
      return await session.fetchHandler(pathname, init);
    } catch (error: unknown) {
      const { TokenRefreshError, TokenRevokedError, TokenInvalidError } =
        await import('@atproto/oauth-client-browser');
      if (
        error instanceof TokenRefreshError ||
        error instanceof TokenRevokedError ||
        error instanceof TokenInvalidError ||
        // Errors sent between tabs can lose their SDK subclass during cloning.
        (error instanceof Error && error.message === 'The session was deleted by another process')
      ) {
        this.diagnostics.warn('Bluesky OAuth', 'sign-in-required', {
          account: shortDid(did),
          client: clientPath(),
          path: pathname.split('?')[0],
          cause: describeCause(error),
        });
        throw new BlueskySignInRequiredError(error);
      }
      throw error;
    }
  }

  /** Revoke and remove one SDK-owned session. */
  async revoke(did: string): Promise<void> {
    this.diagnostics.info('Bluesky OAuth', 'revoke:requested', {
      account: shortDid(did),
      client: clientPath(),
    });
    await (await this.client()).revoke(did);
  }

  private client(): Promise<OAuthClient> {
    if (!this.clientValue) {
      this.clientValue = Promise.all([
        import('@atproto/oauth-client-browser'),
        import('./bluesky-oauth-client'),
      ]).then(
        ([
          { buildLoopbackClientId, atprotoLoopbackClientMetadata },
          { createBlueskyOAuthClient },
        ]) => {
          const callback = new URL(blueskyOAuthRedirectUri());
          const clientMetadata = isBlueskyOAuthLoopback()
            ? atprotoLoopbackClientMetadata(
                buildLoopbackClientId({
                  hostname: location.hostname,
                  port: location.port,
                  pathname: callback.pathname,
                }),
              )
            : blueskyOAuthClientMetadata();
          return createBlueskyOAuthClient({
            ...this.sessionHooks,
            handleResolver: HANDLE_RESOLVER,
            clientMetadata,
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

/** The tail of a DID: enough to tell accounts apart in a log, nothing more. */
function shortDid(did: string): string {
  return did.length > 12 ? `…${did.slice(-8)}` : did;
}

/** Which deployment path's OAuth client this is: "/", "/canary/" or "/test/". */
function clientPath(): string {
  try {
    return new URL(document.baseURI).pathname;
  } catch {
    return '?';
  }
}

/** A deletion or refresh cause as a short readable string. */
function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    const inner = (cause as { cause?: unknown }).cause;
    const detail = inner instanceof Error ? `: ${inner.message}` : '';
    return `${cause.name} ${cause.message}${detail}`.slice(0, 300);
  }
  return String(cause ?? 'unknown').slice(0, 300);
}
