import { Status } from '../platform/api/models';

/**
 * Reply-guy controls: the pure part.
 *
 * A "reply guy" is someone the recipient does not follow. Following is the
 * signal "I want to interact with this person"; whether they follow back is
 * not part of it (owner, 2026-11-21), and neither is content-warning trust,
 * which is a separate judgement about what someone posts.
 *
 * How a card treats its author:
 * - `off`: nothing, the default everywhere outside a conversation.
 * - `chip`: a quiet "you don't follow" chip beside the handle.
 * - `guard`: the chip, plus the virtual content warning when the reader keeps
 *   it on. Only replies in a conversation the reader is part of get this.
 */
export type ReplyGuyMode = 'off' | 'chip' | 'guard';

/**
 * Notification types that put someone else's words in front of the reader.
 * Bluesky and Misskey map their replies and quotes onto `mention`; Mastodon
 * 4.5 sends quotes as `quote`.
 */
const INCOMING_TYPES: ReadonlySet<string> = new Set(['mention', 'reply', 'quote']);

export function isIncomingConversation(type: string | undefined | null): boolean {
  return !!type && INCOMING_TYPES.has(type);
}

/**
 * Ids of the statuses that sit below one of the reader's own posts.
 *
 * Walks each status up its `in_reply_to_id` chain through the statuses we
 * have. A reply to a reply to you is still in your conversation, which is
 * where reply guys pile in. The walk stops at an unknown parent or a cycle.
 */
export function belowMine(
  statuses: readonly Status[],
  isMine: (status: Status) => boolean,
): Set<string> {
  const byId = new Map(statuses.map((status) => [status.id, status]));
  const result = new Set<string>();
  for (const status of statuses) {
    const seen = new Set<string>([status.id]);
    let parentId = status.in_reply_to_id;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      if (isMine(parent)) {
        result.add(status.id);
        break;
      }
      parentId = parent.in_reply_to_id;
    }
  }
  return result;
}

/**
 * The mode for one card in a thread.
 *
 * A post that is not a reply (the thread's root) never gets a chip: whoever
 * started the conversation is not replying to anyone. Neither does the root's
 * author answering in their own thread.
 */
export function threadReplyGuyMode(
  status: Status,
  rootAuthorId: string | null,
  inMyConversation: boolean,
): ReplyGuyMode {
  if (!status.in_reply_to_id) return 'off';
  if (rootAuthorId && status.account.id === rootAuthorId) return 'off';
  return inMyConversation ? 'guard' : 'chip';
}

/** Fewer than this many stay individually guarded; this many or more fold into one row. */
export const REPLY_GUY_COLLAPSE_MIN = 3;

/**
 * Replies to fold into one "N replies from people you don't follow" row.
 *
 * A reply is folded with its whole sub-thread, and only when every post in
 * that sub-thread is guarded and by someone the reader definitely does not
 * follow. One post by the reader, by someone they follow, or by someone not
 * yet looked up keeps the branch in place: a conversation the reader is part
 * of never disappears. Below {@link REPLY_GUY_COLLAPSE_MIN} nothing folds.
 */
export function collapsibleReplyGuys(
  statuses: readonly Status[],
  guarded: (status: Status) => boolean,
  stranger: (status: Status) => boolean,
  min = REPLY_GUY_COLLAPSE_MIN,
): Set<string> {
  const children = new Map<string, Status[]>();
  for (const status of statuses) {
    if (!status.in_reply_to_id) continue;
    const list = children.get(status.in_reply_to_id) ?? [];
    list.push(status);
    children.set(status.in_reply_to_id, list);
  }
  const byId = new Map(statuses.map((status) => [status.id, status]));
  const foldable = (status: Status): boolean => guarded(status) && stranger(status);

  const folded = new Set<string>();
  for (const status of statuses) {
    if (!foldable(status)) continue;
    // Only the top of a run of strangers starts a branch; the rest ride along.
    const parent = status.in_reply_to_id ? byId.get(status.in_reply_to_id) : undefined;
    if (parent && foldable(parent)) continue;
    const branch: string[] = [];
    const stack = [status];
    const seen = new Set<string>();
    let whole = true;
    while (stack.length) {
      const next = stack.pop()!;
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      if (!foldable(next)) {
        whole = false;
        break;
      }
      branch.push(next.id);
      stack.push(...(children.get(next.id) ?? []));
    }
    if (whole) for (const id of branch) folded.add(id);
  }
  return folded.size >= min ? folded : new Set();
}
