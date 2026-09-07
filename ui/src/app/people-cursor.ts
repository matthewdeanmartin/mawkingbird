import { Account } from './models';

/**
 * The next `max_id` for a `/followers` or `/following` walk, when the `Link`
 * header is not there.
 *
 * ## Why a fallback is needed at all
 *
 * These two endpoints paginate by the id of the internal *follow relationship*,
 * which is published only in `Link: <…?max_id=N>; rel="next"`. Reading it is the
 * correct thing to do and both callers already do it — see
 * {@link Api.accountFollowersPage} and `AnonymousPublicApi.getAccountPeople`.
 *
 * The catch is that a browser hands `response.headers.get('Link')` back as
 * `null` unless the response carried `Access-Control-Expose-Headers: Link`.
 * `Link` is not one of the six CORS-safelisted names, so when the expose header
 * is absent the cursor is not missing but *filtered*: the server sent it, the
 * browser received it, and this code is not permitted to read it. The walk then
 * ends after page one on an account with thousands of followers, and looks
 * exactly like a hidden social graph. Both call sites previously documented
 * this as an acceptable degradation to "one page", which is only acceptable
 * while the profile beside it is not advertising 3,000 followers.
 *
 * Mastodon itself does send the expose header, and `mawkingbird_cors_proxy` has
 * no Mastodon route — so on a healthy path the cursor should arrive, and the
 * reported truncation has a cause nobody has established yet (see
 * `sprint/p1-0-overview.md`). This function is therefore a defence against a
 * real mechanism rather than a fix for a diagnosed one: whatever eats the
 * header, the walk continues instead of stopping at one page.
 *
 * ## Why guessing is better than stopping here, and only here
 *
 * The account id is genuinely the wrong cursor — that is not in dispute, and it
 * is why {@link nextMaxIdFrom} exists. But the two candidate behaviours when the
 * header is missing are "stop at 80" and "walk by an imperfect cursor", and the
 * second is strictly more useful: relationship ids and account ids are both
 * snowflakes that ascend with time, so for the common case of a follower list
 * accumulated over time the orders broadly agree. Where they disagree the walk
 * skips or repeats some accounts — the browser already dedupes by id and stops
 * when a page adds nothing new — and where it ends early it ends no earlier
 * than the one page we would otherwise have shown.
 *
 * The guess is deliberately confined to the case where it can only help:
 *
 *  - **Only with no `Link` header.** A server that sent one is authoritative,
 *    including when it says there is no `next`. We never second-guess that.
 *  - **Only on a full page.** A short page means the list ended; asking for more
 *    would turn a clean end into an endless one. This is the condition that
 *    keeps a wrong cursor from looping forever.
 *
 * @param linkHeader the raw `Link` header, or null when absent or hidden by CORS
 * @param accounts the page just received
 * @param limit the `limit` that was requested, so "full page" is decidable
 */
export function peopleCursorFrom(
  linkHeader: string | null,
  accounts: Account[],
  limit: number,
): { nextMaxId: string | null; source: PeopleCursorSource } {
  const fromHeader = nextMaxIdFrom(linkHeader);
  if (fromHeader) {
    return { nextMaxId: fromHeader, source: 'link-header' };
  }
  if (linkHeader) {
    // The server spoke and did not offer a `next`. That is the end of the list.
    return { nextMaxId: null, source: 'link-header' };
  }
  if (accounts.length < limit) {
    // A short page ends the walk on its own; no cursor is needed to stop.
    return { nextMaxId: null, source: 'short-page' };
  }
  const last = accounts.at(-1);
  return last
    ? { nextMaxId: last.id, source: 'account-id-fallback' }
    : { nextMaxId: null, source: 'short-page' };
}

/**
 * Where the cursor came from, so a caller can say *why* a list ended.
 *
 * Reported rather than inferred because the three cases need different words:
 * `link-header` ending is the server's own answer, `short-page` is an ordinary
 * end, and `account-id-fallback` means the walk is running on a guess and the
 * result may be incomplete — which is worth telling a reader who expected
 * thousands of rows.
 */
export type PeopleCursorSource = 'link-header' | 'short-page' | 'account-id-fallback';

/**
 * Pull the `max_id` cursor out of a `Link: <…>; rel="next"` header.
 *
 * Only the cursor is taken, never the URL itself: the `next` link is an absolute
 * address on whatever host the server thinks it is, and re-issuing that verbatim
 * would skip the server-rewriting and auth interceptors that make every other
 * call in `api.ts` work. Feeding the id back into a normal relative request
 * keeps one code path.
 *
 * Returns null when there is no header, no `next` relation, or no usable id —
 * all of which mean the same thing to a caller: stop.
 *
 * Lives here rather than in `api.ts` because it is a pure string function that
 * {@link peopleCursorFrom} builds on, and because a test for it should not have
 * to boot Angular's DI to get at it. `api.ts` re-exports it for its own callers.
 */
export function nextMaxIdFrom(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (!match) {
      continue;
    }
    try {
      const maxId = new URL(match[1], 'https://placeholder.invalid').searchParams.get('max_id');
      return maxId || null;
    } catch {
      return null;
    }
  }
  return null;
}
