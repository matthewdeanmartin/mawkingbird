import { Injectable } from '@angular/core';
import { accountScopeSuffix, ANONYMOUS_SCOPE_SUFFIX, scopedKey } from './account-scope';
import { LocalFollowStore, ANONYMOUS_FOLLOW_LIMIT } from './providers/anonymous/anonymous-follows';

const STORAGE_BASE = 'mockingbird_private_follows';

/** Private follows belong to one logged-in identity; never to the Plus account. */
@Injectable({ providedIn: 'root' })
export class PrivateFollows {
  private stores = new Map<string, LocalFollowStore>();

  current(): LocalFollowStore | null {
    const scope = accountScopeSuffix();
    if (!scope || scope === ANONYMOUS_SCOPE_SUFFIX) return null;
    const key = scopedKey(STORAGE_BASE);
    let store = this.stores.get(key);
    if (!store) {
      store = new LocalFollowStore(
        key,
        undefined,
        `You can privately follow up to ${ANONYMOUS_FOLLOW_LIMIT} accounts.`,
      );
      this.stores.set(key, store);
    }
    return store;
  }
}
