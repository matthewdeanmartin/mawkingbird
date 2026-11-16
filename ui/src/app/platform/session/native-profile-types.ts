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

export interface NativeProfileCursor {
  createdAt: string;
  localId: number;
}

export interface NativeProfilePostPage {
  posts: NativeProfilePost[];
  next: NativeProfileCursor | null;
}

export type NativeProfileFilter = 'all' | 'replies' | 'boosts' | 'links' | 'media';

export interface NativeCollectionStatus {
  currentJob: 'idle' | 'following' | 'notifications' | 'recent_seed';
  following: {
    following: number;
    knownZombies: number;
    unknownActivity: number;
    complete: boolean;
    updatedAt: number;
  } | null;
  cachedPosts: number;
  profilesWithPosts: number;
  seedEligible: number;
  notificationHistoryComplete: boolean;
  jobs: {
    job: string;
    apiCalls: number;
    savedItems: number;
    lastOutcome: string;
    updatedAt: number;
  }[];
}

export interface NativeSeedReport {
  profiles: number;
  posts: number;
  remaining: number;
}
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
  collectionStatus(handle: string): Promise<NativeCollectionStatus>;
  seedRecent(handle: string): Promise<NativeSeedReport>;
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
  postsAfter(
    handle: string,
    actorId: number,
    filter: NativeProfileFilter,
    hideRead: boolean,
    before: NativeProfileCursor | null,
  ): Promise<NativeProfilePostPage>;
  markRead(handle: string, postId: number): Promise<void>;
  markReadBatch(handle: string, postIds: number[]): Promise<void>;
  accountPosts(handle: string, remoteId: string, offset: number): Promise<NativeProfilePost[]>;
  fetchAccountPage(handle: string, remoteId: string, older: boolean): Promise<number>;
}
