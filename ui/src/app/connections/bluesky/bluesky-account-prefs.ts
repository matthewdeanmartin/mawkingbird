import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BlueskyApi } from './bluesky-api';
import { BlueskyModeration } from './bluesky-moderation';
import {
  BlueskyPreferences,
  BskyPreference,
  FEED_VIEW_PREF,
  INTERESTS_PREF,
  POST_INTERACTION_PREF,
  THREAD_VIEW_PREF,
} from './bluesky-preferences';
import type { BskyPostControlsValue } from './bluesky-post-controls';
import { BskyHomeFeedPrefs, BskyThreadSort, prefFromControls } from './bluesky-reading-prefs';
import { BlueskySession } from './bluesky-session';

const VISIBILITY = 'app.bsky.actor.contentVisibilityDeclaration';
const SELF_LABELS = 'com.atproto.label.defs#selfLabels';

/**
 * bsky.app's interest topics, by the tag it stores. Bluesky uses them to pick
 * suggested people and feeds.
 */
export const BSKY_INTERESTS: readonly { tag: string; name: string }[] = [
  { tag: 'animals', name: 'Animals' },
  { tag: 'art', name: 'Art' },
  { tag: 'books', name: 'Books' },
  { tag: 'comedy', name: 'Comedy' },
  { tag: 'comics', name: 'Comics' },
  { tag: 'culture', name: 'Culture' },
  { tag: 'dev', name: 'Software development' },
  { tag: 'education', name: 'Education' },
  { tag: 'food', name: 'Food' },
  { tag: 'gaming', name: 'Video games' },
  { tag: 'journalism', name: 'Journalism' },
  { tag: 'movies', name: 'Movies' },
  { tag: 'music', name: 'Music' },
  { tag: 'nature', name: 'Nature' },
  { tag: 'news', name: 'News' },
  { tag: 'pets', name: 'Pets' },
  { tag: 'photography', name: 'Photography' },
  { tag: 'politics', name: 'Politics' },
  { tag: 'science', name: 'Science' },
  { tag: 'sports', name: 'Sports' },
  { tag: 'tech', name: 'Tech' },
  { tag: 'tv', name: 'TV' },
  { tag: 'writers', name: 'Writers' },
];

/** The account settings the Bluesky preferences page shows, read together. */
export interface BskyAccountSettings {
  interests: string[];
  hiddenFromRecommendations: boolean;
  bot: boolean;
}

/**
 * Bluesky account settings that live in the account, so bsky.app shows the
 * same: the Following feed and thread preferences, default reply and quote
 * controls, interests (all in the preferences list, written through
 * {@link BlueskyPreferences}), whether the account asks not to be recommended
 * (its `contentVisibilityDeclaration` record) and whether it says it is
 * automated (a `bot` self-label on its profile record).
 *
 * Every preferences write is handed back to {@link BlueskyModeration}, so
 * feeds, threads and the composer follow at once.
 */
@Injectable({ providedIn: 'root' })
export class BlueskyAccountPrefs {
  private api = inject(BlueskyApi);
  private prefs = inject(BlueskyPreferences);
  private moderation = inject(BlueskyModeration);
  private session = inject(BlueskySession);

  async load(): Promise<BskyAccountSettings> {
    const [preferences, hidden, profile] = await Promise.all([
      this.prefs.read(),
      this.readVisibility(),
      firstValueFrom(this.api.getOwnProfileRecord()),
    ]);
    this.moderation.applyWritten(preferences);
    const interests = preferences.find((p) => p.$type === INTERESTS_PREF)?.['tags'];
    return {
      interests: Array.isArray(interests) ? (interests as string[]) : [],
      hiddenFromRecommendations: hidden,
      bot: selfLabels(profile.value['labels']).includes('bot'),
    };
  }

  async setHomeFeed(value: BskyHomeFeedPrefs): Promise<void> {
    await this.write(
      (p) => p.$type === FEED_VIEW_PREF && p['feed'] === 'home',
      (current) => ({ ...current, $type: FEED_VIEW_PREF, feed: 'home', ...value }),
    );
  }

  async setThreadSort(sort: BskyThreadSort): Promise<void> {
    await this.write(THREAD_VIEW_PREF, (current) => ({
      ...current,
      $type: THREAD_VIEW_PREF,
      sort,
    }));
  }

  async setPostDefaults(value: BskyPostControlsValue): Promise<void> {
    await this.write(POST_INTERACTION_PREF, (current) => prefFromControls(value, current));
  }

  async setInterests(tags: readonly string[]): Promise<void> {
    await this.write(INTERESTS_PREF, (current) => ({
      ...current,
      $type: INTERESTS_PREF,
      tags: [...new Set(tags)].slice(0, 100),
      updatedAt: new Date().toISOString(),
    }));
  }

  /** Ask apps and feeds not to recommend this account's posts. */
  async setHiddenFromRecommendations(hidden: boolean): Promise<void> {
    await firstValueFrom(
      this.api.request('com.atproto.repo.putRecord', {
        repo: this.did(),
        collection: VISIBILITY,
        rkey: 'self',
        record: { $type: VISIBILITY, hideFromAlgorithmicRecommendations: hidden },
      }),
    );
  }

  /** Add or remove the `bot` self-label, keeping any other self-labels. */
  async setBot(bot: boolean): Promise<void> {
    const current = await firstValueFrom(this.api.getOwnProfileRecord());
    const others = selfLabels(current.value['labels']).filter((val) => val !== 'bot');
    const values = bot ? [...others, 'bot'] : others;
    const { labels: _old, ...rest } = current.value;
    await firstValueFrom(
      this.api.putProfile(
        values.length
          ? { ...rest, labels: { $type: SELF_LABELS, values: values.map((val) => ({ val })) } }
          : rest,
        current.cid || undefined,
      ),
    );
  }

  private async write(
    match: string | ((pref: BskyPreference) => boolean),
    edit: (current: BskyPreference | undefined) => BskyPreference,
  ): Promise<void> {
    this.moderation.applyWritten(await this.prefs.edit(match, edit));
  }

  private async readVisibility(): Promise<boolean> {
    const params = new HttpParams()
      .set('repo', this.did())
      .set('collection', VISIBILITY)
      .set('rkey', 'self');
    try {
      const { value } = await firstValueFrom(
        this.api.get<{ value: { hideFromAlgorithmicRecommendations?: boolean } }>(
          'com.atproto.repo.getRecord',
          params,
        ),
      );
      return value.hideFromAlgorithmicRecommendations === true;
    } catch (error: unknown) {
      const code =
        error instanceof HttpErrorResponse
          ? (error.error as { error?: string } | null)?.error
          : undefined;
      if (code === 'RecordNotFound' || (error instanceof HttpErrorResponse && error.status === 404))
        return false;
      throw error;
    }
  }

  private did(): string {
    const did = this.session.session()?.did;
    if (!did) throw new Error('No Bluesky account is linked.');
    return did;
  }
}

function selfLabels(labels: unknown): string[] {
  const values = (labels as { values?: { val?: string }[] } | undefined)?.values;
  return Array.isArray(values)
    ? values.map((v) => v.val).filter((v): v is string => typeof v === 'string')
    : [];
}
