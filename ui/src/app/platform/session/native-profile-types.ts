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
export type NativePeopleCategory =
  | 'all'
  | 'social'
  | 'mutuals'
  | 'reading'
  | 'readers'
  | 'bots'
  | 'lively'
  | 'zombies'
  | 'celebrities';
export type NativePostBin = 'all' | 'storms' | 'discussions' | 'pictures' | 'videos' | 'reposts';

export interface NativeProfilesApi {
  peoplePosts(
    handle: string,
    category: NativePeopleCategory,
    bin: NativePostBin,
    offset: number,
  ): Promise<{
    posts: NativeProfilePost[];
    following: number;
    relationshipsKnown: number;
    scanComplete: boolean;
  }>;
  peopleMembers(handle: string, category: NativePeopleCategory): Promise<NativeProfileSummary[]>;
  list(handle: string): Promise<NativeProfilesResult>;
  posts(
    handle: string,
    actorId: number,
    filter: NativeProfileFilter,
    hideRead: boolean,
    offset: number,
  ): Promise<NativeProfilePost[]>;
  markRead(handle: string, postId: number): Promise<void>;
  accountPosts(handle: string, remoteId: string, offset: number): Promise<NativeProfilePost[]>;
  fetchAccountPage(handle: string, remoteId: string, older: boolean): Promise<number>;
}
