import { translatedComputed } from '../i18n/translated';
import {
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { MbButton } from '../design-system/button/button';
import { MbCheckbox } from '../design-system/checkbox/checkbox';
import { MbControl, MbField } from '../design-system/field/field';
import { MbNotice } from '../design-system/notice/notice';
import { MbSection } from '../design-system/page-header/page-header';
import { MbRadioGroup, RadioOption } from '../design-system/radio-group/radio-group';
import { MbToolbar, MbToolbarButton } from '../design-system/toolbar/toolbar';
import { Api } from '../platform/api/api';
import { Server } from '../platform/http/server';
import { Auth } from '../platform/session/auth';
import { MastodonMe } from '../connections/mastodon/mastodon-me';
import {
  planTimes,
  postCount,
  replayText,
  ReplaySuggestion,
  ReplayUnit,
  replayUnits,
  suggest,
  unitFits,
} from './replay-plan';
import { UnbirdMatcher } from './unbird-matcher';
import { UnbirdReplay } from './unbird-replay';
import type { ReplayEntry } from './unbird-store';

// i18n unbird.posts.lead: Bring a few of your best tweets to Mastodon, a little at a time. Replies to other people and retweets stay behind, and @names lose their @ so nobody gets pinged.
// i18n unbird.posts.suggest: Suggest
// i18n unbird.posts.suggest.best: Most liked
// i18n unbird.posts.suggest.media: With photos
// i18n unbird.posts.suggest.threads: Threads
// i18n unbird.posts.suggest.oldest: Oldest first
// i18n unbird.posts.suggest.newest: Newest first
// i18n unbird.posts.selectTop: Select the top {{count}}
// i18n unbird.posts.clear: Clear selection
// i18n unbird.posts.selected: {{posts}} posts selected · room for {{room}} more
// i18n unbird.posts.likes: {{count}} likes
// i18n unbird.posts.thread: thread of {{count}}
// i18n unbird.posts.photos: {{count}} photo or video
// i18n unbird.posts.tooLong: Too long for your server
// i18n unbird.posts.queued: Queued
// i18n unbird.posts.more: Show more
// i18n unbird.posts.schedule.title: Schedule
// i18n unbird.posts.schedule.perDay: Posts per day
// i18n unbird.posts.schedule.start: Starting
// i18n unbird.posts.schedule.visibility: Who sees them
// i18n unbird.posts.visibility.unlisted: Quiet public (your followers and profile, not public timelines)
// i18n unbird.posts.visibility.public: Public
// i18n unbird.posts.visibility.private: Followers only
// i18n unbird.posts.schedule.dateLine: Add "(From Twitter, date)" to each post
// i18n unbird.posts.schedule.media: Include photos
// i18n unbird.posts.schedule.mediaNeedsArchive: To include photos, choose your archive again on the Start tab this visit; otherwise posts go out as text.
// i18n unbird.posts.schedule.go: Schedule {{count}} posts
// i18n unbird.posts.schedule.ends: Last one on {{date}}.
// i18n unbird.posts.queue.title: Your replay
// i18n unbird.posts.queue.scheduled: {{count}} scheduled on your server: they post on time even with this closed
// i18n unbird.posts.queue.planned: {{count}} waiting: threads, and anything beyond your server's 300 scheduled posts, go out when Unbird is open
// i18n unbird.posts.queue.posted: {{count}} posted
// i18n unbird.posts.queue.failed: {{count}} refused by your server
// i18n unbird.posts.queue.runNow: Post what is due now
// i18n unbird.posts.queue.cancel: Cancel everything not yet posted
// i18n unbird.posts.queue.next: Next: {{date}}
// i18n unbird.posts.needAccount: Replaying tweets needs a Mastodon account. Sign in, or find a server on the People tab.
// i18n unbird.posts.signIn: Sign in with Mastodon

const PAGE = 50;

/**
 * Unbird's Posts tab: pick a best-of from the archive and drip it onto
 * Mastodon. Quiet by default (unlisted), a few a day, capped at what
 * Mastodon's scheduler holds.
 */
@Component({
  selector: 'app-unbird-posts',
  imports: [
    FormsModule,
    MbButton,
    MbCheckbox,
    MbControl,
    MbField,
    MbNotice,
    MbRadioGroup,
    MbSection,
    MbToolbar,
    MbToolbarButton,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './unbird-posts.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './unbird-posts.css',
})
export class UnbirdPosts implements OnInit {
  protected readonly matcher = inject(UnbirdMatcher);
  protected readonly replay = inject(UnbirdReplay);
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly mastodonMe = inject(MastodonMe);
  private readonly server = inject(Server);
  private readonly i18n = inject(TranslocoService);

  protected readonly signedIn = computed(
    () => !this.auth.lacksMastodonToken && !this.auth.isAnonymous && !!this.auth.account(),
  );
  protected readonly limit = signal(500);
  protected readonly suggestion = signal<ReplaySuggestion>('best');
  protected readonly shown = signal(PAGE);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly perDay = signal(3);
  protected readonly start = signal(tomorrow());
  protected readonly visibility = signal<ReplayEntry['visibility']>('unlisted');
  protected readonly dateLine = signal(true);
  protected readonly media = signal(true);
  protected readonly suggestions: ReplaySuggestion[] = [
    'best',
    'media',
    'threads',
    'oldest',
    'newest',
  ];
  protected readonly visibilityOptions = translatedComputed<RadioOption[]>(() =>
    (['unlisted', 'public', 'private'] as const).map((value) => ({
      value,
      label: this.i18n.translate(`unbird.posts.visibility.${value}`),
    })),
  );

  protected readonly units = computed(() => {
    const archive = this.matcher.archive();
    return archive ? replayUnits(archive) : [];
  });
  protected readonly listed = computed(() => suggest(this.units(), this.suggestion()));
  protected readonly visible = computed(() => this.listed().slice(0, this.shown()));
  protected readonly chosen = computed(() =>
    this.listed().filter((unit) => this.selected().has(unit.id)),
  );
  protected readonly chosenPosts = computed(() => postCount(this.chosen()));
  protected readonly room = computed(() => Math.max(0, this.replay.room() - this.chosenPosts()));
  protected readonly times = computed(() =>
    planTimes(
      [...this.chosen()].sort((left, right) => left.at.localeCompare(right.at)),
      {
        perDay: this.perDay(),
        start: new Date(`${this.start()}T00:00`),
        fromHour: 9,
        toHour: 21,
        now: new Date(),
      },
    ),
  );
  protected readonly nextPlanned = computed(
    () =>
      this.replay
        .entries()
        .filter((entry) => entry.state === 'planned' || entry.state === 'scheduled')
        .map((entry) => entry.at)
        .sort()[0] ?? null,
  );

  constructor() {
    effect(() => {
      const account = this.mastodonMe.account();
      if (!this.signedIn() || !account) return;
      const host = (() => {
        try {
          return new URL(this.server.baseUrl()).host;
        } catch {
          return '';
        }
      })();
      untracked(() => void this.replay.load(`${account.id}@${host}`).then(() => this.replay.run()));
    });
  }

  ngOnInit(): void {
    void this.matcher.restore();
    void firstValueFrom(this.api.instanceInfo())
      .then((info) => {
        const max = info.configuration?.statuses?.max_characters;
        if (typeof max === 'number' && max > 0) this.limit.set(max);
      })
      .catch(() => undefined);
  }

  protected fits(unit: ReplayUnit): boolean {
    return unitFits(unit, this.limit(), this.dateLine());
  }

  protected preview(unit: ReplayUnit): string {
    return replayText(unit.tweets[0], 0, { dateLine: false });
  }

  protected selectable(unit: ReplayUnit): boolean {
    return this.fits(unit) && !this.replay.isQueued(unit.id);
  }

  protected toggle(unit: ReplayUnit, on: boolean): void {
    this.selected.update((selected) => {
      const next = new Set(selected);
      if (on && this.selectable(unit) && unit.tweets.length <= this.room()) next.add(unit.id);
      else next.delete(unit.id);
      return next;
    });
  }

  protected selectTop(count: number): void {
    const next = new Set<string>();
    let posts = 0;
    for (const unit of this.listed()) {
      if (next.size >= count) break;
      if (!this.selectable(unit) || posts + unit.tweets.length > this.replay.room()) continue;
      next.add(unit.id);
      posts += unit.tweets.length;
    }
    this.selected.set(next);
  }

  protected setVisibility(value: string): void {
    if (value === 'public' || value === 'unlisted' || value === 'private') {
      this.visibility.set(value);
    }
  }

  /** Date, likes, thread length and photos, plus why a post cannot be picked. */
  protected unitHint(unit: ReplayUnit): string {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.i18n.translate(`unbird.posts.${key}`, params);
    const parts = [this.date(unit.at)];
    if (unit.likes) parts.push(t('likes', { count: unit.likes }));
    if (unit.tweets.length > 1) parts.push(t('thread', { count: unit.tweets.length }));
    if (unit.media) parts.push(t('photos', { count: unit.media }));
    if (this.replay.isQueued(unit.id)) parts.push(t('queued'));
    else if (!this.fits(unit)) parts.push(t('tooLong'));
    return parts.join(' · ');
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected async scheduleChosen(): Promise<void> {
    const ordered = [...this.chosen()].sort((left, right) => left.at.localeCompare(right.at));
    await this.replay.queue(ordered, this.times(), {
      visibility: this.visibility(),
      dateLine: this.dateLine(),
      media: this.media(),
    });
    this.selected.set(new Set());
  }

  protected date(iso: string | Date | null | undefined): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
  }

  protected dateTime(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
}

function tomorrow(): string {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}
