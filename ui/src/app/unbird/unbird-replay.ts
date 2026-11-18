import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Api } from '../platform/api/api';
import { tweetMedia } from './archive-media';
import {
  NATIVE_REPLAY_CAP,
  ReplayUnit,
  replayText,
  SCHEDULE_LEAD_MS,
  WEB_REPLAY_CAP,
} from './replay-plan';
import type { UnbirdTweet } from './unbird-archive';
import { UnbirdMatcher } from './unbird-matcher';
import { ReplayEntry, UnbirdStore } from './unbird-store';

/**
 * Posts chosen tweets to Mastodon on a schedule, and remembers what it did.
 *
 * Two ways a post goes out, because Mastodon's scheduler cannot hold a thread
 * (a scheduled post has no id to reply to until it is published):
 *
 * - a **single post** is handed to the server's scheduler right away, so it
 *   appears on time with every tab closed;
 * - a **thread** waits in the ledger and is posted in order, each part
 *   replying to the last, the next time Unbird is open after its time.
 *
 * The ledger (IndexedDB, per archive and per Mastodon account) is what keeps
 * this resumable and idempotent: a tweet already scheduled or posted is never
 * sent again, and each request carries an `Idempotency-Key` so a retry after a
 * dropped connection cannot double-post. Mastodon holds at most 300 scheduled
 * posts; a longer Native queue stays local and tops the server up as slots
 * free, never more than the server will take.
 */

export interface QueueOptions {
  visibility: ReplayEntry['visibility'];
  dateLine: boolean;
  /** Attach photos from the archive picked this visit. */
  media: boolean;
}

const SERVER_SCHEDULE_LIMIT = 300;
const MISSING = 'The tweet is no longer in this archive.';

@Injectable({ providedIn: 'root' })
export class UnbirdReplay {
  private readonly api = inject(Api);
  private readonly store = inject(UnbirdStore);
  private readonly matcher = inject(UnbirdMatcher);

  /** The ledger for the current archive and account. */
  readonly entries = signal<readonly ReplayEntry[]>([]);
  readonly running = signal(false);
  readonly lastError = signal<string | null>(null);
  /** The Mastodon account the ledger belongs to (`acct@server`). */
  readonly account = signal<string | null>(null);

  readonly cap = this.matcher.native ? NATIVE_REPLAY_CAP : WEB_REPLAY_CAP;
  readonly queued = computed(() => this.entries().filter((entry) => entry.state !== 'failed'));
  readonly counts = computed(() => {
    const counts = { planned: 0, scheduled: 0, posted: 0, failed: 0 };
    for (const entry of this.entries()) counts[entry.state]++;
    return counts;
  });
  readonly room = computed(() => Math.max(0, this.cap - this.queued().length));

  /** Load the ledger for this archive and account. */
  async load(account: string): Promise<void> {
    this.account.set(account);
    const archive = this.matcher.currentId();
    const all = archive ? await this.store.loadReplay(archive) : [];
    this.entries.set(all.filter((entry) => entry.account === account));
  }

  isQueued(tweetId: string): boolean {
    return this.entries().some((entry) => entry.tweetId === tweetId && entry.state !== 'failed');
  }

  /** Add units at the given times, then hand what can go to the server. */
  async queue(
    units: readonly ReplayUnit[],
    times: readonly Date[],
    options: QueueOptions,
  ): Promise<void> {
    const account = this.account();
    const archive = this.matcher.currentId();
    if (!account || !archive) return;
    const added: ReplayEntry[] = [];
    units.forEach((unit, unitIndex) => {
      unit.tweets.forEach((tweet, index) => {
        if (this.isQueued(tweet.id)) return;
        added.push({
          tweetId: tweet.id,
          unitId: unit.id,
          index,
          // Thread parts share the unit's time; they post together, in order.
          at: times[unitIndex].toISOString(),
          account,
          visibility: options.visibility,
          dateLine: options.dateLine,
          media: options.media,
          state: 'planned',
        });
      });
    });
    const room = this.room();
    const kept = added.slice(0, room);
    await this.store.saveReplay(archive, kept);
    this.entries.update((entries) => [
      ...entries.filter((e) => !kept.some((k) => k.tweetId === e.tweetId)),
      ...kept,
    ]);
    await this.run();
  }

  /**
   * Do what is due: schedule planned single posts while the server has room,
   * and post threads (or anything else) whose time has come.
   */
  async run(now = new Date()): Promise<void> {
    if (this.running()) return;
    this.running.set(true);
    this.lastError.set(null);
    try {
      const tweets = new Map(
        (this.matcher.archive()?.tweets ?? []).map((tweet) => [tweet.id, tweet]),
      );
      let serverRoom = SERVER_SCHEDULE_LIMIT - this.counts().scheduled;
      const units = groupUnits(this.entries().filter((entry) => entry.state === 'planned'));
      for (const unit of units) {
        const at = new Date(unit[0].at);
        const due = at.getTime() <= now.getTime() + SCHEDULE_LEAD_MS;
        const single = unit.length === 1 && unit[0].index === 0 && !this.hasMoreParts(unit[0]);
        if (due) {
          await this.postNow(unit, tweets);
        } else if (single && serverRoom > 0) {
          await this.schedule(unit[0], tweets);
          serverRoom--;
        }
        if (this.lastError()) break;
      }
    } finally {
      this.running.set(false);
    }
  }

  /** Cancel everything not yet posted: scheduled posts are withdrawn from the server. */
  async cancelAll(): Promise<void> {
    const archive = this.matcher.currentId();
    if (!archive) return;
    const pending = this.entries().filter(
      (entry) =>
        entry.state === 'planned' || entry.state === 'scheduled' || entry.state === 'failed',
    );
    for (const entry of pending) {
      if (entry.scheduledId) {
        try {
          await firstValueFrom(this.api.cancelScheduledStatus(entry.scheduledId));
        } catch {
          // Already published or gone; the ledger forgets it either way.
        }
      }
    }
    await this.store.deleteReplay(archive, pending);
    this.entries.update((entries) => entries.filter((entry) => !pending.includes(entry)));
  }

  private hasMoreParts(entry: ReplayEntry): boolean {
    return this.entries().some((other) => other.unitId === entry.unitId && other.index > 0);
  }

  private optionsFor(entry: ReplayEntry): QueueOptions {
    return {
      visibility: entry.visibility,
      dateLine: entry.dateLine !== false,
      media: entry.media !== false,
    };
  }

  private async mediaIds(tweet: UnbirdTweet, options: QueueOptions): Promise<string[]> {
    const picked = this.matcher.picked;
    if (!options.media || !tweet.media || !picked) return [];
    const ids: string[] = [];
    for (const file of await tweetMedia(picked, tweet.id)) {
      const media = await firstValueFrom(this.api.uploadMedia(file));
      ids.push(media.id);
    }
    return ids;
  }

  private async schedule(entry: ReplayEntry, tweets: Map<string, UnbirdTweet>): Promise<void> {
    const tweet = tweets.get(entry.tweetId);
    if (!tweet) return this.fail(entry, MISSING);
    const options = this.optionsFor(entry);
    try {
      const scheduled = (await firstValueFrom(
        this.api.postStatus(
          replayText(tweet, 0, { dateLine: options.dateLine }),
          {
            visibility: entry.visibility,
            scheduledAt: entry.at,
            mediaIds: await this.mediaIds(tweet, options),
          },
          `unbird-${entry.account}-${entry.tweetId}`,
        ),
      )) as unknown as { id: string };
      await this.save({ ...entry, state: 'scheduled', scheduledId: scheduled.id });
    } catch (error) {
      await this.fail(entry, error);
    }
  }

  private async postNow(
    unit: readonly ReplayEntry[],
    tweets: Map<string, UnbirdTweet>,
  ): Promise<void> {
    // A thread continues from its last posted part, so a stop mid-thread resumes.
    const ordered = [...this.entries()]
      .filter((entry) => entry.unitId === unit[0].unitId)
      .sort((left, right) => left.index - right.index);
    let previous: string | undefined;
    for (const entry of ordered) {
      if (entry.state === 'posted') {
        previous = entry.statusId;
        continue;
      }
      if (entry.state !== 'planned') return;
      const tweet = tweets.get(entry.tweetId);
      if (!tweet) return this.fail(entry, MISSING);
      const options = this.optionsFor(entry);
      try {
        const status = await firstValueFrom(
          this.api.postStatus(
            replayText(tweet, entry.index, { dateLine: options.dateLine }),
            {
              visibility: entry.visibility,
              inReplyToId: previous,
              mediaIds: await this.mediaIds(tweet, options),
            },
            `unbird-${entry.account}-${entry.tweetId}`,
          ),
        );
        previous = status.id;
        await this.save({ ...entry, state: 'posted', statusId: status.id });
      } catch (error) {
        return this.fail(entry, error);
      }
    }
  }

  private async save(entry: ReplayEntry): Promise<void> {
    const archive = this.matcher.currentId();
    if (archive) await this.store.saveReplay(archive, [entry]);
    this.entries.update((entries) =>
      entries.map((existing) => (existing.tweetId === entry.tweetId ? entry : existing)),
    );
  }

  /**
   * Stop this run. A refusal (422, or the tweet is gone) fails the entry; a
   * rate limit or a dropped connection leaves it planned for the next run.
   */
  private async fail(entry: ReplayEntry, error: unknown): Promise<void> {
    const message = error === MISSING ? MISSING : describe(error);
    this.lastError.set(message);
    const status = (error as HttpErrorResponse)?.status;
    if (error === MISSING || status === 422) {
      await this.save({ ...entry, state: 'failed', error: message });
    }
  }
}

/** Planned entries grouped by unit, earliest unit first. */
function groupUnits(entries: readonly ReplayEntry[]): ReplayEntry[][] {
  const units = new Map<string, ReplayEntry[]>();
  for (const entry of entries) units.set(entry.unitId, [...(units.get(entry.unitId) ?? []), entry]);
  return [...units.values()]
    .map((unit) => unit.sort((left, right) => left.index - right.index))
    .sort((left, right) => left[0].at.localeCompare(right[0].at));
}

function describe(error: unknown): string {
  const status = (error as HttpErrorResponse)?.status;
  if (status === 429) return 'The server asked us to slow down. The rest will go out later.';
  if (status === 422) {
    const message = (error as HttpErrorResponse).error?.error;
    return typeof message === 'string' ? message : 'The server refused this post.';
  }
  return 'Could not reach your server. The rest will go out later.';
}
