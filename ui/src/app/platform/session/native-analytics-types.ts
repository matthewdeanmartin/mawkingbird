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

/** The signed-in account's audience over time, from the archive. */
export interface NativeAudienceHistory {
  /** One reading per day, oldest first. */
  followers: { day: string; followers: number; following: number }[];
  /** New-follower notifications per `YYYY-MM`. */
  followsByMonth: { month: string; count: number }[];
  /** Old notifications have all been read, so early months are not undercounted. */
  notificationHistoryComplete: boolean;
}

/** When one post's engagement arrived, from the archive. */
export interface NativePostActivity {
  /** Count observations for the signed-in account's own post; unix seconds. */
  snapshots: {
    observedAt: number;
    replies: number;
    reblogs: number;
    favourites: number;
    quotes: number;
  }[];
  /** Boost, favourite and quote notifications that name this post. */
  events: { kind: 'reblog' | 'favourite' | 'quote'; occurredAt: string }[];
}

/** Native-only analytics over the local archive. Null in web builds. */
export interface NativeAnalyticsApi {
  /** Read new posts and recount the last 14 days for one account. */
  catchUp(handle: string, remoteId: string): Promise<NativeCatchUpReport>;
  /** The account's own posts (boosts excluded), newest first, from the archive. */
  posts(handle: string, remoteId: string, limit: number): Promise<Status[]>;
  /** Who boosted a post: archived while its boost count is unchanged, else looked up. */
  boosters(handle: string, postId: string): Promise<Account[]>;
  /** The signed-in account's follower history. No requests. */
  history(handle: string): Promise<NativeAudienceHistory>;
  /** A post's engagement timeline. No requests. */
  postActivity(handle: string, postId: string): Promise<NativePostActivity>;
}
