import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbHelp } from '../../design-system/help/help';
import { HumanTimePipe } from '../../i18n/human-time.pipe';
import { Account, Status } from '../../platform/api/models';
import { AccountName } from '../account-name';
import { accountProfilePath } from '../account-route';
import { DiscoveryCheck } from '../discovery-check';
import { decayTargets } from '../interaction-decay';
import { InteractionDecayScan } from '../interaction-decay-scan';
import { BoosterSort, topBoosters } from '../reaction-log';

// i18n topBoosters.heading: Top boosters
// i18n topBoosters.explain: The people who pass your posts on, and how many people they can reach.
// i18n topBoosters.cta: Uses the same read as "When are your posts done?" above. Nothing is changed.
// i18n topBoosters.run: Read my notifications
// i18n topBoosters.reading: Reading notifications… progress is shown above.
// i18n topBoosters.nothing: No boosts in the notifications read.
// i18n topBoosters.sort: Sort by
// i18n topBoosters.sort.audience: Biggest audience
// i18n topBoosters.sort.posts: Most posts boosted
// i18n topBoosters.summary: {{people}} people boosted you, from {{servers}} servers, since {{date}}.
// i18n topBoosters.followers: {{count}} followers
// i18n topBoosters.posts.one: boosted {{count}} post
// i18n topBoosters.posts.other: boosted {{count}} posts
// i18n topBoosters.last: last {{time}}
// i18n topBoosters.notFollowing: Doesn't follow you
// i18n topBoosters.automated: Says it's automated
// i18n topBoosters.more: Show more
// i18n topBoosters.help.about: About {{stat}}
// i18n topBoosters.help.list: From your boost notifications. Follower counts are what your server last saw, and a boost reaches only some of those followers. "Posts boosted" counts different posts. "Doesn't follow you" appears once the discovery rate has checked who follows you.

const FIRST = 10;
const STEP = 20;

/** Who boosts you, ranked by their audience or by how often. */
@Component({
  selector: 'app-top-boosters-panel',
  imports: [AccountName, MbButton, MbHelp, HumanTimePipe, RouterLink, TranslocoPipe],
  templateUrl: './top-boosters-panel.html',
  styleUrl: './top-boosters-panel.css',
})
export class TopBoostersPanel {
  readonly accountId = input.required<string>();
  readonly posts = input.required<Status[]>();

  protected readonly scan = inject(InteractionDecayScan);
  private readonly check = inject(DiscoveryCheck);

  protected readonly sorts: readonly BoosterSort[] = ['audience', 'posts'];
  protected readonly sort = signal<BoosterSort>('audience');
  protected readonly limit = signal(FIRST);

  protected readonly scanState = computed(() => {
    const s = this.scan.state();
    return s && s.accountId === this.accountId() ? s : null;
  });

  protected readonly boosters = computed(() => {
    const log = this.scanState()?.log;
    return log ? topBoosters(log, this.sort()) : [];
  });

  protected readonly servers = computed(
    () => new Set(this.boosters().flatMap((b) => (b.host ? [b.host] : []))).size,
  );

  protected readonly sinceIso = computed(() => {
    const at = this.scanState()?.reachedBack;
    return at ? new Date(at).toISOString() : '';
  });

  /** Known not to follow you; unknown says nothing. */
  protected notFollowing(account: Account): boolean {
    const s = this.check.state();
    return s?.accountId === this.accountId() && s.followsYou.get(account.id) === false;
  }

  protected link(account: Account): (string | number)[] {
    return accountProfilePath(account);
  }

  protected iso(at: number): string {
    return new Date(at).toISOString();
  }

  protected more(): void {
    this.limit.update((n) => n + STEP);
  }

  protected run(): void {
    void this.scan.start(this.accountId(), decayTargets(this.posts(), this.accountId()));
  }

  protected fmt(n: number): string {
    return n.toLocaleString();
  }
}
