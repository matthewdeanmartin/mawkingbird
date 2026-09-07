import { inject, Injectable, signal } from '@angular/core';
import { AnonymousHomeFeedCache } from './anonymous-home-feed-cache';

const STORAGE_KEY = 'mockingbird_anonymous_preferences';
const STATE_VERSION = 1;
export const DEFAULT_FOLLOWED_POST_MAX_AGE_DAYS = 365;

interface AnonymousPreferenceState {
  version: typeof STATE_VERSION;
  followedPostMaxAgeDays: number;
}

function load(): AnonymousPreferenceState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<AnonymousPreferenceState> | null;
    const days = parsed?.followedPostMaxAgeDays;
    if (
      parsed?.version === STATE_VERSION &&
      typeof days === 'number' &&
      Number.isInteger(days) &&
      days > 0
    ) {
      return { version: STATE_VERSION, followedPostMaxAgeDays: days };
    }
  } catch {
    // Fall through to the default.
  }
  return { version: STATE_VERSION, followedPostMaxAgeDays: DEFAULT_FOLLOWED_POST_MAX_AGE_DAYS };
}

/** Browser-local preferences that apply only to the Anonymous identity. */
@Injectable({ providedIn: 'root' })
export class AnonymousPreferences {
  private homeCache = inject(AnonymousHomeFeedCache);
  private state = load();

  readonly followedPostMaxAgeDays = signal(this.state.followedPostMaxAgeDays);

  setFollowedPostMaxAgeDays(days: number): void {
    if (!Number.isInteger(days) || days <= 0 || days === this.followedPostMaxAgeDays()) return;
    this.state = { version: STATE_VERSION, followedPostMaxAgeDays: days };
    this.followedPostMaxAgeDays.set(days);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    // The cached Home snapshot may contain posts outside the new window.
    this.homeCache.invalidate();
  }

  allowsFollowedPost(createdAt: string, now = Date.now()): boolean {
    const created = Date.parse(createdAt);
    if (!Number.isFinite(created)) return false;
    return created >= now - this.followedPostMaxAgeDays() * 24 * 60 * 60 * 1000;
  }
}
