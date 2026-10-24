import { computed, inject, Injectable, signal } from '@angular/core';
import { HomeDefaults } from './home-defaults';
import { FEED_SECTIONS, type FeedSection } from './lists/feed-sections';
import { scopedKey } from './account-scope';
import { ProfileSyncStarter } from './providers/account/profile-sync-starter';

const HOME_ALGO_KEY_BASE = 'mockingbird_home_algo';

export interface FavoriteFeed {
  type: Exclude<FeedSection, 'all'>;
  id: string;
  label: string;
}
export type HomeMode = 'friends' | 'interests' | 'favorite';
export const ALGO_FACTORY = {
  mutual: true,
  boost: true,
  original: true,
  hashtag: true,
  rss: true,
  requireLikes: true,
  excludeOwn: true,
  excludeReplies: true,
  maxCalls: 28,
  targetPosts: 140,
  homePages: 7,
  mutualSample: 11,
  hashtagPages: 3,
  mutualStatusLimit: 28,
  hashtagReserve: 3,
  hashtagCount: 1,
  likeWeight: 1,
  boostWeight: 1,
  replyWeight: 0.5,
  recencyHalfLife: 0,
  mutualWeight: 1,
  originalWeight: 1,
  boostSourceWeight: 1,
  hashtagWeight: 1,
  rssWeight: 1,
};
export type AlgoOptions = typeof ALGO_FACTORY;
export const ALGO_RANGES: Record<string, readonly [number, number, number]> = {
  maxCalls: [1, 100, 1],
  targetPosts: [20, 500, 1],
  homePages: [0, 20, 1],
  mutualSample: [0, 40, 1],
  hashtagPages: [1, 10, 1],
  mutualStatusLimit: [1, 40, 1],
  hashtagReserve: [0, 20, 1],
  hashtagCount: [1, 10, 1],
  likeWeight: [0, 3, 0.1],
  boostWeight: [0, 3, 0.1],
  replyWeight: [0, 3, 0.1],
  recencyHalfLife: [0, 720, 1],
  mutualWeight: [0, 5, 0.1],
  originalWeight: [0, 5, 0.1],
  boostSourceWeight: [0, 5, 0.1],
  hashtagWeight: [0, 5, 0.1],
  rssWeight: [0, 5, 0.1],
};
export interface HomeAlgoOptions {
  mode: HomeMode;
  favorite: FavoriteFeed | null;
  calm: boolean;
  boosts: boolean;
  replies: boolean;
  algo: AlgoOptions;
}
export const HOME_FACTORY: HomeAlgoOptions = {
  mode: 'friends',
  favorite: null,
  calm: false,
  boosts: true,
  replies: false,
  algo: ALGO_FACTORY,
};
export function normalizeHomeAlgo(raw: Partial<HomeAlgoOptions>): HomeAlgoOptions {
  const algo = { ...ALGO_FACTORY };
  for (const key of Object.keys(algo) as (keyof AlgoOptions)[]) {
    const value = raw.algo?.[key];
    if (typeof algo[key] === 'boolean' && typeof value === 'boolean')
      Object.assign(algo, { [key]: value });
    const range = ALGO_RANGES[key];
    if (range && typeof value === 'number' && Number.isFinite(value))
      Object.assign(algo, {
        [key]: Math.max(range[0], Math.min(range[1], range[2] === 1 ? Math.round(value) : value)),
      });
  }
  return {
    mode: ['friends', 'interests', 'favorite'].includes(raw.mode ?? '') ? raw.mode! : 'friends',
    favorite:
      raw.favorite &&
      typeof raw.favorite.id === 'string' &&
      FEED_SECTIONS.some((s) => s.id !== 'all' && s.id === raw.favorite?.type) &&
      typeof raw.favorite.label === 'string'
        ? raw.favorite
        : null,
    calm: typeof raw.calm === 'boolean' ? raw.calm : false,
    boosts: typeof raw.boosts === 'boolean' ? raw.boosts : true,
    replies: typeof raw.replies === 'boolean' ? raw.replies : false,
    algo,
  };
}

/** Lightweight account preferences; provider catalogues stay in lazy routes. */
@Injectable({ providedIn: 'root' })
export class HomeAlgoSettings {
  private defaults = inject(HomeDefaults);
  private sync = inject(ProfileSyncStarter);
  private revision = signal(0);
  readonly scope = this.defaults.scope;
  readonly value = computed(() => {
    this.scope();
    this.revision();
    try {
      return normalizeHomeAlgo(
        JSON.parse(localStorage.getItem(scopedKey(HOME_ALGO_KEY_BASE)) ?? '{}'),
      );
    } catch {
      return normalizeHomeAlgo({});
    }
  });
  save(patch: Partial<HomeAlgoOptions>): boolean {
    try {
      localStorage.setItem(
        scopedKey(HOME_ALGO_KEY_BASE),
        JSON.stringify(normalizeHomeAlgo({ ...this.value(), ...patch })),
      );
      this.revision.update((n) => n + 1);
      this.sync.noteLocalChange();
      return true;
    } catch {
      return false;
    }
  }
}
