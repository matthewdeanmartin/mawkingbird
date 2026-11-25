import { Injectable, signal } from '@angular/core';
import type { AccountChoice } from '../../platform/session/auth';
import {
  scopeSuffixForDid,
  scopeSuffixForMastodonAccount,
  scopeSuffixForMisskey,
  scopeSuffixForToken,
} from '../../platform/session/account-scope';
import { pseudonymousIn } from '../../accounts/pseudonymity';

/** Device-local on purpose: sharing this screen says nothing about another one. */
export const SCREEN_SHARE_KEY = 'mockingbird_screen_share';

/** Pages that are private as a whole: messages, the inbox and unpublished writing. */
const PRIVATE_PAGES = [
  '/notifications',
  '/conversations',
  '/bsky/chat',
  '/eliza',
  '/drafts',
  '/schedule-mastodon-posts',
];

/** What a post's audience is, when the network says so. Anything else is not public. */
const PUBLIC_VISIBILITY = new Set(['public', 'unlisted']);

function stored(): boolean {
  try {
    return localStorage.getItem(SCREEN_SHARE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Screen share mode: for streaming or recording the app, show only what anyone
 * could see anyway.
 *
 * While on, posts with a narrower audience (followers-only, direct) are reduced
 * to a stub, whole pages that are private by nature are covered, and accounts
 * marked pseudonymous are left out of the account switchers, so a stream never
 * links a pseudonym to the person sharing their screen.
 *
 * Kept on until turned off, across reloads: forgetting it is on costs a badge in
 * the header, while forgetting it was off costs whatever was on screen.
 */
@Injectable({ providedIn: 'root' })
export class ScreenShare {
  readonly enabled = signal(stored());

  set(on: boolean): void {
    this.enabled.set(on);
    try {
      if (on) localStorage.setItem(SCREEN_SHARE_KEY, '1');
      else localStorage.removeItem(SCREEN_SHARE_KEY);
    } catch {
      // Storage blocked: the mode still holds for this visit.
    }
  }

  /** Whether this post is kept off the screen. Posts that say nothing count as public. */
  hides(status: {
    visibility?: string | null;
    reblog?: { visibility?: string | null } | null;
  }): boolean {
    if (!this.enabled()) return false;
    const visibility = (status.reblog ?? status).visibility;
    return !!visibility && !PUBLIC_VISIBILITY.has(visibility);
  }

  /** Whether the page at this address is covered. */
  covers(url: string): boolean {
    if (!this.enabled()) return false;
    const path = url.split(/[?#]/)[0];
    return PRIVATE_PAGES.some((page) => path === page || path.startsWith(`${page}/`));
  }

  /** The accounts a switcher may show. */
  shown(choices: readonly AccountChoice[]): AccountChoice[] {
    return this.enabled() ? choices.filter((choice) => !isPseudonymous(choice)) : [...choices];
  }
}

/** Whether this saved account has Pseudonymity turned on (Settings → Pseudonymity). */
export function isPseudonymous(choice: AccountChoice): boolean {
  switch (choice.kind) {
    case 'bluesky':
      return !!choice.did && pseudonymousIn(scopeSuffixForDid(choice.did));
    case 'misskey':
      return !!choice.misskeyKey && pseudonymousIn(scopeSuffixForMisskey(choice.misskeyKey));
    case 'mastodon':
      return (
        (!!choice.account?.id &&
          pseudonymousIn(scopeSuffixForMastodonAccount(choice.account.id, choice.server))) ||
        (!!choice.token && pseudonymousIn(scopeSuffixForToken(choice.token)))
      );
    default:
      return false;
  }
}
