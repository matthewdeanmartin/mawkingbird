import { Injectable } from '@angular/core';
import { DiagnoseOptions, ProviderSlice } from '../feed-doctor';

/** How long a checkup stays good: Home's make-up changes slowly (owner, 2026-11-26). */
export const CHECKUP_TTL_MS = 60 * 60 * 1000;

/** Everything the checkup page needs to show a result again without sampling. */
export interface CheckupResult {
  scope: string;
  /** When the sample was collected, in ms. */
  at: number;
  input: DiagnoseOptions;
  slices: ProviderSlice[];
  droppedByWindow: number;
  usingHomeSnapshot: boolean;
}

/**
 * The last feed checkup, per account, for an hour. A sample is ~140 posts and
 * several requests, and every visit used to wait for a fresh one. In memory
 * only: a reload samples again, and nothing about the feed is stored.
 */
@Injectable({ providedIn: 'root' })
export class FeedCheckupCache {
  private last: CheckupResult | null = null;

  get(scope: string, now = Date.now()): CheckupResult | null {
    const last = this.last;
    return last && last.scope === scope && now - last.at < CHECKUP_TTL_MS ? last : null;
  }

  set(result: CheckupResult): void {
    this.last = result;
  }
}
