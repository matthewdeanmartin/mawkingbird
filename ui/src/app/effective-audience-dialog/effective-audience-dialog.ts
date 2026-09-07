import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FocusTrap } from '../a11y/focus-trap';
import { AudienceScan, AudienceSide } from '../audience-scan';
import {
  DORMANT_AFTER_DAYS,
  LOW_CADENCE_POSTS_PER_DAY,
  AudienceEstimate,
} from '../effective-audience';
import { AnonymousPublicRef } from '../providers/anonymous/anonymous-route-ref';
import { Account } from '../models';
import { Terminology } from '../terminology';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

/** Accounts per request, mirrored from the scanner for the cost estimate. */
const PAGE_SIZE = 80;

/**
 * "This will cost about 63 requests — still want it?", then the progress, then
 * the answer.
 *
 * Three states in one dialog because they are one thought: the user is deciding
 * whether the number is worth the wait, watching it be earned, and then reading
 * it. Splitting them across components would mean the estimate that justified
 * the scan is off-screen by the time the scan is running.
 *
 * Nothing here writes, so unlike {@link BulkActionsDialog} there is no
 * confirmation to get right and no backup to offer — the only real
 * responsibility is being honest about cost beforehand and about coverage
 * afterwards.
 */
// i18n effectiveAudience.title: Effective friends & followers
// i18n effectiveAudience.lead: A follower count includes everyone who ever clicked follow. This walks the list and works out how many are still posting.
// i18n effectiveAudience.measure: Measure
// i18n effectiveAudience.friends: Friends
// i18n effectiveAudience.followers: Followers
// i18n effectiveAudience.sideCost: {{count}} accounts · ~{{requests}} requests
// i18n effectiveAudience.estimatedCost.one: About <strong>{{count}}</strong> request, roughly {{time}}. You can stop at any point and keep an estimate.
// i18n effectiveAudience.estimatedCost.other: About <strong>{{count}}</strong> requests, roughly {{time}}. You can stop at any point and keep an estimate.
// i18n effectiveAudience.seconds: {{count}}s
// i18n effectiveAudience.minutes: {{count}} min
// i18n effectiveAudience.howTitle: How the four numbers are worked out
// i18n effectiveAudience.how.effective: <strong>Effective</strong> — posted in the last {{days}} days. The people who would plausibly see your next {{post}}.
// i18n effectiveAudience.how.dormant: <strong>Dormant</strong> — silent for more than {{days}} days.
// i18n effectiveAudience.how.lowCadence: <strong>Low-cadence</strong> — fewer than {{rate}} {{posts}} per day averaged over the account's whole life. The ones who technically post, but at a drizzle.
// i18n effectiveAudience.how.zombies: <strong>Zombies</strong> — both dormant <em>and</em> low-cadence. Deliberately strict: someone who drizzles but posted yesterday is still there, and someone who posts a lot but took a month off is on a break.
// i18n effectiveAudience.reading: Reading the list. Nothing is being changed.
// i18n effectiveAudience.progress.running.one: {{scanned}} of {{total}} read · {{calls}} request
// i18n effectiveAudience.progress.running.other: {{scanned}} of {{total}} read · {{calls}} requests
// i18n effectiveAudience.progress.done.one: {{scanned}} read · {{calls}} request · done
// i18n effectiveAudience.progress.done.other: {{scanned}} read · {{calls}} requests · done
// i18n effectiveAudience.scannedAria: {{side}} scanned
// i18n effectiveAudience.scanError: Couldn’t finish the scan: {{error}}
// i18n effectiveAudience.nothingChanged: Nothing was changed — this only ever reads.
// i18n effectiveAudience.stoppedEarly: Stopped early. The numbers below are estimated from what was read.
// i18n effectiveAudience.effective: Effective
// i18n effectiveAudience.zombies: Zombies
// i18n effectiveAudience.dormant: Dormant
// i18n effectiveAudience.lowCadence: Low-cadence
// i18n effectiveAudience.exactCount: {{count}}
// i18n effectiveAudience.approximateCount: ~{{count}}
// i18n effectiveAudience.percentOf: {{percent}}% of {{total}}
// i18n effectiveAudience.zombieRate: {{percent}}% zombie rate
// i18n effectiveAudience.ofRead: of {{count}} read
// i18n effectiveAudience.underPerDay: under {{rate}}/day
// i18n effectiveAudience.readBias.one: Read {{scanned}} account, but the server's count says {{statedTotal}}. Each account was counted once, so the figures below are based on what was actually read.
// i18n effectiveAudience.readBias.other: Read {{scanned}} accounts, but the server's count says {{statedTotal}}. Each account was counted once, so the figures below are based on what was actually read.
// i18n effectiveAudience.sampled: Estimated by scaling up a {{percent}}% sample. Lists come back newest-first and recent accounts skew active, so the real effective count is likely a little lower than this.
// i18n effectiveAudience.coverage.complete: {{count}} scanned
// i18n effectiveAudience.coverage.partial: {{scanned}} of {{total}} ({{percent}}%)
// i18n effectiveAudience.cancel: Cancel
// i18n effectiveAudience.scan.one: Scan {{count}} request
// i18n effectiveAudience.scan.other: Scan {{count}} requests
// i18n effectiveAudience.close: Close
// i18n effectiveAudience.stopEstimate: Stop and estimate
// i18n effectiveAudience.scanAgain: Scan again
// i18n effectiveAudience.done: Done
@Component({
  selector: 'app-effective-audience-dialog',
  imports: [FocusTrap, TranslocoPipe],
  templateUrl: './effective-audience-dialog.html',
  styleUrl: './effective-audience-dialog.css',
})
export class EffectiveAudienceDialog {
  protected words = inject(Terminology).words;
  private readonly transloco = inject(TranslocoService);
  private readonly scan = inject(AudienceScan);

  readonly account = input.required<Account>();
  readonly publicRef = input<AnonymousPublicRef | null>(null);
  readonly closed = output<void>();

  /** Which sides to measure. Both by default — they answer different questions. */
  protected readonly wantFollowers = signal(true);
  protected readonly wantFollowing = signal(true);

  protected readonly state = this.scan.state;
  protected readonly percent = this.scan.percent;
  protected readonly apiCalls = this.scan.apiCalls;
  protected readonly running = this.scan.running;

  /** True before the user has committed — the consent screen. */
  protected readonly asking = computed(() => !this.state());

  protected readonly followersTotal = computed(() => this.account().followers_count ?? 0);
  protected readonly followingTotal = computed(() => this.account().following_count ?? 0);

  /** Requests one side will take, rounded up — the honest headline cost. */
  private pagesFor(total: number): number {
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }

  /** Estimated total requests for the current selection. */
  protected readonly estimatedCalls = computed(() => {
    let calls = 0;
    if (this.wantFollowers()) {
      calls += this.pagesFor(this.followersTotal());
    }
    if (this.wantFollowing()) {
      calls += this.pagesFor(this.followingTotal());
    }
    return calls;
  });

  /** Per-side request estimate, for the checkbox labels. */
  protected callsFor(total: number): number {
    return total > 0 ? this.pagesFor(total) : 0;
  }

  /** "45s" / "3 min" — the cost in the unit people actually think in. */
  protected readonly estimatedTime = computed(() => {
    const seconds = this.estimatedSeconds();
    return seconds < 60
      ? this.transloco.translate<string>('effectiveAudience.seconds', { count: seconds })
      : this.transloco.translate<string>('effectiveAudience.minutes', {
          count: Math.ceil(seconds / 60),
        });
  });

  /** Whole-percent scan progress for one side, for the bar and its ARIA value. */
  protected pctOf(scanned: number, total: number): number {
    return total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0;
  }

  /** Coverage as a whole percent, for the sampling caveat. */
  protected coveragePct(result: AudienceEstimate): number {
    return Math.round(result.coverage * 100);
  }

  /**
   * A rough wall-clock estimate for the consent screen.
   *
   * Deliberately vague and deliberately pessimistic — requests are not free and
   * a rate limit can stretch this a long way. Better to over-quote and finish
   * early than to promise 20 seconds and take four minutes.
   */
  protected readonly estimatedSeconds = computed(() => Math.ceil(this.estimatedCalls() * 0.6));

  protected readonly canStart = computed(
    () => (this.wantFollowers() || this.wantFollowing()) && this.estimatedCalls() > 0,
  );

  /** Copy for the thresholds, so the dialog and the module can't drift apart. */
  protected readonly dormantDays = DORMANT_AFTER_DAYS;
  protected readonly lowCadenceRate = LOW_CADENCE_POSTS_PER_DAY;

  protected readonly followersResult = computed(() => this.state()?.results.followers ?? null);
  protected readonly followingResult = computed(() => this.state()?.results.following ?? null);

  /**
   * Finished sides paired with their labels, in display order.
   *
   * Built here rather than looping a literal array in the template: an inline
   * `['following', 'followers']` is a new array identity on every change
   * detection pass, which defeats `@for` tracking and re-creates both result
   * blocks each tick.
   */
  protected readonly resultRows = computed(() => {
    const rows: { side: AudienceSide; label: string; result: AudienceEstimate }[] = [];
    const following = this.followingResult();
    if (following) {
      rows.push({
        side: 'following',
        label: this.transloco.translate<string>('effectiveAudience.friends'),
        result: following,
      });
    }
    const followers = this.followersResult();
    if (followers) {
      rows.push({
        side: 'followers',
        label: this.transloco.translate<string>('effectiveAudience.followers'),
        result: followers,
      });
    }
    return rows;
  });

  /** True once at least one side has produced numbers worth showing. */
  protected readonly hasResults = computed(
    () => !!this.followersResult() || !!this.followingResult(),
  );

  protected readonly stopped = computed(() => this.state()?.phase === 'cancelled');
  protected readonly failed = computed(() => this.state()?.phase === 'failed');

  protected sideLabel(side: AudienceSide): string {
    return this.transloco.translate<string>(
      side === 'followers' ? 'effectiveAudience.followers' : 'effectiveAudience.friends',
    );
  }

  protected scannedAriaLabel(side: AudienceSide): string {
    return this.transloco.translate<string>('effectiveAudience.scannedAria', {
      side: this.sideLabel(side),
    });
  }

  protected toggleFollowers(): void {
    this.wantFollowers.update((on) => !on);
  }

  protected toggleFollowing(): void {
    this.wantFollowing.update((on) => !on);
  }

  protected start(): void {
    const sides: AudienceSide[] = [];
    // Following first: it is almost always the smaller list, so the cheaper
    // half of a two-sided scan produces numbers while the expensive one runs.
    if (this.wantFollowing()) {
      sides.push('following');
    }
    if (this.wantFollowers()) {
      sides.push('followers');
    }
    if (!sides.length) {
      return;
    }
    void this.scan.start({
      accountId: this.account().id,
      followersTotal: this.followersTotal(),
      followingTotal: this.followingTotal(),
      sides,
      publicRef: this.publicRef(),
    });
  }

  protected stop(): void {
    this.scan.cancel();
  }

  /**
   * Close the dialog.
   *
   * The scan is left running if it is still going: it lives in a root service
   * precisely so closing this window doesn't throw away four minutes of paging,
   * and reopening picks the same state back up.
   */
  protected close(): void {
    this.closed.emit();
  }

  /** Start over — clears the finished scan so the consent screen returns. */
  protected again(): void {
    this.scan.dismiss();
  }

  /**
   * How much of the audience the numbers rest on.
   *
   * A partial scan says "1,240 of 5,000 (25%)". A complete one just says
   * "2,914 scanned": once everything has been read, "2,914 of 2,914 (100%)" is
   * three ways of saying one number, and when the server's counter disagrees
   * slightly it actively misleads by implying an exact match we never checked.
   */
  protected coverageLabel(result: AudienceEstimate): string {
    if (result.complete) {
      return this.transloco.translate<string>('effectiveAudience.coverage.complete', {
        count: result.scanned.toLocaleString(),
      });
    }
    const pct = Math.round(result.coverage * 100);
    return this.transloco.translate<string>('effectiveAudience.coverage.partial', {
      scanned: result.scanned.toLocaleString(),
      total: result.total.toLocaleString(),
      percent: pct,
    });
  }

  fmt(n: number): string {
    if (n >= 1_000_000) {
      return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (n >= 10_000) {
      return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return n.toLocaleString();
  }
}
