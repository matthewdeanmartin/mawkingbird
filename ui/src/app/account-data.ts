import {
  ANONYMOUS_SCOPE_SUFFIX,
  legacyScopeSuffixForDid,
  scopeSuffixForDid,
  scopeSuffixForMastodonAccount,
  scopeSuffixForToken,
} from './account-scope';
import {
  formatBytes,
  inspectLocalStorage,
  StorageReport,
} from './observability/local-storage-inspector';

/**
 * Finding and deleting the browser-local data belonging to one saved account.
 *
 * Client-side settings (RSS feeds, the linked Bluesky session, local moderation,
 * saved searches, …) are namespaced per account by `scopedKey()`. That works
 * fine until you want to *clean up*: logged in twice to the same server, or
 * wanting to reset one account's local state without signing out of it. This
 * module is the inverse of scopedKey — given an account, which keys are its own?
 *
 * Deliberately distinct from the Local storage settings page: that one is a
 * fine-grained key-by-key inspector for the *active* account. This one operates
 * on whole accounts, including ones that are not currently signed in.
 */

/**
 * Anonymous keys predate scoping and use a prefix instead of a suffix.
 *
 * ## Do not rename `mockingbird_`
 *
 * The app's user-facing name is **Mawkingbird**, and every visible surface says
 * so. This prefix does not, and that mismatch is deliberate: `mockingbird_` is
 * the key namespace already written into every existing user's `localStorage` —
 * their follows, feeds, bookmarks, saved searches and linked sessions. Renaming
 * it does not migrate that data, it *orphans* it: the app would come up looking
 * like a fresh install to everyone who already uses it, with no error and no way
 * back short of a support conversation.
 *
 * It is a storage identifier that happens to be spelled like an old brand, not
 * a brand. If a future change genuinely needs the new spelling, it needs a
 * migration that reads both prefixes for a release, not a find-and-replace.
 */
const ANONYMOUS_PREFIX = 'mockingbird_anonymous_';

/**
 * Does `key` belong to the account identified by `suffix`?
 *
 * The empty suffix (a logged-out scope) matches nothing on purpose: it would
 * otherwise match unscoped global keys and blow away app-wide settings.
 */
export function keyBelongsToScope(key: string, suffix: string): boolean {
  if (!suffix) {
    return false;
  }
  if (suffix === ANONYMOUS_SCOPE_SUFFIX) {
    return key.startsWith(ANONYMOUS_PREFIX) || key.endsWith(suffix);
  }
  return key.endsWith(suffix);
}

export type AccountDataRef =
  | string
  | null
  | { kind: 'mastodon'; token: string; accountId?: string; server?: string }
  | { kind: 'bluesky'; did: string }
  | { kind: 'anonymous' };

/** The storage scope suffix for a saved Mastodon, Bluesky, or Anonymous account. */
export function scopeForAccount(account: AccountDataRef): string {
  if (account === null || (typeof account === 'object' && account.kind === 'anonymous')) {
    return ANONYMOUS_SCOPE_SUFFIX;
  }
  if (typeof account === 'string') return scopeSuffixForToken(account);
  if (account.kind === 'bluesky') return scopeSuffixForDid(account.did);
  return account.accountId
    ? scopeSuffixForMastodonAccount(account.accountId, account.server ?? '')
    : scopeSuffixForToken(account.token);
}

/** Current and historical scopes owned by an account, for complete cleanup. */
function scopesForAccount(account: AccountDataRef): string[] {
  const current = scopeForAccount(account);
  if (typeof account !== 'object' || account === null || account.kind === 'anonymous') {
    return [current];
  }
  const legacy =
    account.kind === 'bluesky'
      ? legacyScopeSuffixForDid(account.did)
      : scopeSuffixForToken(account.token);
  return [...new Set([current, legacy])].filter(Boolean);
}

/** Every localStorage entry belonging to one account, with sizes. */
export function inspectAccountData(account: AccountDataRef): StorageReport {
  const suffixes = scopesForAccount(account);
  return inspectLocalStorage((key) => suffixes.some((suffix) => keyBelongsToScope(key, suffix)));
}

/**
 * Delete every localStorage entry belonging to one account. Returns how many
 * keys were removed, so the caller can report what actually happened.
 */
export function deleteAccountData(account: AccountDataRef): number {
  const { entries } = inspectAccountData(account);
  for (const entry of entries) {
    localStorage.removeItem(entry.key);
  }
  return entries.length;
}

export { formatBytes };
