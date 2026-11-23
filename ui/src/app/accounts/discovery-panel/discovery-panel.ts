import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbHelp } from '../../design-system/help/help';
import { MbProgress } from '../../design-system/progress/progress';
import { MbStatGrid } from '../../design-system/stats/stats';
import { stripHtml } from '../../feeds/sentiment';
import { HumanTimePipe } from '../../i18n/human-time.pipe';
import { Status } from '../../platform/api/models';
import { CHECK_BATCH, CHECK_LIMIT, DiscoveryCheck } from '../discovery-check';
import { decayTargets } from '../interaction-decay';
import { InteractionDecayScan } from '../interaction-decay-scan';
import { REACTION_KINDS, computeDiscovery } from '../reaction-log';

// i18n discoveryRate.heading: Discovery rate
// i18n discoveryRate.explain: How many of the reactions to your posts come from people who don't follow you. This is how new people find you.
// i18n discoveryRate.cta: Uses the same read as "When are your posts done?" above. Nothing is changed.
// i18n discoveryRate.run: Read my notifications
// i18n discoveryRate.reading: Reading notifications… progress is shown above.
// i18n discoveryRate.nothing: No reactions to your posts in the notifications read.
// i18n discoveryRate.checkCost: Ask your server which of these {{people}} people follow you: {{requests}} requests.
// i18n discoveryRate.checkCostCapped: Ask your server about the {{checked}} most recent of these {{people}} people: {{requests}} requests.
// i18n discoveryRate.check: Check who follows me
// i18n discoveryRate.checkAgain: Check again
// i18n discoveryRate.checking: Checking who follows you
// i18n discoveryRate.checkingCaption: {{checked}} of {{total}}
// i18n discoveryRate.stop: Stop
// i18n discoveryRate.failed: The check stopped early ({{error}}). The figures use the answers received so far.
// i18n discoveryRate.tile.overall: Discovery rate
// i18n discoveryRate.tile.overallSub: {{discovered}} of {{reactions}} reactions
// i18n discoveryRate.tile.newPeople: New people
// i18n discoveryRate.tile.newPeopleSub: of {{people}} who reacted
// i18n discoveryRate.tile.followedAfter: Now follow you
// i18n discoveryRate.tile.followedAfterSub: reacted first, then followed
// i18n discoveryRate.kind.likes: Likes
// i18n discoveryRate.kind.boosts: Boosts
// i18n discoveryRate.kind.replies: Replies
// i18n discoveryRate.pct: {{pct}}%
// i18n discoveryRate.none: –
// i18n discoveryRate.since: Reactions since {{date}}.
// i18n discoveryRate.unknown: {{count}} people left out because their follow state isn't known.
// i18n discoveryRate.posts: Posts that reached the most new people
// i18n discoveryRate.tags: Hashtags that reached the most new people
// i18n discoveryRate.col.post: Post
// i18n discoveryRate.col.tag: Hashtag
// i18n discoveryRate.col.newPeople: New people
// i18n discoveryRate.col.rate: Discovery rate
// i18n discoveryRate.col.reactions: Reactions
// i18n discoveryRate.mediaOnly: (no text)
// i18n discoveryRate.notEnough: Not enough reactions to rank any yet.
// i18n discoveryRate.help.about: About {{stat}}
// i18n discoveryRate.help.overall: Likes, boosts and replies from people who weren't following you when they reacted, out of all reactions whose follow state is known. Someone who reacted and then followed counts as new only if their follow notification was read; otherwise they look like a follower, so the real rate may be a little higher. Someone who followed, reacted and later left counts as new.
// i18n discoveryRate.help.rows: Ranked by how many different new people reacted. Posts need at least 5 reactions. Hashtags also need at least 2 posts.

/** Rows shown in each ranking. */
const ROWS = 10;
/** Post text is cut to this many characters in a ranking. */
const EXCERPT = 90;

/** The share of reactions that come from people who don't follow you. */
@Component({
  selector: 'app-discovery-panel',
  imports: [MbButton, MbHelp, MbProgress, MbStatGrid, HumanTimePipe, RouterLink, TranslocoPipe],
  templateUrl: './discovery-panel.html',
  styleUrl: './discovery-panel.css',
})
export class DiscoveryPanel {
  readonly accountId = input.required<string>();
  readonly posts = input.required<Status[]>();

  protected readonly scan = inject(InteractionDecayScan);
  protected readonly check = inject(DiscoveryCheck);
  protected readonly kinds = REACTION_KINDS;

  protected readonly scanState = computed(() => {
    const s = this.scan.state();
    return s && s.accountId === this.accountId() ? s : null;
  });

  protected readonly log = computed(() => {
    const log = this.scanState()?.log;
    return log && log.reactions.length ? log : null;
  });

  protected readonly checkState = computed(() => {
    const s = this.check.state();
    return s && s.accountId === this.accountId() ? s : null;
  });

  /** People who reacted, most recent first. */
  protected readonly people = computed(() => [...(this.log()?.people.keys() ?? [])]);
  protected readonly toCheck = computed(() => Math.min(CHECK_LIMIT, this.people().length));
  protected readonly requests = computed(() => Math.ceil(this.toCheck() / CHECK_BATCH));

  protected readonly discovery = computed(() => {
    const log = this.log();
    const state = this.checkState();
    if (!log || !state || state.phase === 'checking' || !state.followsYou.size) {
      return null;
    }
    const d = computeDiscovery(log, state.followsYou);
    return { ...d, posts: d.posts.slice(0, ROWS), tags: d.tags.slice(0, ROWS) };
  });

  protected readonly sinceIso = computed(() => {
    const at = this.scanState()?.reachedBack;
    return at ? new Date(at).toISOString() : '';
  });

  protected excerpt(html: string): string {
    const text = stripHtml(html).replace(/\s+/g, ' ').trim();
    return text.length > EXCERPT ? `${text.slice(0, EXCERPT).trimEnd()}…` : text;
  }

  protected run(): void {
    void this.scan.start(this.accountId(), decayTargets(this.posts(), this.accountId()));
  }

  protected runCheck(): void {
    void this.check.start(this.accountId(), this.people());
  }

  protected fmt(n: number): string {
    return n.toLocaleString();
  }
}
