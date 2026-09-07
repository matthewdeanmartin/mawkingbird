import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { Api } from '../api';
import { Auth } from '../auth';
import { HumanTimePipe } from '../human-time.pipe';
import { Status } from '../models';
import { StatusCard } from '../status-card/status-card';
import { FeedReport, analyzeFeed, pct } from '../feed-metrics';
import { FeedSource, isSupplied, sampleFeed } from '../feed-sample';
import { LANG_NAMES } from '../language-detect';
import { Terminology } from '../terminology';

// i18n feedAnalytics.loading: Sampling the last {{count}} {{posts}}…
// i18n feedAnalytics.error: Couldn't sample this feed — try again later.
// i18n feedAnalytics.empty: Nothing to analyze — this feed has no posts yet.
// i18n feedAnalytics.sample.paged: Analytics for the <strong>{{count}} {{posts}} sampled</strong> from this {{feedType}} feed ({{query}}) — not the whole feed. Spans {{span}}, collected {{collectedAt}} in {{calls}} API {{callsLabel}}.
// i18n feedAnalytics.sample.supplied: Analytics for the <strong>{{count}} {{posts}} currently loaded</strong> in this {{feedType}} feed ({{query}}) — not the whole feed. Spans {{span}}. Load more posts in the feed to widen it.
// i18n feedAnalytics.sample.sizeAria: Sample size
// i18n feedAnalytics.sample.label: Sample:
// i18n feedAnalytics.sample.optionTitle: Sample {{count}} {{posts}}
// i18n feedAnalytics.sample.refresh: Collect a fresh sample
// i18n feedAnalytics.sample.apiCall.one: call
// i18n feedAnalytics.sample.apiCall.other: calls
// i18n feedAnalytics.tiles.postsAnalyzed: Posts analyzed
// i18n feedAnalytics.tiles.uniqueAuthors: Unique authors
// i18n feedAnalytics.tiles.instances: Instances
// i18n feedAnalytics.tiles.topAuthorsShare: Top 5 authors' share
// i18n feedAnalytics.tiles.replies: Replies
// i18n feedAnalytics.tiles.withMedia: With media
// i18n feedAnalytics.tiles.withLinks: With links
// i18n feedAnalytics.tiles.avgFavourites: Avg. favourites
// i18n feedAnalytics.tiles.noEngagement: No engagement
// i18n feedAnalytics.tiles.medianPostAge: Median post age
// i18n feedAnalytics.units.hour: h
// i18n feedAnalytics.composition.title: Feed composition
// i18n feedAnalytics.composition.description: What kind of posts make up the sample. Categories overlap — a post can be a reply with media and a link.
// i18n feedAnalytics.composition.length: Post length averages {{average}} characters (median {{median}}).
// i18n feedAnalytics.composition.languages: Declared languages
// i18n feedAnalytics.composition.showFewer: Show fewer
// i18n feedAnalytics.composition.showAll: Show all {{count}}
// i18n feedAnalytics.accounts.title: Who is in this feed
// i18n feedAnalytics.accounts.description: Authors of the sampled content. For a boost, that's whoever wrote the original, not whoever boosted it.
// i18n feedAnalytics.accounts.postsPerAuthor: Posts per author
// i18n feedAnalytics.accounts.topFive: Top 5 authors
// i18n feedAnalytics.accounts.topTen: Top 10 authors
// i18n feedAnalytics.accounts.shareOfFeed: {{share}}% of the feed
// i18n feedAnalytics.accounts.appearingOnce: Authors appearing once
// i18n feedAnalytics.accounts.bots: Bots
// i18n feedAnalytics.accounts.authors: {{bots}} of {{total}} authors, {{posts}} {{postsWord}}
// i18n feedAnalytics.accounts.followedByYou: Followed by you
// i18n feedAnalytics.accounts.followed: {{followed}} followed, {{unfollowed}} not
// i18n feedAnalytics.accounts.mutedOrFiltered: Muted or filtered
// i18n feedAnalytics.accounts.topAuthors: Top authors
// i18n feedAnalytics.accounts.boostedIn: Who boosted things in
// i18n feedAnalytics.instances.title: Instances
// i18n feedAnalytics.instances.description: Where the sampled posts were written. {{local}} local, {{remote}} remote — {{diversity}} unique instances per 100 posts.
// i18n feedAnalytics.hashtags.title: Topics and hashtags
// i18n feedAnalytics.hashtags.empty: No hashtags in the sample.
// i18n feedAnalytics.hashtags.summary: {{share}}% of posts carry a hashtag; {{count}} distinct {{tagWord}}, about {{diversity}} of them carrying the weight. {{shared}} used by more than one author.
// i18n feedAnalytics.hashtags.mostly: — mostly @{{account}}
// i18n feedAnalytics.hashtags.author.one: author
// i18n feedAnalytics.hashtags.author.other: authors
// Legacy noun fragments above remain declared for deferred locale dictionaries.
// i18n feedAnalytics.hashtags.authorCount.one: {{count}} author
// i18n feedAnalytics.hashtags.authorCount.other: {{count}} authors
// i18n feedAnalytics.hashtags.travelTogether: Tags that travel together
// i18n feedAnalytics.links.title: Links and domains
// i18n feedAnalytics.links.empty: No external links in the sample.
// i18n feedAnalytics.links.summary: {{share}}% of posts link out, across {{domains}} domains. {{internal}} links point back into the fediverse.
// i18n feedAnalytics.links.repeated: Repeated links
// i18n feedAnalytics.links.crossAuthor: {{count}} of these were posted by more than one account.
// i18n feedAnalytics.links.fromAccounts.one: from {{count}} account
// i18n feedAnalytics.links.fromAccounts.other: from {{count}} accounts
// i18n feedAnalytics.links.heavyAccounts: Link-heavy accounts
// i18n feedAnalytics.links.heavyDescription: Most of what these accounts posted carried a link.
// i18n feedAnalytics.media.title: Media
// i18n feedAnalytics.media.empty: No media in the sample.
// i18n feedAnalytics.media.summary: {{share}}% of posts carry media — {{attachments}} attachments in total. {{undescribed}} lack a description ({{describedShare}}% of media posts describe everything they attach).
// i18n feedAnalytics.media.mostPosted: Most media posted
// i18n feedAnalytics.media.type.image: image
// i18n feedAnalytics.media.type.video: video
// i18n feedAnalytics.media.type.audio: audio
// i18n feedAnalytics.media.type.unknown: unknown
// i18n feedAnalytics.engagement.title: Engagement
// i18n feedAnalytics.engagement.description: Counts already attached to the sampled posts — no extra requests, and remote counts are whatever this server has seen.
// i18n feedAnalytics.engagement.favourites: Favourites
// i18n feedAnalytics.engagement.boosts: Boosts
// i18n feedAnalytics.engagement.replies: Replies
// i18n feedAnalytics.engagement.avgMedian: {{average}} avg · {{median}} median
// i18n feedAnalytics.engagement.noVisible: No visible engagement
// i18n feedAnalytics.engagement.shareOfPosts: {{share}}% of posts
// i18n feedAnalytics.engagement.byType: Average engagement by post type
// i18n feedAnalytics.engagement.mostEngaged: Most engaged posts
// i18n feedAnalytics.conversations.title: Conversations
// i18n feedAnalytics.conversations.description: Inferred from reply links already present in the sample — no conversation contexts were fetched, so threads reaching outside the sample are only partly visible.
// i18n feedAnalytics.conversations.distinct: Distinct conversations
// i18n feedAnalytics.conversations.multiple: With more than one sampled post
// i18n feedAnalytics.conversations.postsPer: Sampled posts per conversation
// i18n feedAnalytics.conversations.longChains: Inside long reply chains
// i18n feedAnalytics.conversations.mostInvolved: Most involved in conversations
// i18n feedAnalytics.timing.title: Timing
// i18n feedAnalytics.timing.description: Newest post {{newest}}h old, oldest {{oldest}}h — the sample spans {{span}}. Times are your local clock.
// i18n feedAnalytics.timing.byHour: By hour of day
// i18n feedAnalytics.timing.byDay: By day
// i18n feedAnalytics.timing.postsPerHour: {{posts}} per hour of day
// i18n feedAnalytics.timing.postsPerDay: {{posts}} per day
// i18n feedAnalytics.timing.hourTitle: {{hour}}:00 — {{count}} {{posts}}
// i18n feedAnalytics.timing.dayTitle: {{day}}: {{count}} {{posts}}
// i18n feedAnalytics.timing.busiest: {{share}}% of the sample landed in its single busiest hour.
// i18n feedAnalytics.timing.bursts.one: {{count}} posting burst detected (5+ posts within 15 minutes).
// i18n feedAnalytics.timing.bursts.other: {{count}} posting bursts detected (5+ posts within 15 minutes).
// i18n feedAnalytics.timing.noBursts: No posting bursts detected.
// i18n feedAnalytics.concentration.title: Concentration and diversity
// i18n feedAnalytics.concentration.description: How much of the feed the biggest single category holds in each dimension. "Effective count" is how many categories the feed behaves as if it had — 1 means a monoculture.
// i18n feedAnalytics.concentration.dimension: Dimension
// i18n feedAnalytics.concentration.largest: Largest
// i18n feedAnalytics.concentration.share: Its share
// i18n feedAnalytics.concentration.effective: Effective
// i18n feedAnalytics.concentration.total: Total
// i18n feedAnalytics.language.notDeclared: Not declared
// i18n feedAnalytics.span.minutes: {{count}} minutes
// i18n feedAnalytics.span.hours: {{count}} hours
// i18n feedAnalytics.span.days: {{count}} days
// i18n feedAnalytics.metric.originalPosts: Original posts
// i18n feedAnalytics.metric.boosts: Boosts
// i18n feedAnalytics.metric.replies: Replies
// i18n feedAnalytics.metric.standalonePosts: Standalone posts
// i18n feedAnalytics.metric.withMedia: With media
// i18n feedAnalytics.metric.withLinks: With links
// i18n feedAnalytics.metric.withPolls: With polls
// i18n feedAnalytics.metric.contentWarning: Behind a content warning
// i18n feedAnalytics.metric.boostedPosts: Boosted posts
// i18n feedAnalytics.metric.textOnly: Text only
// i18n feedAnalytics.metric.noLinks: No links
// i18n feedAnalytics.metric.behindCw: Behind a CW
// i18n feedAnalytics.metric.noCw: No CW
// i18n feedAnalytics.dimension.authors: Authors
// i18n feedAnalytics.dimension.instances: Instances
// i18n feedAnalytics.dimension.hashtags: Hashtags
// i18n feedAnalytics.dimension.domains: Domains
// i18n feedAnalytics.dimension.languages: Languages
// i18n feedAnalytics.dimension.contentTypes: Content types
// i18n feedAnalytics.highlight.topAuthors: {{count}} accounts produced {{share}}% of this feed.
// i18n feedAnalytics.highlight.threeInstances: Most posts came from three instances.
// i18n feedAnalytics.highlight.topInstance: {{share}}% of posts came from {{instance}}.
// i18n feedAnalytics.highlight.replies: This feed is primarily replies rather than standalone posts.
// i18n feedAnalytics.highlight.undescribedMedia: Media is common, but {{share}}% of media attachments lack descriptions.
// i18n feedAnalytics.highlight.twoDomains: Links to two domains account for half of all shared links.
// i18n feedAnalytics.highlight.dominatedTag: #{{tag}} is dominated by one author, @{{account}}.
// i18n feedAnalytics.highlight.engagement: Only {{share}}% of sampled posts have any visible engagement.
// i18n feedAnalytics.highlight.bots: {{share}}% of posts came from bots.
// i18n feedAnalytics.composition.rowTitle: {{label}}: {{count}} {{posts}}
// i18n feedAnalytics.conversations.shareOfFeed: {{share}}% of the feed
// i18n feedAnalytics.hashtags.tag.one: tag
// i18n feedAnalytics.hashtags.tag.other: tags

export type { FeedSource } from '../feed-sample';

/** Sample sizes the user can pick between on a paged feed. */
export const SAMPLE_CHOICES = [50, 100, 200] as const;
/** Default sample: 100 posts, three requests at Mastodon's 40-post page cap. */
export const DEFAULT_SAMPLE = 100;
/** Authors resolved per relationships call — Mastodon accepts them batched. */
const RELATIONSHIP_BATCH = 80;
/** How many rows the long tables show before "show all". */
const PREVIEW_ROWS = 8;

/**
 * Analytics for a sampled feed — the counterpart to `AccountAnalytics`, which
 * profiles one account's own output. Everything is computed client-side from
 * the posts in the sample (see `feed-metrics.ts`); no per-post requests are
 * made, so a paged feed costs 3–10 calls and a synthetic one costs none.
 *
 * Collection starts when the component mounts, so keep it behind a lazily-shown
 * tab rather than rendering it alongside the feed itself.
 */
@Component({
  selector: 'app-feed-analytics',
  imports: [RouterLink, StatusCard, HumanTimePipe, TranslocoPipe],
  templateUrl: './feed-analytics.html',
  styleUrl: './feed-analytics.css',
})
export class FeedAnalytics {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;
  private transloco = inject(TranslocoService);

  private api = inject(Api);
  private auth = inject(Auth);

  /** The feed to sample. Changing it restarts collection. */
  readonly source = input.required<FeedSource>();

  protected readonly sampleChoices = SAMPLE_CHOICES;
  protected sampleSize = signal<number>(DEFAULT_SAMPLE);

  protected loading = signal(true);
  protected error = signal(false);
  protected posts = signal<Status[]>([]);
  protected apiCalls = signal(0);
  protected collectedAt = signal(new Date().toISOString());
  /** Account ids the viewer follows; null until (or unless) resolved. */
  private followingIds = signal<ReadonlySet<string> | null>(null);

  /** Which long tables have been expanded past their preview. */
  private expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly previewRows = PREVIEW_ROWS;
  protected readonly tableKeys = {
    lang: 'lang',
    authors: 'authors',
    boosters: 'boosters',
    instances: 'instances',
    tags: 'tags',
    domains: 'domains',
    urls: 'urls',
    linkers: 'linkers',
    media: 'media',
    participants: 'participants',
    bursts: 'bursts',
  } as const;

  constructor() {
    // Collection is driven by the two things that define a sample: which feed
    // and how many posts. `untracked` keeps the fetch itself from registering
    // any further dependencies.
    effect(() => {
      const source = this.source();
      const size = this.sampleSize();
      untracked(() => this.collect(source, size));
    });
  }

  private collect(source: FeedSource, size: number): void {
    this.loading.set(true);
    this.error.set(false);
    this.posts.set([]);
    this.apiCalls.set(0);
    this.followingIds.set(null);
    sampleFeed(source, size).subscribe((sample) => {
      this.posts.set(sample.posts);
      this.apiCalls.set(sample.apiCalls);
      this.error.set(sample.failed);
      this.collectedAt.set(new Date().toISOString());
      this.loading.set(false);
      this.resolveFollows(sample.posts);
    });
  }

  /** Synthetic feeds are handed over whole, so there is no sample size to pick. */
  protected paged = computed(() => !isSupplied(this.source()));

  /**
   * Followed-vs-unfollowed is the one metric the status payload can't answer.
   * It costs exactly one batched request, and only for signed-in viewers — the
   * report renders without it and fills the row in when it lands.
   */
  private resolveFollows(posts: Status[]): void {
    if (this.auth.isAnonymous || !posts.length) {
      return;
    }
    const ids = [...new Set(posts.map((p) => (p.reblog ?? p).account.id))].slice(
      0,
      RELATIONSHIP_BATCH,
    );
    this.api.relationships(ids).subscribe({
      next: (rels) => {
        this.apiCalls.update((n) => n + 1);
        this.followingIds.set(new Set(rels.filter((r) => r.following).map((r) => r.id)));
      },
      error: () => this.followingIds.set(null),
    });
  }

  /** Re-collect at a different sample size. */
  setSampleSize(size: number): void {
    if (size !== this.sampleSize()) {
      this.sampleSize.set(size);
    }
  }

  /** Re-run collection against the same feed, for a fresh snapshot. */
  refresh(): void {
    this.collect(this.source(), this.sampleSize());
  }

  // --- The report ---

  protected report = computed<FeedReport>(() => {
    const following = this.followingIds();
    return analyzeFeed(
      this.posts(),
      {
        feedType: this.source().type,
        feedQuery: this.source().query,
        apiCalls: this.apiCalls(),
        collectedAt: this.collectedAt(),
      },
      following ? { followingIds: following } : {},
    );
  });

  /** Peak hour count, for scaling the hour-of-day bars. */
  protected hourPeak = computed(() => Math.max(1, ...this.report().recency.byHour));
  /** Peak day count, for scaling the per-day bars. */
  protected dayPeak = computed(() =>
    Math.max(1, ...this.report().recency.byDay.map((d) => d.posts)),
  );
  /** Peak slice average, for scaling the engagement comparison bars. */
  protected slicePeak = computed(() =>
    Math.max(1, ...this.report().engagement.slices.map((s) => s.avgEngagement)),
  );

  /**
   * The composition breakdown as bar rows. Percentages are of the whole sample
   * and deliberately overlap — a post can be a reply *and* carry media.
   */
  protected compositionRows = computed(() => {
    const c = this.report().composition;
    return [
      { label: 'feedAnalytics.metric.originalPosts', count: c.original },
      { label: 'feedAnalytics.metric.boosts', count: c.boosts },
      { label: 'feedAnalytics.metric.replies', count: c.replies },
      { label: 'feedAnalytics.metric.standalonePosts', count: c.standalone },
      { label: 'feedAnalytics.metric.withMedia', count: c.withMedia },
      { label: 'feedAnalytics.metric.withLinks', count: c.withLinks },
      { label: 'feedAnalytics.metric.withPolls', count: c.withPolls },
      { label: 'feedAnalytics.metric.contentWarning', count: c.withContentWarning },
    ].map((row) => ({ ...row, share: c.total ? row.count / c.total : 0 }));
  });

  /** Whether a named table is showing all of its rows. */
  isExpanded(key: string): boolean {
    return this.expanded().has(key);
  }

  toggleExpanded(key: string): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
  }

  /** Rows to render for a table: a preview, unless it has been expanded. */
  visible<T>(key: string, rows: T[]): T[] {
    return this.isExpanded(key) ? rows : rows.slice(0, PREVIEW_ROWS);
  }

  /** Human name for a language code; `und` covers posts with none declared. */
  langName(code: string): string {
    if (code === 'und') {
      return this.transloco.translate<string>('feedAnalytics.language.notDeclared');
    }
    return LANG_NAMES[code as keyof typeof LANG_NAMES] ?? code.toUpperCase();
  }

  metricLabel(label: string): string {
    const keys: Record<string, string> = {
      'Original posts': 'feedAnalytics.metric.originalPosts',
      'Boosted posts': 'feedAnalytics.metric.boostedPosts',
      'With media': 'feedAnalytics.metric.withMedia',
      'Text only': 'feedAnalytics.metric.textOnly',
      'With links': 'feedAnalytics.metric.withLinks',
      'No links': 'feedAnalytics.metric.noLinks',
      'Behind a CW': 'feedAnalytics.metric.behindCw',
      'No CW': 'feedAnalytics.metric.noCw',
    };
    return keys[label] ? this.transloco.translate<string>(keys[label]) : label;
  }

  mediaTypeLabel(type: string): string {
    const key = `feedAnalytics.media.type.${type}`;
    return ['image', 'video', 'audio', 'unknown'].includes(type)
      ? this.transloco.translate<string>(key)
      : type;
  }

  apiCallLabel(count: number): string {
    return this.transloco.translate<string>(
      count === 1 ? 'feedAnalytics.sample.apiCall.one' : 'feedAnalytics.sample.apiCall.other',
    );
  }

  dimensionLabel(label: string): string {
    const keys: Record<string, string> = {
      Authors: 'feedAnalytics.dimension.authors',
      Instances: 'feedAnalytics.dimension.instances',
      Hashtags: 'feedAnalytics.dimension.hashtags',
      Domains: 'feedAnalytics.dimension.domains',
      Languages: 'feedAnalytics.dimension.languages',
      'Content types': 'feedAnalytics.dimension.contentTypes',
    };
    return keys[label] ? this.transloco.translate<string>(keys[label]) : label;
  }

  highlightText(line: string): string {
    const dynamic = [
      {
        pattern: /^(\d+) accounts produced ([\d.]+)% of this feed\.$/,
        key: 'feedAnalytics.highlight.topAuthors',
        params: (m: RegExpMatchArray) => ({ count: m[1], share: m[2] }),
      },
      {
        pattern: /^([\d.]+)% of posts came from (.+)\.$/,
        key: 'feedAnalytics.highlight.topInstance',
        params: (m: RegExpMatchArray) => ({ share: m[1], instance: m[2] }),
      },
      {
        pattern: /^Media is common, but ([\d.]+)% of media attachments lack descriptions\.$/,
        key: 'feedAnalytics.highlight.undescribedMedia',
        params: (m: RegExpMatchArray) => ({ share: m[1] }),
      },
      {
        pattern: /^Only ([\d.]+)% of sampled posts have any visible engagement\.$/,
        key: 'feedAnalytics.highlight.engagement',
        params: (m: RegExpMatchArray) => ({ share: m[1] }),
      },
      {
        pattern: /^([\d.]+)% of posts came from bots\.$/,
        key: 'feedAnalytics.highlight.bots',
        params: (m: RegExpMatchArray) => ({ share: m[1] }),
      },
      {
        pattern: /^#(.+) is dominated by one author, @(.+)\.$/,
        key: 'feedAnalytics.highlight.dominatedTag',
        params: (m: RegExpMatchArray) => ({ tag: m[1], account: m[2] }),
      },
    ];
    for (const entry of dynamic) {
      const match = line.match(entry.pattern);
      if (match) {
        return this.transloco.translate<string>(entry.key, entry.params(match));
      }
    }
    const staticKeys: Record<string, string> = {
      'Most posts came from three instances.': 'feedAnalytics.highlight.threeInstances',
      'This feed is primarily replies rather than standalone posts.':
        'feedAnalytics.highlight.replies',
      'Links to two domains account for half of all shared links.':
        'feedAnalytics.highlight.twoDomains',
    };
    return staticKeys[line] ? this.transloco.translate<string>(staticKeys[line]) : line;
  }

  /**
   * The "largest" cell of a concentration row. The metrics module keeps raw
   * keys, so the language dimension needs the same name mapping the language
   * table gets rather than showing a bare `und`.
   */
  concLargest(row: { label: string; largest: string }): string {
    return row.label === 'Languages' ? this.langName(row.largest) : row.largest;
  }

  /** Hostname of a URL, for compact display of repeated links. */
  shortUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname === '/' ? '' : parsed.pathname;
      return parsed.hostname.replace(/^www\./, '') + path;
    } catch {
      return url;
    }
  }

  /** The age of the sample, phrased in whatever unit reads best. */
  protected sampleSpan = computed(() => {
    const hours = this.report().recency.spanHours;
    if (hours < 1) {
      return this.transloco.translate<string>('feedAnalytics.span.minutes', {
        count: Math.round(hours * 60),
      });
    }
    if (hours < 48) {
      return this.transloco.translate<string>('feedAnalytics.span.hours', {
        count: Math.round(hours),
      });
    }
    return this.transloco.translate<string>('feedAnalytics.span.days', {
      count: Math.round(hours / 24),
    });
  });

  pct = pct;
}
