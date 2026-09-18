import { Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Poll } from '../models';
import { pollStatistics } from './poll-statistics';

// i18n pollResults.statistics: Voting statistics
// i18n pollResults.sample: Sample: {{count}} voters
// i18n pollResults.assumption: Population estimates below assume independent random sampling. Online polls are usually self-selected; these intervals do not account for selection bias.
// i18n pollResults.interval: 95% interval: {{low}}–{{high}}%
// i18n pollResults.method: Error bars are individual 95% Wilson confidence intervals. Ranking uses more conservative simultaneous 95% Hoeffding bounds across all options; overlapping bounds do not prove a tie. These are fixed-sample estimates, not guarantees when repeatedly checking a live poll.
// i18n pollResults.lead: Observed lead over second place: {{count}} percentage points
// i18n pollResults.clearLeader: Under random sampling, the lead for “{{name}}” is distinguishable at 95% confidence.
// i18n pollResults.unclearLeader: Under random sampling, a distinct leader is not established at 95% confidence.
// i18n pollResults.ranked: The full observed ordering is supported by the simultaneous 95% bounds.
// i18n pollResults.unranked: The simultaneous 95% bounds do not establish a full ranking.
// i18n pollResults.multiple: Multiple choice: percentages are shares of voters and may sum above 100%.
// i18n pollResults.average: Average selections per voter: {{count}}
// i18n pollResults.unavailable: Statistics need complete option counts and a nonzero voter count.
// i18n pollResults.hidden: Results are available after voting or when the poll closes.
// i18n pollResults.countUnavailable: Count unavailable

@Component({
  selector: 'app-poll-results',
  imports: [DecimalPipe, TranslocoPipe],
  templateUrl: './poll-results.html',
  styleUrl: './poll-results.css',
})
export class PollResults {
  readonly poll = input.required<Poll>();
  readonly visible = input(false);
  protected readonly stats = computed(() => (this.visible() ? pollStatistics(this.poll()) : null));
  protected percent(count: number): number {
    const p = this.poll();
    const n = p.multiple ? p.voters_count : p.votes_count;
    return n > 0 && Number.isFinite(count) ? Math.max(0, Math.min(100, (100 * count) / n)) : 0;
  }
  protected hasCount(count: number): boolean {
    return Number.isSafeInteger(count) && count >= 0;
  }
  protected ownVote(index: number): boolean {
    return this.poll().own_votes?.includes(index) ?? false;
  }
  protected hasDenominator(): boolean {
    const p = this.poll();
    const n = p.multiple ? p.voters_count : p.votes_count;
    return Number.isSafeInteger(n) && n >= 0;
  }
}
