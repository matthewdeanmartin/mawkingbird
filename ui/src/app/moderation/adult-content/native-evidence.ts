import { inject, Injectable } from '@angular/core';
import { Account, Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { NATIVE_PROFILES } from '../../platform/session/platform-login';

/** At most this many people are looked up per call; each is one local query. */
const MAX_PEOPLE = 80;

/**
 * Posts the Native app already has on disk, as extra evidence for the adult and
 * language checks (spec/moderation-facets.md §2, §4; Native roadmap §6a).
 *
 * On the web a person's verdict rests on the one or two pages a search
 * loaded. Native keeps a local archive of followed people's posts, so the same
 * pure classifiers can see dozens of posts per person without spending a
 * single API call. Absent on the web: {@link available} is false and every
 * lookup returns nothing, so callers need no platform checks of their own.
 */
@Injectable({ providedIn: 'root' })
export class NativeEvidence {
  private readonly profiles = inject(NATIVE_PROFILES);
  private readonly auth = inject(Auth);

  /** The local archive this session can read, if any. */
  private handle(): string | null {
    const token = this.auth.token();
    return this.profiles && this.auth.kind() === 'mastodon' && token?.startsWith('native-mastodon:')
      ? token
      : null;
  }

  get available(): boolean {
    return this.handle() !== null;
  }

  /**
   * Cached posts per account id, for the accounts that have any. Accounts the
   * archive knows nothing about are left out, so callers can tell "no
   * evidence yet" from "checked, nothing adult".
   */
  async postsFor(accounts: readonly Account[]): Promise<Map<string, Status[]>> {
    const handle = this.handle();
    const out = new Map<string, Status[]>();
    if (!handle || !this.profiles) return out;
    const lookups = accounts.slice(0, MAX_PEOPLE).map(async (account) => {
      try {
        const posts = await this.profiles!.accountPosts(handle, account.id, 0);
        if (posts.length)
          out.set(
            account.id,
            posts.map((p) => p.status),
          );
      } catch {
        // A missing or locked profile is simply no evidence.
      }
    });
    await Promise.all(lookups);
    // The session may have changed while the archive answered.
    return handle === this.handle() ? out : new Map();
  }
}
