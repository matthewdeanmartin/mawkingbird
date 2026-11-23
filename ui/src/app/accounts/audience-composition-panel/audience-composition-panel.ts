import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbHelp } from '../../design-system/help/help';
import { MbBarItem, MbBarList, MbStatGrid } from '../../design-system/stats/stats';
import {
  AGE_BANDS,
  AudienceOverlap,
  CADENCE_BANDS,
  CompositionTally,
  SIZE_TIERS,
  serverSplit,
} from '../audience-composition';
import { AudienceSide } from '../audience-scan';
import { AudienceEstimate } from '../effective-audience';

// i18n audienceComposition.heading.followers: Who follows you
// i18n audienceComposition.heading.following: Who you follow
// i18n audienceComposition.heading.overlap: Following back
// i18n audienceComposition.sample: From {{scanned}} of {{total}} accounts, newest first. Stopping early leans toward recent, more active accounts.
// i18n audienceComposition.servers: Servers
// i18n audienceComposition.serversSummary: {{distinct}} servers. {{pct}}% on your server ({{host}}).
// i18n audienceComposition.serversSummaryNoHome: {{distinct}} servers.
// i18n audienceComposition.other: Other servers
// i18n audienceComposition.size: Account size
// i18n audienceComposition.tier.small: Under 50 followers
// i18n audienceComposition.tier.regular: 50–499
// i18n audienceComposition.tier.large: 500–4,999
// i18n audienceComposition.tier.big: 5,000+
// i18n audienceComposition.botsGroups: {{bots}} automated accounts, {{groups}} groups.
// i18n audienceComposition.age: Account age
// i18n audienceComposition.ageBand.new: Under 90 days
// i18n audienceComposition.ageBand.underYear: 90 days – 1 year
// i18n audienceComposition.ageBand.oneToThree: 1–3 years
// i18n audienceComposition.ageBand.overThree: 3+ years
// i18n audienceComposition.ageBand.unknown: Unknown
// i18n audienceComposition.cadence: Posts per day
// i18n audienceComposition.cadenceBand.drizzle: Under 0.1
// i18n audienceComposition.cadenceBand.light: 0.1–1
// i18n audienceComposition.cadenceBand.regular: 1–5
// i18n audienceComposition.cadenceBand.heavy: 5+
// i18n audienceComposition.cadenceBand.unknown: New or unknown
// i18n audienceComposition.value: {{count}} · {{pct}}%
// i18n audienceComposition.help.about: About {{stat}}
// i18n audienceComposition.help.servers: The server each account is on, from its handle. The 8 biggest are listed and the rest are grouped as Other. Many accounts on one server means a local audience. A long tail means your posts travel across the fediverse.
// i18n audienceComposition.help.size: The account's own follower count. Big accounts can carry a boost far; most people on the fediverse have under 50 followers.
// i18n audienceComposition.help.age: When the account was created. Many new accounts can mean a recent wave of sign-ups or a burst of attention.
// i18n audienceComposition.help.cadence: Lifetime posts per day: the account's post count divided by its age. Accounts younger than 14 days count as unknown, because their average doesn't mean anything yet. Under 0.1 is about three posts a month.
// i18n audienceComposition.help.overlap: Compares the two lists by account. Needs both lists read in full; a part of each would undercount the people in both.
// i18n audienceComposition.mutuals: Mutuals
// i18n audienceComposition.notFollowedBack: You don't follow back
// i18n audienceComposition.notFollowingBack: Don't follow you back
// i18n audienceComposition.overlapNeedsBoth: Scan both lists in full to see mutuals.

interface SideView {
  side: AudienceSide;
  tally: CompositionTally;
  estimate: AudienceEstimate | null;
  serversSummary: string;
  servers: MbBarItem[];
  size: MbBarItem[];
  age: MbBarItem[];
  cadence: MbBarItem[];
}

/**
 * Who the accounts in a follower or following list are, from the audience
 * scan's composition tally. Free once the scan has run: every figure reads a
 * field already on the accounts it paged.
 */
@Component({
  selector: 'app-audience-composition-panel',
  imports: [MbBarList, MbHelp, MbStatGrid, TranslocoPipe],
  templateUrl: './audience-composition-panel.html',
  styleUrl: './audience-composition-panel.css',
})
export class AudienceCompositionPanel {
  readonly composition = input.required<Partial<Record<AudienceSide, CompositionTally>>>();
  readonly results = input.required<Partial<Record<AudienceSide, AudienceEstimate | null>>>();
  readonly overlap = input<AudienceOverlap | null>(null);
  /** The analyzed account's own server, for "on your server". */
  readonly homeHost = input<string | null>(null);

  private readonly transloco = inject(TranslocoService);
  /** Re-runs the labels when the language (or its dictionary) changes. */
  private readonly dictionary = toSignal(this.transloco.selectTranslation());

  /** Followers first: the audience is the point; who you follow is context. */
  protected readonly sides = computed<SideView[]>(() => {
    this.dictionary();
    const composition = this.composition();
    const results = this.results();
    return (['followers', 'following'] as const)
      .filter((side) => (composition[side]?.scanned ?? 0) > 0)
      .map((side) => this.view(side, composition[side]!, results[side] ?? null));
  });

  /** Both lists scanned (in any amount), so the overlap block has something to say. */
  protected readonly bothSides = computed(
    () => !!this.composition().followers && !!this.composition().following,
  );

  protected fmt(n: number): string {
    return n.toLocaleString();
  }

  private view(
    side: AudienceSide,
    tally: CompositionTally,
    estimate: AudienceEstimate | null,
  ): SideView {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(`audienceComposition.${key}`, params);
    const bar = (label: string, count: number): MbBarItem => ({
      label,
      value: count,
      display: t('value', {
        count: this.fmt(count),
        pct: tally.scanned ? Math.round((count / tally.scanned) * 100) : 0,
      }),
    });
    const home = this.homeHost();
    const split = serverSplit(tally, home);
    const servers = split.top.map((s) => bar(s.host, s.count));
    if (split.other) {
      servers.push(bar(t('other'), split.other));
    }
    return {
      side,
      tally,
      estimate,
      serversSummary: home
        ? t('serversSummary', {
            distinct: this.fmt(split.distinct),
            pct: split.homePct,
            host: home,
          })
        : t('serversSummaryNoHome', { distinct: this.fmt(split.distinct) }),
      servers,
      size: SIZE_TIERS.map((tier) => bar(t(`tier.${tier}`), tally.tiers[tier])),
      age: AGE_BANDS.filter((b) => b !== 'unknown' || tally.age.unknown > 0).map((b) =>
        bar(t(`ageBand.${b}`), tally.age[b]),
      ),
      cadence: CADENCE_BANDS.map((b) => bar(t(`cadenceBand.${b}`), tally.cadence[b])),
    };
  }
}
