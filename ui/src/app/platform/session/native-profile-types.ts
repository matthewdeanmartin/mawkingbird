import type { Status } from '../api/models';

export interface NativeProfileSummary {
  id: number;
  remoteId: string;
  acct: string;
  displayName: string;
  lastStatusAt: string | null;
  avatar: string | null;
  cachedPosts: number;
  cachedUnread: number;
}

export interface NativeProfilesResult {
  profiles: NativeProfileSummary[];
  following: number;
  scanComplete: boolean;
}

export interface NativeProfilePost {
  localId: number;
  status: Status;
  isRead: boolean;
}

export type NativeProfileFilter = 'all' | 'replies' | 'boosts' | 'links' | 'media';

export interface NativeProfilesApi {
  list(handle: string): Promise<NativeProfilesResult>;
  posts(
    handle: string,
    actorId: number,
    filter: NativeProfileFilter,
    hideRead: boolean,
    offset: number,
  ): Promise<NativeProfilePost[]>;
  markRead(handle: string, postId: number): Promise<void>;
}
