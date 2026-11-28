import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbHelp } from '../../design-system/help/help';
import { MbProgress } from '../../design-system/progress/progress';
import { MbStatGrid } from '../../design-system/stats/stats';
import { HumanTimePipe } from '../../i18n/human-time.pipe';
import { Status } from '../../platform/api/models';
import {
  DECAY_CHECKPOINTS_MIN,
  DECAY_POST_LIMIT,
  DECAY_SERIES,
  DecaySeries,
  DecaySeriesKind,
  DurationParts,
  decayTargets,
  durationParts,
} from '../interaction-decay';
import { DECAY_MAX_PAGES, DECAY_PAGE_SIZE, InteractionDecayScan } from '../interaction-decay-scan';

// i18n interactionDecay.heading: When are your posts done?
// i18n interactionDecay.explain: How quickly likes, boosts and replies arrive after you post, and when they stop. Use it to judge when everyone who will see a post has seen it.
// i18n interactionDecay.cost: Reads your like, boost and reply notifications back to your last {{count}} posts that are at least 7 days old: up to {{pages}} requests of {{size}}.
// i18n interactionDecay.costArchive: Uses the notifications saved on this device for your last {{count}} posts that are at least 7 days old. If those are still loading, it reads your server instead: up to {{pages}} requests.
// i18n interactionDecay.progressArchive: Reading your archive
// i18n interactionDecay.stop.archiveStart: Your archive goes back to {{date}} so far.
// i18n interactionDecay.fromArchive: From the archive on this device.
// i18n interactionDecay.noPosts: No posts old enough yet. Posts need to be 7 days old so their whole curve can be seen.
// i18n interactionDecay.run: Measure interaction decay
// i18n interactionDecay.runAgain: Measure again
// i18n interactionDecay.stop: Stop
// i18n interactionDecay.progressLabel: Reading notifications
// i18n interactionDecay.progressCaption: {{pages}} requests, {{matched}} interactions found
// i18n interactionDecay.failed: Couldn't read notifications ({{error}}).
// i18n interactionDecay.stop.reachedOldest: Covers your last {{posts}} posts.
// i18n interactionDecay.stop.serverEnd: Your server's notifications only go back to {{date}}.
// i18n interactionDecay.stop.pageCap: Stopped after {{pages}} requests, before reaching your oldest post.
// i18n interactionDecay.stop.cancelled: Stopped early.
// i18n interactionDecay.excluded.one: {{count}} older post left out because the notifications read don't reach back to it.
// i18n interactionDecay.excluded.other: {{count}} older posts left out because the notifications read don't reach back to them.
// i18n interactionDecay.nothing: No interactions found on these posts in your notifications.
// i18n interactionDecay.series.likes: Likes
// i18n interactionDecay.series.boosts: Boosts
// i18n interactionDecay.series.replies: Replies
// i18n interactionDecay.series.all: All
// i18n interactionDecay.unit.minutes: {{value}} min
// i18n interactionDecay.unit.hours: {{value}} h
// i18n interactionDecay.unit.days: {{value}} d
// i18n interactionDecay.headline: The typical post gets half its interactions within {{half}} and 90% within {{most}}.
// i18n interactionDecay.tile.half: Half arrive by
// i18n interactionDecay.tile.most: 90% arrive by
// i18n interactionDecay.tile.coverage: Coverage
// i18n interactionDecay.tile.coverageValue: {{pct}}%
// i18n interactionDecay.tile.coverageSub: {{seen}} of {{counted}} interactions
// i18n interactionDecay.help.most: For each post, the time from posting until 90% of its {{kind}} had arrived. The median across the posts that got any. After this, the post is mostly done.
// i18n interactionDecay.help.coverage: Interactions found in your notifications, out of what the posts' own counters say. Muted people, filtered notifications, and interactions removed since are in the counters but not in notifications, so under 100% is normal.
// i18n interactionDecay.help.chart: Each line is the median post: the share of its interactions of that kind that had arrived by each time after posting. Only posts that got that kind are counted. Posts younger than 7 days are left out, so every post is seen over the whole week.
// i18n interactionDecay.help.about: About {{stat}}
// i18n interactionDecay.chartAria: Share of interactions arrived, by time after posting
// i18n interactionDecay.chartTitle: Share arrived, by time after posting
// i18n interactionDecay.col.after: After
// i18n interactionDecay.pct: {{pct}}%
// i18n interactionDecay.none: –
// i18n interactionDecay.tooltipAfter: After {{time}}
// i18n interactionDecay.postsUsed: {{kind}}: {{posts}} posts, {{events}} interactions

/** Chart geometry, in CSS pixels: the chart is drawn at its real width. */
const DEFAULT_W = 560;
/** Narrower than this and only every other time is labelled. */
const NARROW_W = 480;
const H = 240;
const PAD = { left: 40, right: 76, top: 12, bottom: 28 };
const PLOT_H = H - PAD.top - PAD.bottom;
/** Smallest vertical gap between two end-of-line labels. */
const LABEL_GAP = 14;

interface LinePath {
  kind: DecaySeriesKind;
  d: string;
  labelY: number;
  end: { x: number; y: number } | null;
}

/**
 * The interaction-decay panel on your own analytics page.
 *
 * Opt-in: nothing is read until the button is pressed, because reaching back
 * 40 posts can take dozens of notification requests.
 */
@Component({
  selector: 'app-interaction-decay-panel',
  imports: [MbButton, MbHelp, MbProgress, MbStatGrid, HumanTimePipe, TranslocoPipe],
  templateUrl: './interaction-decay-panel.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './interaction-decay-panel.css',
})
export class InteractionDecayPanel {
  /** The signed-in account's id. */
  readonly accountId = input.required<string>();
  /** The account's own posts from the analytics sample, newest first. */
  readonly posts = input.required<Status[]>();

  protected readonly scan = inject(InteractionDecayScan);

  /** The chart's width, measured once it is on the page. */
  protected readonly W = signal(DEFAULT_W);
  private readonly chartWrap = viewChild<ElementRef<HTMLElement>>('chartWrap');
  protected readonly H = H;
  protected readonly pad = PAD;
  protected readonly plotW = computed(() => this.W() - PAD.left - PAD.right);
  protected readonly plotH = PLOT_H;
  protected readonly series = DECAY_SERIES;
  protected readonly checkpoints = DECAY_CHECKPOINTS_MIN;
  protected readonly maxPages = DECAY_MAX_PAGES;
  protected readonly pageSize = DECAY_PAGE_SIZE;
  protected readonly postLimit = DECAY_POST_LIMIT;
  protected readonly gridLines = [0, 0.5, 1];

  /** The posts a run would measure. */
  protected readonly targets = computed(() => decayTargets(this.posts(), this.accountId()));

  /** This account's run, if the last one was for it. */
  protected readonly state = computed(() => {
    const s = this.scan.state();
    return s && s.accountId === this.accountId() ? s : null;
  });

  protected readonly result = computed(() => {
    const r = this.state()?.result;
    return r && r.events > 0 ? r : null;
  });

  /** The oldest notification read, for "only go back to {{date}}". */
  protected readonly reachedBackIso = computed(() => {
    const at = this.state()?.reachedBack;
    return at ? new Date(at).toISOString() : '';
  });

  /** How far back the walk has reached, against the span it must cover. */
  protected readonly progress = computed(() => {
    const s = this.state();
    if (!s?.reachedBack) {
      return { value: 0, max: 0 };
    }
    const span = Math.max(1, Date.now() - s.oldestPost);
    const done = Math.min(span, Date.now() - s.reachedBack);
    return { value: Math.round((done / span) * 100), max: 100 };
  });

  /** Index of the checkpoint under the pointer or focus, for the crosshair. */
  protected readonly hover = signal<number | null>(null);

  constructor() {
    effect((onCleanup) => {
      const wrap = this.chartWrap()?.nativeElement;
      if (!wrap || typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(() => {
        const width = Math.round(wrap.clientWidth);
        if (width > 0) this.W.set(width);
      });
      observer.observe(wrap);
      onCleanup(() => observer.disconnect());
    });
  }

  protected x(i: number): number {
    return PAD.left + (i * this.plotW()) / (DECAY_CHECKPOINTS_MIN.length - 1);
  }

  /** Every checkpoint when there is room, else every other one. */
  protected showTick(i: number): boolean {
    return this.W() >= NARROW_W || i % 2 === 0;
  }

  protected y(share: number): number {
    return PAD.top + (1 - share) * PLOT_H;
  }

  /** Width of one checkpoint's hover column. */
  protected readonly colW = computed(() => this.plotW() / (DECAY_CHECKPOINTS_MIN.length - 1));

  protected readonly lines = computed<LinePath[]>(() => {
    const r = this.result();
    if (!r) {
      return [];
    }
    const lines: LinePath[] = DECAY_SERIES.map((kind) => {
      const points = r.series[kind].points;
      let d = '';
      let end: { x: number; y: number } | null = null;
      points.forEach((p, i) => {
        if (p === null) {
          return;
        }
        const px = this.x(i);
        const py = this.y(p);
        d += `${d ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
        end = { x: px, y: py };
      });
      return { kind, d, end, labelY: end ? (end as { y: number }).y : 0 };
    }).filter((l) => l.d);
    // Spread end labels so lines that finish together stay readable.
    const sorted = [...lines].sort((a, b) => a.labelY - b.labelY);
    for (let i = 1; i < sorted.length; i++) {
      sorted[i].labelY = Math.max(sorted[i].labelY, sorted[i - 1].labelY + LABEL_GAP);
    }
    const overflow = (sorted.at(-1)?.labelY ?? 0) - (H - PAD.bottom);
    if (overflow > 0) {
      sorted.forEach((l) => (l.labelY -= overflow));
    }
    return lines;
  });

  protected checkpointLabel(minutes: number): DurationParts {
    return durationParts(minutes * 60_000);
  }

  protected duration(ms: number | null): DurationParts | null {
    return ms === null ? null : durationParts(ms);
  }

  protected pct(share: number | null): number | null {
    return share === null ? null : Math.round(share * 100);
  }

  protected seriesOf(kind: DecaySeriesKind): DecaySeries | null {
    return this.result()?.series[kind] ?? null;
  }

  protected run(): void {
    void this.scan.start(this.accountId(), this.targets());
  }

  protected stop(): void {
    this.scan.cancel();
  }

  protected fmt(n: number): string {
    return n.toLocaleString();
  }
}
