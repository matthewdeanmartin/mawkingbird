import type { Account, Status } from '../api/models';

/** What one archive catch-up did. */
export interface NativeCatchUpReport {
  /** Status pages read (one API call each). */
  pages: number;
  /** Posts saved or refreshed. */
  saved: number;
  /** False when it stopped at its page cap; the next run resumes there. */
  complete: boolean;
  rateLimited: boolean;
}

/** Native-only analytics over the local archive. Null in web builds. */
export interface NativeAnalyticsApi {
  /** Read new posts and recount the last 14 days for one account. */
  catchUp(handle: string, remoteId: string): Promise<NativeCatchUpReport>;
  /** The account's own posts (boosts excluded), newest first, from the archive. */
  posts(handle: string, remoteId: string, limit: number): Promise<Status[]>;
  /** Who boosted a post: archived while its boost count is unchanged, else looked up. */
  boosters(handle: string, postId: string): Promise<Account[]>;
}
