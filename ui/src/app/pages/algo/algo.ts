import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ALGO_MAX_CALLS, AlgoFeed, AlgoPost, AlgoSource } from '../../algo-feed';
import { AlgoAudience, ClientPrefs } from '../../client-prefs';
import { CalmVerdicts } from '../../calm-verdicts';
import { FeedLanguageFilter } from '../../trend-language-filter';
import { FeedLanguagePicker } from '../../feed-language-picker/feed-language-picker';
import { PreviewCard, Status } from '../../models';
import { PageDiagnostics } from '../../page-diagnostics';
import { StatusCard } from '../../status-card/status-card';
import { StatusVisibility } from '../../status-visibility';
import { Auth } from '../../auth';
import { Terminology } from '../../terminology';

const SOURCE_LABELS: Record<AlgoSource, string> = {
  mutual: 'pages.algo.source.mutual',
  boost: 'pages.algo.source.boost',
  original: 'pages.algo.source.original',
  hashtag: 'pages.algo.source.hashtag',
  rss: 'pages.algo.source.rss',
};

/** Friends means posts *authored* by follows — boosts and hashtag finds are not it. */
const FRIEND_SOURCES: readonly AlgoSource[] = ['mutual', 'original'];

// i18n pages.algo.filter.ariaLabel: Filter the Algo feed
// i18n pages.algo.filter.all: All
// i18n pages.algo.filter.friends: Friends
// i18n pages.algo.filter.friendsTitle: Only {{posts}} written by people you follow — no {{boosts}}, no hashtag finds
// i18n pages.algo.filter.tags: Tags
// i18n pages.algo.filter.tagsTitle: Include popular recent {{posts}} from hashtags you follow
// i18n pages.algo.filter.calm: 😌 Calm
// i18n pages.algo.filter.calmTitle: Hide {{posts}} that read as inflammatory: heated wording, quote-dunks, and ratioed {{posts}} (all detected on-device — no server involved)
// i18n pages.algo.filter.links: 🔗 Links
// i18n pages.algo.filter.linksTitle: Show only the link previews from these ranked {{posts}}
// i18n pages.algo.filter.shuffle: 🔀 Shuffle
// i18n pages.algo.filter.shuffleTitle: Re-deal the same {{posts}} in a random order
// i18n pages.algo.filter.refresh: 🔄 Refresh
// i18n pages.algo.filter.refreshTitle: Rebuild the feed from fresh data
// i18n pages.algo.meta.summary: {{count}} {{posts}} from {{calls}} {{callsLabel}}
// i18n pages.algo.meta.publicSourceLoads: public source loads
// i18n pages.algo.meta.apiCalls: API calls
// i18n pages.algo.meta.sampledHashtag: · sampled #{{tag}}
// i18n pages.algo.meta.calmHidden: · calm mode hid {{count}}
// i18n pages.algo.loading.gathering: Gathering the good stuff…
// i18n pages.algo.loading.progress: {{calls}} of up to {{maxCalls}} API calls
// i18n pages.algo.error.build: Couldn’t build your Algo feed. Try refreshing.
// i18n pages.algo.empty.follow: Nothing here yet — follow some people and hashtags, or RSS feeds, then refresh.
// i18n pages.algo.empty.anonymous: Home and Algo only fetch when you ask them to.
// i18n pages.algo.links.empty: No link previews in these posts.
// i18n pages.algo.links.widen: Try All, Tags, or Refresh to widen the selection.
// i18n pages.algo.links.ariaLabel: Links from the Algo feed
// i18n pages.algo.engagement.favourites: {{count}} favourites
// i18n pages.algo.engagement.boosts: {{count}} {{boosts}}
// i18n pages.algo.source.mutual: Top post from a mutual
// i18n pages.algo.source.boost: Boosted into your feed
// i18n pages.algo.source.original: Top post from your feed
// i18n pages.algo.source.hashtag: From a hashtag you follow
// i18n pages.algo.source.rss: From an RSS feed you follow

interface AlgoLink {
  post: AlgoPost;
  status: Status;
  card: PreviewCard;
}

/**
 * ✨ Algo — the consumer-centric algorithmic feed. Content the user already
 * asked for, ranked by engagement, with client-side audience, tags, and
 * calm-mode filters. The expensive build lives in {@link AlgoFeed}; this page
 * renders the cached result and offers the explicit refresh and shuffle.
 */
@Component({
  selector: 'app-algo',
  imports: [StatusCard, FeedLanguagePicker, TranslocoPipe],
  templateUrl: './algo.html',
  styleUrl: './algo.css',
})
export class Algo implements OnInit {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  protected feed = inject(AlgoFeed);
  /** Ceiling for the "n of up to N API calls" progress line. */
  protected readonly maxCalls = ALGO_MAX_CALLS;
  protected prefs = inject(ClientPrefs);
  protected auth = inject(Auth);
  private feedLangFilter = inject(FeedLanguageFilter);
  private calm = inject(CalmVerdicts);
  private visibility = inject(StatusVisibility);
  private diagnostics = inject(PageDiagnostics);
  protected linksView = signal(false);

  /** Whether a post survives the audience + tags chips (calm applied separately). */
  private passesChips(p: AlgoPost): boolean {
    if (this.prefs.algoAudience() === 'friends') {
      return FRIEND_SOURCES.includes(p.source);
    }
    return p.source !== 'hashtag' || this.prefs.algoTags();
  }

  /**
   * The cached feed with the audience, tags, calm, and language filters applied.
   *
   * The {@link StatusVisibility} check is not optional: each item wraps its card
   * in a "why you're seeing this" line, and a card that self-suppresses (muted
   * post, locally blocked author, hide-action filter) renders nothing — leaving
   * the label stranded over empty space. Drop the whole item instead.
   */
  protected visible = computed(() =>
    this.feed
      .posts()
      .filter(
        (p) =>
          this.passesChips(p) &&
          !(this.prefs.algoCalm() && this.calm.hidden(p.status)) &&
          this.feedLangFilter.shouldShow(p.status) &&
          !this.visibility.rendersNothing(p.status),
      ),
  );

  /** Preview cards from the filtered feed, using the original status behind a boost. */
  protected links = computed(() =>
    this.visible().flatMap((post): AlgoLink[] => {
      const status = post.status.reblog ?? post.status;
      return status.card?.url ? [{ post, status, card: status.card }] : [];
    }),
  );

  /**
   * Posts dropped purely because their card would render nothing, tallied by
   * reason. Recomputes with the feed, so the log below reports the live state.
   */
  private suppressed = computed(() => {
    const tally: Record<string, number> = {};
    for (const p of this.feed.posts()) {
      const reason = this.visibility.hiddenReason(p.status);
      if (reason) {
        tally[reason] = (tally[reason] ?? 0) + 1;
      }
    }
    return tally;
  });

  /**
   * One console line per render pass whenever the pool shrinks, naming every
   * stage that dropped posts. An Algo feed that looks emptier than its "N posts"
   * meta line claims is otherwise silent — this says which filter ate them.
   */
  private logFunnel = effect(() => {
    const pool = this.feed.posts();
    if (this.feed.loading() || !pool.length) {
      return;
    }
    const visible = this.visible().length;
    if (visible === pool.length) {
      return;
    }
    this.diagnostics.info('Algo', 'feed:funnel', {
      pool: pool.length,
      visible,
      chips: pool.filter((p) => !this.passesChips(p)).length,
      calm: this.calmHidden(),
      language: pool.filter((p) => !this.feedLangFilter.shouldShow(p.status)).length,
      cardRendersNothing: this.suppressed(),
      audience: this.prefs.algoAudience(),
      tags: this.prefs.algoTags(),
    });
  });

  /** How many posts calm mode is currently hiding, for the chip hint. */
  protected calmHidden = computed(() => {
    if (!this.prefs.algoCalm()) {
      return 0;
    }
    return this.feed.posts().filter((p) => this.passesChips(p) && this.calm.hidden(p.status))
      .length;
  });

  ngOnInit(): void {
    this.diagnostics.info('Algo', 'page:open', {
      audience: this.prefs.algoAudience(),
      tags: this.prefs.algoTags(),
      calm: this.prefs.algoCalm(),
      cachedPosts: this.feed.posts().length,
    });
    this.feed.ensureBuilt();
  }

  sourceLabelKey(post: AlgoPost): string {
    return SOURCE_LABELS[post.source];
  }

  setAudience(audience: AlgoAudience): void {
    this.diagnostics.info('Algo', 'user:set-audience', { audience });
    this.prefs.setAlgoAudience(audience);
  }

  toggleTags(): void {
    const enabled = !this.prefs.algoTags();
    this.diagnostics.info('Algo', 'user:toggle-tags', { enabled });
    this.prefs.setAlgoTags(enabled);
  }

  toggleCalm(): void {
    const enabled = !this.prefs.algoCalm();
    this.diagnostics.info('Algo', 'user:toggle-calm', { enabled });
    this.prefs.setAlgoCalm(enabled);
  }

  toggleLinks(): void {
    const enabled = !this.linksView();
    this.diagnostics.info('Algo', 'user:toggle-links', { enabled, links: this.links().length });
    this.linksView.set(enabled);
  }

  shuffle(): void {
    this.diagnostics.info('Algo', 'user:shuffle', { posts: this.feed.posts().length });
    this.feed.shufflePosts();
  }

  refresh(): void {
    this.diagnostics.info('Algo', 'user:refresh', { cachedPosts: this.feed.posts().length });
    this.feed.refresh();
  }

  onChanged(post: AlgoPost, updated: Status): void {
    this.feed.updateStatus(post.status, updated);
  }

  onDeleted(removed: Status): void {
    this.feed.removeStatus(removed.id);
  }
}
