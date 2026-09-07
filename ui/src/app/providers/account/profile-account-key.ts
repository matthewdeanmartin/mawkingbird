import { inject, Injectable } from '@angular/core';
import { Auth } from '../../auth';
import { Server } from '../../server';
import { blueskyIdentityDid } from '../bluesky/bluesky-identity-store';

/**
 * Which persona a Plus collection belongs to.
 *
 * ## Not `accountScopeSuffix()`, and this is the whole point
 *
 * `account-scope.ts` also uses stable identity now, but encodes provider,
 * instance origin, and the verified server-local id into an exact browser key.
 * This boundary instead needs the constrained, human-readable account key the
 * profile service already understands: instance host plus username, or DID.
 *
 * Keep these concepts separate: changing the browser key format needs local
 * adoption/cleanup handling, while changing this key is a server-side data
 * migration.
 *
 * ## Refuse rather than guess
 *
 * When the key cannot be determined with confidence, this returns `null` and the
 * caller refuses the operation. Never a fallback to a default bucket: a wrong
 * key is one persona's lists appearing under another's, which is invisible at
 * the time and unpickable apart afterwards. An error message is a support
 * question; a silent default is a data-integrity incident.
 */

/** The header the profile service reads. Must match the Worker's constant. */
export const ACCOUNT_KEY_HEADER = 'X-Account-Key';

/**
 * The key for a Mastodon account, or null if either half is unusable.
 *
 * Exported for testing and for the "my account moved" flow, which needs to build
 * a key for an account that is not the active one.
 */
export function mastodonAccountKey(acct: string, baseUrl: string): string | null {
  const host = baseUrl
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    // A port would make the same account key differ between a dev server and
    // production, so it is stripped rather than encoded.
    .replace(/:\d+$/, '');
  // A remote `acct` already carries a host (`alice@other.social`); the local
  // part is what pairs with this instance's hostname.
  const username = (acct.includes('@') ? acct.slice(0, acct.indexOf('@')) : acct).toLowerCase();

  if (!host || !username) {
    return null;
  }
  // Mirrors the service's own validation. Checked here too so a malformed key is
  // caught before a request is spent discovering it is a 400.
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    return null;
  }
  // `..` is excluded explicitly. The character class permits dots, so a bare
  // `..` would otherwise pass — and while the service refuses it too, a client
  // that can construct a traversal string is one refactor away from putting it
  // somewhere that does not check.
  if (!/^[a-z0-9_.-]{1,64}$/.test(username) || username.includes('..')) {
    return null;
  }
  return `mastodon:${host}/${username}`;
}

/** The key for a Bluesky-primary account. */
export function blueskyAccountKey(did: string): string | null {
  return /^did:(?:plc|web):[A-Za-z0-9._%:-]{1,200}$/.test(did) ? `bsky:${did}` : null;
}

/** The fixed key for the one browser-local anonymous persona. */
export const ANONYMOUS_ACCOUNT_KEY = 'anonymous';

@Injectable({ providedIn: 'root' })
export class ProfileAccountKey {
  private auth = inject(Auth);
  private server = inject(Server);

  /**
   * The active account's key, or null when there is not one.
   *
   * Null is a normal answer, not an error: signed out is null because the
   * empty-suffix namespace is scratch space that would collide across accounts,
   * and a half-loaded session is null because guessing is worse than waiting.
   */
  current(): string | null {
    switch (this.auth.kind()) {
      case 'anonymous':
        return ANONYMOUS_ACCOUNT_KEY;
      case 'bluesky': {
        const did = blueskyIdentityDid();
        return did ? blueskyAccountKey(did) : null;
      }
      case 'mastodon': {
        const acct = this.auth.account()?.acct;
        return typeof acct === 'string' && acct
          ? mastodonAccountKey(acct, this.server.baseUrl())
          : null;
      }
      default:
        // Signed out. No collections, deliberately.
        return null;
    }
  }

  /** The header to send, or null when no account is active. */
  header(): Record<string, string> | null {
    const key = this.current();
    return key === null ? null : { [ACCOUNT_KEY_HEADER]: key };
  }
}
