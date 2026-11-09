// Adapts packed Misskey notes and users into Mastodon-shaped Status/Account
// objects, so nothing outside `providers/` learns another protocol exists.
//
// Ids are namespaced (`mk:<noteId>`, `mk:<userId>`) per the standing rule that a
// foreign id must never collide with a Mastodon id in an id-keyed cache.

import {
  Account,
  CustomEmoji,
  MastodonNotification,
  MediaAttachment,
  Poll,
  Status,
  StatusReaction,
} from '../../models';
import {
  MkDriveFile,
  MkNote,
  MkNotification,
  MkPoll,
  MkUserDetailed,
  MkUserLite,
  MkVisibility,
} from './misskey-types';
import { escapeHtml, mfmToHtml } from './misskey-mfm';

export const MK_ID_PREFIX = 'mk:';

/** What a status card needs to act on, or link back to, a Misskey note. */
export interface MisskeyRef {
  server: string;
  noteId: string;
}

/** Strip the namespace from an adapted id; null when it is not a Misskey id. */
export function misskeyNoteId(id: string): string | null {
  return id.startsWith(MK_ID_PREFIX) ? id.slice(MK_ID_PREFIX.length) || null : null;
}

function hostOf(server: string): string {
  try {
    return new URL(server).host;
  } catch {
    return server;
  }
}

function emojiList(map: Record<string, string> | undefined): CustomEmoji[] {
  return Object.entries(map ?? {}).map(([shortcode, url]) => ({
    shortcode,
    url,
    static_url: url,
    visible_in_picker: false,
  }));
}

/** `@user@host` for remote users, `@user@<server host>` for local ones. */
export function misskeyAcct(user: Pick<MkUserLite, 'username' | 'host'>, server: string): string {
  return `${user.username}@${user.host ?? hostOf(server)}`;
}

export function adaptMisskeyUser(user: MkUserLite | MkUserDetailed, server: string): Account {
  const detailed = user as MkUserDetailed;
  const acct = misskeyAcct(user, server);
  const avatar = user.avatarUrl ?? '';
  return {
    id: `${MK_ID_PREFIX}${user.id}`,
    username: user.username,
    acct,
    display_name: user.name || user.username,
    emojis: emojiList(user.emojis),
    // Bios are MFM too; the profile card renders this as HTML.
    note: detailed.description
      ? mfmToHtml(detailed.description, { server, authorHost: user.host })
      : '',
    // The reader's own server, where they are signed in, rather than the
    // author's origin: that is the page that can follow and react.
    url: `${server}/@${user.host ? acct : user.username}`,
    avatar,
    avatar_static: avatar,
    header: detailed.bannerUrl ?? '',
    header_static: detailed.bannerUrl ?? '',
    followers_count: detailed.followersCount ?? 0,
    following_count: detailed.followingCount ?? 0,
    statuses_count: detailed.notesCount ?? 0,
    ...(detailed.createdAt ? { created_at: detailed.createdAt } : {}),
    bot: !!user.isBot,
    locked: !!detailed.isLocked,
    fields: (detailed.fields ?? []).map((field) => ({
      name: field.name,
      value: escapeHtml(field.value),
    })),
  };
}

/** Misskey visibility → the nearest Mastodon word, which the card already labels. */
export function mastodonVisibility(visibility: MkVisibility): string {
  switch (visibility) {
    case 'public':
      return 'public';
    case 'home':
      return 'unlisted';
    case 'followers':
      return 'private';
    case 'specified':
      return 'direct';
  }
}

function mediaType(mime: string): string {
  if (mime.startsWith('image/gif')) return 'gifv';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'unknown';
}

function adaptFile(file: MkDriveFile): MediaAttachment {
  const width = file.properties?.width;
  const height = file.properties?.height;
  return {
    id: `${MK_ID_PREFIX}${file.id}`,
    type: mediaType(file.type),
    url: file.url,
    preview_url: file.thumbnailUrl ?? file.url,
    description: file.comment,
    ...(width && height ? { meta: { original: { width, height, aspect: width / height } } } : {}),
  };
}

function adaptPoll(poll: MkPoll, noteId: string): Poll {
  const votes = poll.choices.reduce((sum, choice) => sum + choice.votes, 0);
  const own = poll.choices.flatMap((choice, index) => (choice.isVoted ? [index] : []));
  return {
    id: `${MK_ID_PREFIX}${noteId}`,
    expires_at: poll.expiresAt,
    expired: poll.expiresAt !== null && Date.parse(poll.expiresAt) <= Date.now(),
    multiple: poll.multiple,
    votes_count: votes,
    // Misskey reports votes, not voters; for a single-choice poll they match.
    voters_count: votes,
    options: poll.choices.map((choice) => ({ title: choice.text, votes_count: choice.votes })),
    voted: own.length > 0,
    own_votes: own,
  };
}

/**
 * Reaction keys come in three forms:
 *
 * - a Unicode emoji, e.g. `👍`;
 * - `:name@.:`, a custom emoji from the reader's own server;
 * - `:name@host:`, a custom emoji from another server.
 *
 * `reactionEmojis` holds image URLs keyed without colons (`name@host`). A
 * local emoji is often missing from it, and every Misskey serves its own
 * emoji at `/emoji/<name>.webp`, so that is the fallback.
 */
export function adaptReactions(note: MkNote, server: string): StatusReaction[] {
  return Object.entries(note.reactions ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const custom = /^:([^:@\s]+)(?:@([^:\s]+))?:$/.exec(key);
      if (!custom) {
        return { name: key, key, count, url: null, me: note.myReaction === key };
      }
      const [, name, host] = custom;
      const local = !host || host === '.';
      const url =
        note.reactionEmojis?.[local ? `${name}@.` : `${name}@${host}`] ??
        note.reactionEmojis?.[name] ??
        (local ? `${server}/emoji/${encodeURIComponent(name)}.webp` : null);
      return {
        name: `:${name}:`,
        // Only the reader's own server's custom emoji can be sent back.
        ...(local ? { key: `:${name}:` } : {}),
        count,
        url,
        me: note.myReaction === key,
      };
    });
}

/** Whether a note is a bare renote (Misskey's boost) rather than a quote. */
export function isPureRenote(note: MkNote): boolean {
  return !!note.renote && !note.text && !note.cw && !(note.files?.length ?? 0) && !note.poll;
}

function noteUrl(note: MkNote, server: string): string {
  return `${server}/notes/${note.id}`;
}

/** Adapt one note. `server` is the origin of the reader's own Misskey server. */
export function adaptMisskeyNote(note: MkNote, server: string): Status {
  if (isPureRenote(note) && note.renote) {
    const inner = adaptMisskeyNote(note.renote, server);
    return {
      ...baseStatus(note, server),
      content: '',
      reblog: inner,
      reblogs_count: inner.reblogs_count,
    };
  }
  return baseStatus(note, server);
}

function baseStatus(note: MkNote, server: string): Status {
  const ctx = { server, authorHost: note.user.host };
  const files = note.files ?? [];
  const reactions = adaptReactions(note, server);
  const ref: MisskeyRef = { server, noteId: note.id };
  const quoted = note.renote && !isPureRenote(note) ? adaptMisskeyNote(note.renote, server) : null;
  return {
    provider: 'misskey',
    providerRef: ref,
    id: `${MK_ID_PREFIX}${note.id}`,
    uri: note.uri ?? noteUrl(note, server),
    created_at: note.createdAt,
    edited_at: null,
    content: mfmToHtml(note.text, ctx),
    // Custom emoji in the text and in the author's name both resolve through
    // the card's emoji pipe, which reads this one list.
    emojis: emojiList({ ...(note.user.emojis ?? {}), ...(note.emojis ?? {}) }),
    spoiler_text: note.cw ?? '',
    visibility: mastodonVisibility(note.visibility),
    url: noteUrl(note, server),
    account: adaptMisskeyUser(note.user, server),
    reblog: null,
    quote: quoted ? { state: 'accepted', quoted_status: quoted } : null,
    in_reply_to_id: note.replyId ? `${MK_ID_PREFIX}${note.replyId}` : null,
    in_reply_to_account_id: note.reply ? `${MK_ID_PREFIX}${note.reply.userId}` : null,
    replies_count: note.repliesCount ?? 0,
    reblogs_count: note.renoteCount ?? 0,
    favourites_count: reactions.reduce((sum, reaction) => sum + reaction.count, 0),
    favourited: !!note.myReaction,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: note.cw != null || files.some((file) => file.isSensitive),
    poll: note.poll ? adaptPoll(note.poll, note.id) : null,
    quote_approval_policy: null,
    // Misskey notes carry no language; detection decides.
    language: null,
    media_attachments: files.map(adaptFile),
    card: null,
    mentions: [],
    tags: (note.tags ?? []).map((tag) => ({
      name: tag,
      url: `${server}/search?q=${encodeURIComponent(`#${tag}`)}`,
    })),
    ...(reactions.length ? { reactions } : {}),
  };
}

/**
 * Misskey notification type → the Mastodon type the notifications page renders.
 * Replies and quotes arrive as mentions, as Bluesky's do; a reaction is the
 * nearest thing to a favourite.
 */
const NOTIFICATION_TYPES: Readonly<Record<string, string>> = {
  follow: 'follow',
  mention: 'mention',
  reply: 'mention',
  quote: 'mention',
  renote: 'reblog',
  reaction: 'favourite',
  receiveFollowRequest: 'follow_request',
};

/** Adapt one notification; null for a type this client does not show or one with no actor. */
export function adaptMisskeyNotification(
  notification: MkNotification,
  server: string,
): MastodonNotification | null {
  const type = NOTIFICATION_TYPES[notification.type];
  if (!type || !notification.user) return null;
  // A renote notification carries the renote; the reader's own note is inside it.
  const note =
    notification.type === 'renote'
      ? (notification.note?.renote ?? notification.note)
      : notification.note;
  return {
    id: `${MK_ID_PREFIX}${notification.id}`,
    type,
    created_at: notification.createdAt,
    account: adaptMisskeyUser(notification.user, server),
    ...(note ? { status: adaptMisskeyNote(note, server) } : {}),
  };
}
