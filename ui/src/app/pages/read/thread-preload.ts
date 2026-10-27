import { Injectable } from '@angular/core';
import { Status } from '../../models';

/** A conversation already in hand, in the shape {@link ThreadLoader} publishes. */
export interface PreloadedThread {
  status: Status;
  ancestors: Status[];
  descendants: Status[];
}

/**
 * A thread handed to the thread page so it does not fetch what the caller
 * already has. Forum offers a discussion its scan assembled, including replies
 * read from other servers that a fresh context call to mine would not return.
 * One offer, consumed by the next load of that id (and dropped by any other).
 */
@Injectable({ providedIn: 'root' })
export class ThreadPreload {
  private offered: { id: string; thread: PreloadedThread } | null = null;

  offer(id: string, thread: PreloadedThread): void {
    this.offered = { id, thread };
  }

  take(id: string): PreloadedThread | null {
    const offered = this.offered;
    this.offered = null;
    return offered?.id === id ? offered.thread : null;
  }
}
