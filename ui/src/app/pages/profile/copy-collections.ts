import { Account, Collection } from '../../models';
import { rejectionReason } from '../../follow-quality';
import { SkippedCandidate } from './clone-friends';

/**
 * The collections half of "Copy account" — turning someone's published
 * collections into browser-local lists.
 *
 * Pure, for the same reason `clone-friends.ts` is: the decisions here are which
 * collections to spend reads on, who inside them is worth keeping, and what to
 * call the copy. None of that needs HTTP to test.
 *
 * **Why members are quality-gated exactly like follows.** A browser-local list is
 * not an inert bookmark folder — `AnonymousLists` stores follow keys, and rendering
 * a list timeline goes through the same `createFollowFeed` machinery as Home, one
 * API call per member. A dormant account inside a copied list therefore burns a
 * request every time that list is opened, forever, to return nothing. It is the
 * identical cost that makes `ANONYMOUS_FOLLOW_LIMIT` 50, so it gets the identical
 * gate, via `rejectionReason()` — not a forked, softer copy of it.
 *
 * The gate is free here: `/api/v1/collections/{id}` returns full `Account` objects
 * carrying `statuses_count` and `last_status_at` (verified anonymously against
 * mastodon.social, 2026-08-04), so scoring costs zero extra requests.
 */

/**
 * How many of an account's collections to copy in one go.
 *
 * A read budget in the house style (`CLONE_MAX_PAGES`, `ALGO_MAX_CALLS`): each
 * collection costs one request for its members. Mastodon's own cap on collection
 * size keeps each of those cheap, so the ceiling that matters is how many.
 */
export const COPY_COLLECTION_LIMIT = 5;

/** One collection's worth of copy decisions. */
export interface CollectionPlan {
  collection: Collection;
  /** The title the local list will get, after collision handling. */
  title: string;
  /** Members worth a slot, in the order the server returned them. */
  adopt: Account[];
  /** Members filtered out, with why. Shown per list — see {@link describeCollectionPlan}. */
  skipped: SkippedCandidate[];
  /** Members already followed: kept in the list, but they cost no new follow slot. */
  alreadyFollowing: number;
}

export interface CollectionPlanOptions {
  collection: Collection;
  members: Account[];
  /** Usually `AnonymousFollows.isFollowing`. */
  isFollowing: (account: Account) => boolean;
  /** Titles already taken — existing lists plus any planned earlier in this run. */
  takenTitles: Iterable<string>;
  /** The viewer, so copying a collection you are in doesn't add you to your own list. */
  viewerId?: string;
  /** Injected for testable date boundaries. */
  now?: number;
}

/**
 * Which collections are worth reading, biggest first.
 *
 * Ranking uses `item_count` from the *list* payload, so choosing the best five
 * costs no extra requests — we never fetch a collection just to find out it was
 * too small to bother with. Empty collections are dropped rather than ranked:
 * copying an empty list produces an empty list.
 */
export function selectCollections(
  collections: Collection[],
  limit: number = COPY_COLLECTION_LIMIT,
): Collection[] {
  return [...collections]
    .filter((collection) => (collection?.item_count ?? 0) > 0)
    .sort((a, b) => (b.item_count ?? 0) - (a.item_count ?? 0))
    .slice(0, Math.max(0, limit));
}

/**
 * A title that does not collide with a list the user already has.
 *
 * Never merges into an existing list: two lists that happen to share a name are
 * not the same list, and silently pouring one into the other is unrecoverable.
 */
export function uniqueListTitle(desired: string, taken: Iterable<string>): string {
  const existing = new Set([...taken].map((title) => title.trim().toLowerCase()));
  const base = desired.trim() || 'Untitled collection';
  if (!existing.has(base.toLowerCase())) {
    return base;
  }
  if (!existing.has(`${base} (copy)`.toLowerCase())) {
    return `${base} (copy)`;
  }
  for (let n = 2; ; n += 1) {
    const candidate = `${base} (copy ${n})`;
    if (!existing.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

/** Decide what one collection becomes locally. */
export function planCollectionCopy(options: CollectionPlanOptions): CollectionPlan {
  const now = options.now ?? Date.now();
  const adopt: Account[] = [];
  const skipped: SkippedCandidate[] = [];
  const seen = new Set<string>();
  let alreadyFollowing = 0;

  for (const account of options.members) {
    if (!account?.id || seen.has(account.id)) {
      continue;
    }
    seen.add(account.id);

    if (options.viewerId && account.id === options.viewerId) {
      continue;
    }
    // Someone already followed has already passed whatever bar the user set for
    // themselves, and costs no *new* recurring call — they join the list as-is.
    if (options.isFollowing(account)) {
      alreadyFollowing += 1;
      adopt.push(account);
      continue;
    }
    const reason = rejectionReason(account, now);
    if (reason) {
      skipped.push({ account, reason });
      continue;
    }
    adopt.push(account);
  }

  return {
    collection: options.collection,
    title: uniqueListTitle(options.collection?.name ?? '', options.takenTitles),
    adopt,
    skipped,
    alreadyFollowing,
  };
}

/**
 * The per-list line in the report.
 *
 * **Always rendered, including — especially — when nothing survived.** The gate can
 * empty out a genuinely curated collection, and a list that arrives in the sidebar
 * with two of thirty-one members and no explanation is the same failure mode that
 * produced `homeServerFor()`: a number the user cannot account for reads as a bug.
 */
export function describeCollectionPlan(plan: CollectionPlan): string {
  const total = plan.adopt.length + plan.skipped.length;
  const head = `${plan.adopt.length} of ${total}`;
  if (!plan.skipped.length) {
    return head;
  }
  return `${head} · ${plan.skipped.length} too quiet`;
}
