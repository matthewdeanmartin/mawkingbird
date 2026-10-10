import { Status } from './models';

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
