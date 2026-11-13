import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { Status } from '../platform/api/models';
import { canonicalStatusKey } from '../accounts/anonymous/anonymous-feed-corpus';

export interface ReadingPostChange {
  owner: object;
  status: Status;
  deleted: boolean;
}

/** Live cards, including retained views, share successful user actions, never refetches. */
@Injectable({ providedIn: 'root' })
export class ReadingPostChanges {
  readonly changes = new Subject<ReadingPostChange>();
  private delivering = false;

  publish(change: ReadingPostChange): void {
    // Recipients emit their ordinary output so each owning list updates itself.
    if (this.delivering) return;
    this.delivering = true;
    try {
      this.changes.next(change);
    } finally {
      this.delivering = false;
    }
  }
}

/** Keep the receiving feed's wrapper/namespace when another view updates a post. */
export function reconcileReadingPost(current: Status, changed: Status): Status | null {
  if (canonicalStatusKey(current) !== canonicalStatusKey(changed)) return null;
  const target = current.reblog ?? current;
  const update = changed.reblog ?? changed;
  const merged = {
    ...target,
    ...update,
    id: target.id,
    account: { ...update.account, id: target.account.id },
    provider: target.provider,
    providerRef: target.providerRef,
  };
  return current.reblog ? { ...current, reblog: merged } : merged;
}
