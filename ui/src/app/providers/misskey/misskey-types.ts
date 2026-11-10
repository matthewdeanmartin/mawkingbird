// Wire types for the small part of the Misskey API this client uses.
//
// Hand-written from the packed JSON schemas (`packages/backend/src/models/json-schema`)
// of Misskey 2026.11, read for facts only: that source is AGPL and nothing here is
// copied from it. Every field the adapter does not read is left out, and every
// field that a server may omit is optional, because federated notes arrive with
// whatever the origin server sent.

/** `UserLite`: the author embedded in every note. */
export interface MkUserLite {
  id: string;
  /** Display name. Null when the user never set one. */
  name: string | null;
  username: string;
  /** Null for a local user; the remote host otherwise. */
  host: string | null;
  avatarUrl: string | null;
  isBot?: boolean;
  isCat?: boolean;
  /** Custom emoji used in `name`, shortcode → image URL. */
  emojis?: Record<string, string>;
  instance?: {
    name: string | null;
    softwareName: string | null;
    iconUrl: string | null;
  };
}

/** `UserDetailed`: profiles and the signed-in account. */
export interface MkUserDetailed extends MkUserLite {
  url?: string | null;
  uri?: string | null;
  createdAt?: string;
  bannerUrl?: string | null;
  isLocked?: boolean;
  description?: string | null;
  fields?: { name: string; value: string }[];
  followersCount?: number;
  followingCount?: number;
  notesCount?: number;
}

export interface MkDriveFile {
  id: string;
  name: string;
  /** MIME type. */
  type: string;
  isSensitive: boolean;
  url: string;
  thumbnailUrl: string | null;
  /** Alt text. */
  comment: string | null;
  properties?: { width?: number; height?: number };
}

export interface MkPoll {
  multiple: boolean;
  expiresAt: string | null;
  choices: { text: string; votes: number; isVoted: boolean }[];
}

export type MkVisibility = 'public' | 'home' | 'followers' | 'specified';

/** A packed note. `renote` and `reply` are packed notes one level deep. */
export interface MkNote {
  id: string;
  createdAt: string;
  text: string | null;
  cw?: string | null;
  user: MkUserLite;
  userId: string;
  replyId?: string | null;
  renoteId?: string | null;
  reply?: MkNote | null;
  renote?: MkNote | null;
  visibility: MkVisibility;
  localOnly?: boolean;
  files?: MkDriveFile[];
  poll?: MkPoll | null;
  /** Custom emoji used in `text` and `cw`, shortcode → URL (remote notes). */
  emojis?: Record<string, string>;
  /** Reaction → count. Keys are a Unicode emoji or `:name@host:` / `:name@.:`. */
  reactions?: Record<string, number>;
  /** Images for custom-emoji reactions, keyed `name@host` (no colons). */
  reactionEmojis?: Record<string, string>;
  myReaction?: string | null;
  renoteCount?: number;
  repliesCount?: number;
  /** ActivityPub id of a remote note. Absent for local notes. */
  uri?: string;
  /** Human-facing URL of a remote note, when the origin offers one. */
  url?: string;
  tags?: string[];
  isHidden?: boolean;
}

/** A packed notification (`i/notifications`), the social types only. */
export interface MkNotification {
  id: string;
  createdAt: string;
  type: string;
  user?: MkUserLite;
  note?: MkNote;
  /** For `reaction`: the emoji used. */
  reaction?: string;
}

/** The notification types this client shows; system notices are left out. */
export const MK_SOCIAL_NOTIFICATION_TYPES = [
  'follow',
  'mention',
  'reply',
  'renote',
  'quote',
  'reaction',
  'receiveFollowRequest',
] as const;

/** `notes/create` parameters this client sends. */
export interface MkCreateNote {
  text?: string | null;
  cw?: string | null;
  visibility?: Exclude<MkVisibility, 'specified'>;
  localOnly?: boolean;
  replyId?: string;
  /** With text: a quote. Without text, files or poll: a plain renote. */
  renoteId?: string;
  fileIds?: string[];
  poll?: { choices: string[]; multiple?: boolean; expiredAfter?: number | null };
}

/** `EmojiSimple`: one custom emoji of a server. */
export interface MkEmoji {
  name: string;
  url: string;
  category: string | null;
  aliases?: string[];
  isSensitive?: boolean;
}

/** `users/relation` (abridged). */
export interface MkRelation {
  id: string;
  isFollowing: boolean;
  hasPendingFollowRequestFromYou: boolean;
  hasPendingFollowRequestToYou: boolean;
  isFollowed: boolean;
  isBlocking: boolean;
  isMuted: boolean;
}

/** `POST /api/meta` (abridged). */
export interface MkMeta {
  name: string | null;
  uri?: string;
  version?: string;
  description?: string | null;
  iconUrl?: string | null;
  maxNoteTextLength?: number;
  policies?: { ltlAvailable?: boolean; gtlAvailable?: boolean };
  /** Whether the admin configured a translator (a DeepL key) for `notes/translate`. */
  translatorAvailable?: boolean;
  /**
   * What visitors (no token) may read: everything, local notes only, or
   * nothing. Absent on older servers, which show visitors everything.
   */
  ugcVisibilityForVisitor?: 'all' | 'local' | 'none';
}

/** An antenna: the reader's saved filter over incoming notes (`antennas/list`). */
export interface MkAntenna {
  id: string;
  name: string;
}

/** A user list (`users/lists/list`): the reader's list of people. */
export interface MkUserList {
  id: string;
  name: string;
  userIds?: string[];
}

/** A channel: a topic room with its own timeline (`channels/*`). */
export interface MkChannel {
  id: string;
  name: string;
  description?: string | null;
  bannerUrl?: string | null;
  notesCount?: number;
  usersCount?: number;
  isFollowing?: boolean;
  isFavorited?: boolean;
}

/** A clip: a saved collection of notes (`clips/list`). */
export interface MkClip {
  id: string;
  name: string;
  description?: string | null;
  notesCount?: number;
}

/** The Misskey feeds the Feeds page opens, each one a paged list of notes. */
export type MkFeedKind = 'antenna' | 'list' | 'channel' | 'clip';

/** `POST /api/miauth/{session}/check`. */
export type MkMiAuthCheck = { ok: true; token: string; user: MkUserDetailed } | { ok: false };

/** A Misskey API error body: `{ error: { code, message, id } }`. */
export interface MkErrorBody {
  error?: { code?: string; message?: string; id?: string };
}

/** The timelines Home can read, in the order the picker shows them. */
export type MkTimeline = 'home' | 'social' | 'local' | 'global';

export const MK_TIMELINE_ENDPOINTS: Record<MkTimeline, string> = {
  home: 'notes/timeline',
  // Misskey's own UI calls the hybrid timeline "Social".
  social: 'notes/hybrid-timeline',
  local: 'notes/local-timeline',
  global: 'notes/global-timeline',
};
