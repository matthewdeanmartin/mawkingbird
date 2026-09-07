import { Account, Status } from '../models';

/**
 * A "list" in the best-list-tab-ever model is any feed source that resolves to
 * a reverse-chron feed of posts plus a set of members. What varies is *how* the
 * feed and members are produced — captured by this discriminated union.
 *
 * See `sprint/lists-0-overview.md`.
 */
export type ListSource =
  | { kind: 'user-list'; id: string }
  | { kind: 'collection'; id: string }
  | { kind: 'saved-search'; id: string }
  | { kind: 'server-feed'; feed: ServerFeedKind }
  | { kind: 'endorsed'; accountId: string }
  /** A client-side bundle of hashtags, read as one feed. Members are synthetic. */
  | { kind: 'tag-bundle'; id: string };

export type ServerFeedKind = 'federated' | 'local' | 'trending' | 'news';

export type ListSourceKind = ListSource['kind'];

/** Whether members of a source are real (managed) or synthesized from authors. */
export type MemberOrigin = 'real' | 'synthetic';

/** The resolved runtime shape every list renders through. */
export interface ResolvedFeed {
  statuses: Status[];
  /**
   * Members backing the feed. For 'real' sources these are the managed members;
   * for 'synthetic' sources these are the distinct authors of `statuses`.
   */
  members: Account[];
  memberOrigin: MemberOrigin;
  /** True when another page can be fetched (synthetic/paged sources). */
  hasMore: boolean;
  /** Non-fatal notes to surface (e.g. anonymous degradation, member caps). */
  warnings: string[];
}

/** Distinct authors of a set of statuses, first-seen order, boosts attributed
 *  to the original author (the person whose post it is). */
export function authorsOf(statuses: Status[]): Account[] {
  const seen = new Set<string>();
  const out: Account[] = [];
  for (const status of statuses) {
    const account = status.reblog?.account ?? status.account;
    if (account && !seen.has(account.id)) {
      seen.add(account.id);
      out.push(account);
    }
  }
  return out;
}
