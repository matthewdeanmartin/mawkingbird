import { Status } from '../platform/api/models';

/** Preserve other people's boosts; remove only the viewer's undone boost. */
export function reconcileStatus(list: Status[], updated: Status, viewerId?: string): Status[] {
  return list.flatMap((status) => {
    if (status.reblog?.id === updated.id) {
      if (status.account.id === viewerId && status.reblog.reblogged && !updated.reblogged)
        return [];
      return [{ ...status, reblog: updated }];
    }
    return [status.id === updated.id ? updated : status];
  });
}

/** A delete-and-repost: the post that is gone, and the one published in its stead. */
export interface StatusReplacement {
  previous: Status;
  next: Status;
}

/**
 * Put a reposted status where the deleted one was. Boosts of the deleted post
 * went with it, and a copy of the new post that already arrived (streaming) is
 * dropped, so it is listed once.
 */
export function replaceStatus(list: Status[], { previous, next }: StatusReplacement): Status[] {
  const gone = (previous.reblog ?? previous).id;
  const at = list.findIndex((s) => (s.reblog ?? s).id === gone);
  if (at < 0) return list;
  const keep = (s: Status) => s.id !== next.id && (s.reblog ?? s).id !== gone;
  return [...list.slice(0, at).filter(keep), next, ...list.slice(at + 1).filter(keep)];
}

/**
 * Put a new reply directly under the post it answers. When that post is not in
 * the list (it is the focused post above it), the reply goes first.
 */
export function insertReply(
  list: Status[],
  reply: Status,
  parentId: string | null = reply.in_reply_to_id,
): Status[] {
  const rest = list.filter((s) => s.id !== reply.id);
  const at = rest.findIndex((s) => s.id === parentId) + 1;
  return [...rest.slice(0, at), reply, ...rest.slice(at)];
}
