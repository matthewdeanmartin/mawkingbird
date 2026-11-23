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

/** Reactions from one person, of one kind, in one month (from notifications). */
export interface NativeEngagerRow {
  /** Their account id on the home server. */
  actor: string;
  /** Always `user@host`. */
  acct: string;
  displayName: string;
  kind: 'favourite' | 'reblog' | 'quote' | 'mention';
  /** `YYYY-MM`. */
  month: string;
  count: number;
}

/**
 * Timed notifications from the part of the archive that has no gap. People and
 * posts are listed once and trimmed to the fields analytics read.
 */
export interface NativeTimedReactions {
  /** False until the collector has joined new notifications to older ones. */
  connected: boolean;
  /** Every notification since this time is in the archive. */
  coveredSince: string | null;
  /** Newest first. `post` is the reply itself for a mention. */
  events: {
    id: string;
    kind: 'favourite' | 'reblog' | 'mention' | 'follow';
    at: string;
    actor: string;
    post: string | null;
  }[];
  people: Record<string, Partial<Account> & { id: string }>;
  posts: Record<string, Partial<Status> & { id: string }>;
}

/** Native-only analytics over the local archive. Null in web builds. */
export interface NativeAnalyticsApi {
  /** Read new posts and recount the last 14 days for one account. */
  catchUp(handle: string, remoteId: string): Promise<NativeCatchUpReport>;
  /** The account's statuses (own posts and boosts), newest first, from the archive. */
  posts(handle: string, remoteId: string, limit: number): Promise<Status[]>;
  /** Who boosted a post: archived while its boost count is unchanged, else looked up. */
  boosters(handle: string, postId: string): Promise<Account[]>;
  /** The signed-in account's follower history. No requests. */
  history(handle: string): Promise<NativeAudienceHistory>;
  /** A post's engagement timeline. No requests. */
  postActivity(handle: string, postId: string): Promise<NativePostActivity>;
  /** Who reacted to the signed-in account in the last `days` days. No requests. */
  engagers(handle: string, days: number): Promise<NativeEngagerRow[]>;
  /** Timed likes, boosts, mentions and follows (1–365 days). No requests. */
  reactions(handle: string, days: number): Promise<NativeTimedReactions>;
}
