import { Component, computed, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbHelp } from '../../design-system/help/help';
import { MbBarItem, MbBarList, MbStatGrid } from '../../design-system/stats/stats';
import { LANG_NAMES, LangShare, sharePct } from '../../language/language-detect';
import { Status } from '../../platform/api/models';
import { EngagedSlot, HOURS, WEEKDAYS, level, postingGrid } from '../engaged-audience';
import { decayTargets } from '../interaction-decay';
import { InteractionDecayScan } from '../interaction-decay-scan';

// i18n engagedAudience.heading: When your audience is around
// i18n engagedAudience.explain: The people who liked, boosted, replied to or mentioned you, from your notifications. These are the people you actually reach.
// i18n engagedAudience.cta: Uses the same read as "When are your posts done?" above.
// i18n engagedAudience.run: Read my notifications
// i18n engagedAudience.reading: Reading notifications… progress is shown above.
// i18n engagedAudience.nothing: No likes, boosts or mentions in the notifications read.
// i18n engagedAudience.tile.people: People who interact
// i18n engagedAudience.tile.reactions: Reactions read
// i18n engagedAudience.best: Busiest times
// i18n engagedAudience.bestSlot: {{day}} {{hour}} · {{people}} people
// i18n engagedAudience.timeZone: Times are in your time zone ({{zone}}).
// i18n engagedAudience.grid.people: People reacting
// i18n engagedAudience.grid.posts: Your posts in the same period
// i18n engagedAudience.grid.cellPeople: {{day}} {{hour}}: {{count}} people
// i18n engagedAudience.grid.cellPosts: {{day}} {{hour}}: {{count}} posts
// i18n engagedAudience.grid.aria: {{title}}. Busiest: {{best}}.
// i18n engagedAudience.byDay: People by weekday
// i18n engagedAudience.languages.replies: Languages they write to you in
// i18n engagedAudience.languages.repliesNote: From {{count}} replies and mentions.
// i18n engagedAudience.languages.bios: Languages of their bios
// i18n engagedAudience.languages.biosNote: From {{count}} bios. A bio is short and often mixed, so this is a rough guide.
// i18n engagedAudience.languages.none: Not enough text to tell.
// i18n engagedAudience.help.about: About {{stat}}
// i18n engagedAudience.help.grid: Each square is an hour of the week. Darker means more different people reacted then; each person counts once per square. A busy square where you rarely post is a good time to try.
// i18n engagedAudience.help.best: The three squares with the most different people reacting.
// i18n engagedAudience.help.languages: Detected from the text of replies and mentions, using the language the writer declared when there is one. Bios use detection only.
// i18n engagedAudience.share: {{pct}}%

/** A Sunday, to name weekdays in the reader's language. */
const A_SUNDAY = new Date(2026, 10, 22);

interface Cell {
  key: number;
  level: number;
  title: string;
}

/**
 * When the people who interact with you are around, and what languages they
 * use. Shares the notification read with the decay panel above it.
 */
@Component({
  selector: 'app-engaged-audience-panel',
  imports: [MbButton, MbBarList, MbHelp, MbStatGrid, TranslocoPipe],
  templateUrl: './engaged-audience-panel.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './engaged-audience-panel.css',
})
export class EngagedAudiencePanel {
  readonly accountId = input.required<string>();
  /** The account's own posts from the analytics sample. */
  readonly posts = input.required<Status[]>();

  protected readonly scan = inject(InteractionDecayScan);
  private readonly transloco = inject(TranslocoService);
  private readonly dictionary = toSignal(this.transloco.selectTranslation());

  protected readonly hourTicks = [0, 3, 6, 9, 12, 15, 18, 21];
  protected readonly zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  protected readonly state = computed(() => {
    const s = this.scan.state();
    return s && s.accountId === this.accountId() ? s : null;
  });

  protected readonly engaged = computed(() => {
    const e = this.state()?.engaged;
    return e && e.reactions > 0 ? e : null;
  });

  private locale(): string {
    this.dictionary();
    return this.transloco.getActiveLang() || 'en';
  }

  protected readonly dayNames = computed(() => {
    const fmt = new Intl.DateTimeFormat(this.locale(), { weekday: 'short' });
    return Array.from({ length: WEEKDAYS }, (_, d) => {
      const date = new Date(A_SUNDAY);
      date.setDate(A_SUNDAY.getDate() + d);
      return fmt.format(date);
    });
  });

  protected readonly hourNames = computed(() => {
    const fmt = new Intl.DateTimeFormat(this.locale(), { hour: 'numeric' });
    return Array.from({ length: HOURS }, (_, h) => fmt.format(new Date(2026, 0, 1, h)));
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.dictionary();
    return this.transloco.translate(`engagedAudience.${key}`, params);
  }

  protected slotText(slot: EngagedSlot): string {
    return this.t('bestSlot', {
      day: this.dayNames()[slot.day],
      hour: this.hourNames()[slot.hour],
      people: slot.people.toLocaleString(),
    });
  }

  private cells(grid: number[][], kind: 'cellPeople' | 'cellPosts'): Cell[][] {
    const peak = Math.max(0, ...grid.flat());
    return grid.map((row, day) =>
      row.map((count, hour) => ({
        key: day * HOURS + hour,
        level: level(count, peak),
        title: this.t(`grid.${kind}`, {
          day: this.dayNames()[day],
          hour: this.hourNames()[hour],
          count: count.toLocaleString(),
        }),
      })),
    );
  }

  protected readonly peopleGrid = computed(() => {
    const e = this.engaged();
    return e ? this.cells(e.grid, 'cellPeople') : [];
  });

  /** Your own posts over the same period the notifications cover. */
  protected readonly postsGrid = computed(() => {
    const since = this.state()?.reachedBack ?? 0;
    const times = this.posts()
      .map((p) => Date.parse(p.created_at))
      .filter((at) => !Number.isNaN(at) && at >= since);
    return this.cells(postingGrid(times), 'cellPosts');
  });

  protected readonly bestText = computed(() =>
    (this.engaged()?.best ?? []).map((slot) => this.slotText(slot)),
  );

  protected readonly byDay = computed<MbBarItem[]>(() =>
    (this.engaged()?.byDay ?? []).map((value, day) => ({
      label: this.dayNames()[day],
      value,
      display: value.toLocaleString(),
    })),
  );

  private langItems(shares: LangShare[]): MbBarItem[] {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([this.locale()], { type: 'language' });
    } catch {
      names = null;
    }
    return shares.slice(0, 8).map((s) => ({
      label: names?.of(s.lang) ?? LANG_NAMES[s.lang],
      value: s.share,
      display: this.t('share', { pct: sharePct(s.share) }),
    }));
  }

  protected readonly replyLanguages = computed(() =>
    this.langItems(this.engaged()?.replyLanguages ?? []),
  );
  protected readonly bioLanguages = computed(() =>
    this.langItems(this.engaged()?.bioLanguages ?? []),
  );

  protected run(): void {
    void this.scan.start(this.accountId(), decayTargets(this.posts(), this.accountId()));
  }

  protected fmt(n: number): string {
    return n.toLocaleString();
  }
}
