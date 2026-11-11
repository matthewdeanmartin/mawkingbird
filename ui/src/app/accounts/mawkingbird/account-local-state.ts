import { PLUS_FEATURES_KEY } from './plus-features';
import { PROFILE_SYNC_KEY } from './profile-sync-state';

/**
 * Local state that belongs to a Mawkingbird account rather than to this browser.
 *
 * ## Why this is a list and not a prefix sweep
 *
 * Almost everything in `localStorage` here is the user's own client data —
 * drafts, saved searches, connector tokens, timeline preferences — and it
 * survives sign-out precisely because it is theirs, not the account's. It
 * predates accounts existing at all and works fine signed out. A prefix sweep
 * over `mockingbird_*` would take all of it, which is why the boundary is drawn
 * by hand and each entry has to justify itself.
 *
 * The test for membership: **would inheriting this from the previous account be
 * wrong?** That is a much narrower question than "is it account-related".
 */
const ACCOUNT_SCOPED_KEYS: readonly string[] = [
  // This browser's view of an account-level switch: sync on or off, the ETag
  // and revision of *that account's* settings document, whether this browser
  // has edits it never pushed. Every field of it describes a relationship with
  // one account, so all of it is wrong for the next one — and inheriting a
  // `paused` or `off` state is what silently denied a fresh account its sync
  // offer, since neither state prompts.
  PROFILE_SYNC_KEY,
  // A cached server-side number: bytes used and the allowance they count
  // against, both belonging to the account that was signed in. Showing the
  // previous account's usage to the next one is simply a wrong reading, and it
  // costs nothing to drop — the next sync refetches it.
  'mockingbird_remote_storage_usage',
  // Which Plus features the *previous* account switched on, and the fact that
  // it answered the dialog at all. Inheriting `decided: true` would deny the
  // next account the one-time dialog entirely, which is the same silent-denial
  // bug as inheriting a `paused` sync state.
  PLUS_FEATURES_KEY,
];

/**
 * What is deliberately **not** cleared, and why:
 *
 * - `mockingbird_profile_writer` — a random id for *this browser*, used to tell
 *   this writer's own updates from another device's. It identifies the browser,
 *   not the person, so it stays valid across accounts. Rotating it would
 *   achieve nothing except making one browser look like two.
 * - `mockingbird_profile_list_copy` — already keyed by account, so it holds the
 *   answer for each account separately and cannot leak between them. Clearing
 *   it would re-ask a question the user already answered when they sign back in.
 * - `mockingbird_mawkingbird_metrics` — call-count tallies with no account
 *   identity in them (deliberately not even endpoint paths). Diagnostics about
 *   this browser's traffic, not a record of the account.
 */
export function forgetAccountLocalState(storage: Storage = localStorage): void {
  for (const key of ACCOUNT_SCOPED_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // Blocked or unavailable storage. Sign-out must complete regardless —
      // failing to tidy is not a reason to leave someone signed in.
    }
  }
}
