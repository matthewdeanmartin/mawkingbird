import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { Account, ProviderId, Status } from '../../models';
import { ClientPrefs } from '../../client-prefs';
import { FeedAggregator } from '../../providers/feed-aggregator';
import { ProviderRegistry } from '../../providers/provider-registry';
import { Auth } from '../../auth';
import { LocalModeration } from '../../local-moderation';
import { AnonymousAccount } from '../../providers/anonymous/anonymous-account';
import { AnonymousFollows } from '../../providers/anonymous/anonymous-follows';
import { AnonymousMastodonProvider } from '../../providers/anonymous/anonymous-mastodon-provider';
import {
  DoctorAction,
  FeedBounds,
  FeedDiagnosis,
  ProviderSlice,
  Verdict,
  diagnoseFeed,
  sliceByProvider,
} from '../../feed-doctor';
import { CalmVerdicts } from '../../calm-verdicts';
import { FeedLanguageFilter } from '../../trend-language-filter';
import { feedSubject } from '../../feed-metrics';
import { sampleFeed } from '../../feed-sample';

// i18n feedDoctor.title: Feed Doctor
// i18n feedDoctor.reading: Reading your feed…
// i18n feedDoctor.checkAgain: Check again
// i18n feedDoctor.windowHidden.one: Your reading window hid {{count}} older post. Everything below describes what the window let through.
// i18n feedDoctor.windowHidden.other: Your reading window hid {{count}} older posts. Everything below describes what the window let through.
// i18n feedDoctor.widen: Widen the window
// i18n feedDoctor.collecting: Collecting a sample…

/** Posts to diagnose. Enough for shares to mean something, small enough to be quick. */
const SAMPLE_SIZE = 140;

/**
 * Feed Doctor — who is flooding, why the feed ended, whether the sources mix.
 *
 * Diagnostic, not descriptive: `/analytics` already shows the composition of a feed
 * in full. This page answers three specific complaints and puts a button next to
 * each answer. A healthy check collapses to one line, because a page of green
 * checkmarks teaches people to stop reading it.
 *
 * All the judgement lives in `feed-doctor.ts`, which is pure and separately tested.
 * This component only fetches a sample, hands it over, and renders the verdicts.
 */
@Component({
  selector: 'app-feed-doctor-page',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './feed-doctor-page.html',
  styleUrl: './feed-doctor-page.css',
})
export class FeedDoctorPage implements OnInit {
  private auth = inject(Auth);
  private provider = inject(AnonymousMastodonProvider);
  private follows = inject(AnonymousFollows);
  private moderation = inject(LocalModeration);
  private anonymous = inject(AnonymousAccount);
  private aggregator = inject(FeedAggregator);
  private registry = inject(ProviderRegistry);
  private prefs = inject(ClientPrefs);
  private calm = inject(CalmVerdicts);
  private langFilter = inject(FeedLanguageFilter);

  protected loading = signal(true);
  protected diagnosis = signal<FeedDiagnosis | null>(null);
  protected collectedAt = signal<Date | null>(null);
  /** Per-provider breakdown, signed-in only. */
  protected slices = signal<ProviderSlice[]>([]);
  /**
   * Posts the reading window excluded.
   *
   * Counted by the aggregator rather than inferred: "you are only seeing today"
   * is worth saying only when there is demonstrably something older to see.
   */
  protected droppedByWindow = signal(0);
  /** Accounts acted on this visit, so the buttons can report what they did. */
  protected acted = signal<Record<string, string>>({});

  protected isAnonymous = computed(() => this.auth.isAnonymous);

  ngOnInit(): void {
    this.run();
  }

  /**
   * Sample whichever Home this reader actually has.
   *
   * These are two genuinely different feeds, not one feed with a login on top.
   * Anonymous Home is assembled here in the browser, one read per followed
   * account. Signed-in Home is `FeedAggregator` merging the Mastodon timeline with
   * Bluesky, Twitter and RSS in per-source rounds — so it cannot say which follow
   * went quiet, but it *can* say which whole source stalled, which is the failure
   * that actually happens to a connected account.
   */
  protected run(): void {
    this.loading.set(true);
    this.diagnosis.set(null);

    if (this.isAnonymous()) {
      this.provider.reset();
      // The provider keeps its own cursors and advances them on each call, so
      // `after` is ignored here — `reset()` above is what rewinds it.
      sampleFeed(
        {
          type: 'home',
          query: 'Anonymous home',
          pageSize: 20,
          fetch: () => this.provider.fetchPage(),
        },
        SAMPLE_SIZE,
      ).subscribe({
        next: (sample) => this.reportAnonymous(sample.posts),
        error: () => this.reportAnonymous([]),
      });
      return;
    }

    this.aggregator.reset();
    sampleFeed(
      {
        type: 'home',
        query: 'Home',
        pageSize: 20,
        fetch: () => this.aggregator.nextPage(),
      },
      SAMPLE_SIZE,
    ).subscribe({
      next: (sample) => this.reportAggregated(sample.posts),
      error: () => this.reportAggregated([]),
    });
  }

  private reportAnonymous(posts: Status[]): void {
    this.report(
      diagnoseFeed({
        posts,
        outcomes: this.provider.lastOutcomes(),
        // Zero, and not a placeholder: the anonymous stitched feed reads each
        // follow directly and applies no time window, so nothing can be dropped
        // by one. `JustMyServer` and `FeedAggregator` are the two that do.
        bounds: this.bounds(posts, 0),
        bySource: this.countSources(posts),
      }),
    );
  }

  /**
   * What is bounding the feed, measured on the sample this page just fetched.
   *
   * Computed here rather than read off Home because the Doctor is reachable
   * without Home being open, and a diagnosis that silently reports the last
   * feed someone happened to scroll is worse than one that measures its own.
   *
   * The counts mirror Home's `hiddenByFilters` / `hiddenByCalm` /
   * `hiddenByLanguage`: each filter is counted against posts the *other*
   * filters would have shown, so the numbers add up to what turning that one
   * filter off would actually reveal rather than overlapping into a total
   * larger than the feed.
   *
   * The Boosts/Replies chips are Home's own view state and do not exist here,
   * so `hiddenByChips` is 0 — the Doctor reports what it can measure and does
   * not invent the rest.
   */
  private bounds(posts: Status[], droppedByWindow: number): FeedBounds {
    const calmOn = this.prefs.algoCalm();
    const hiddenByCalm = calmOn
      ? posts.filter((p) => this.calm.hidden(p) && this.langFilter.shouldShow(p)).length
      : 0;
    const hiddenByLanguage = posts.filter(
      (p) => !this.langFilter.shouldShow(p) && !(calmOn && this.calm.hidden(p)),
    ).length;
    const window = this.prefs.homeWindow();
    return {
      hiddenByCalm,
      hiddenByLanguage,
      hiddenByChips: 0,
      droppedByWindow,
      windowLabel: window === 'all' ? null : window === 'today' ? 'the last day' : 'the last week',
      // The reading cooldown lives in Home's component state and resets on
      // reload, so by the time this page is open it is not in force here.
      cooldownActive: false,
      cooldownMinutes: 0,
      exhausted: !droppedByWindow && !hiddenByCalm && !hiddenByLanguage,
      shown: posts.length,
    };
  }

  /**
   * The signed-in diagnosis: which of your connected sources is behind, and do
   * they cover the same stretch of time.
   *
   * No `outcomes` — there are no per-follow reads to report on — so
   * {@link diagnoseEnding} stays omitted rather than faked. `bounds` is what
   * answers "why did your feed end" here instead: cooldowns, windows and
   * filters apply identically whoever is signed in, and leaving them unreported
   * is what left this page saying only that nobody was flooding the feed.
   */
  private reportAggregated(posts: Status[]): void {
    const labels: Record<string, string> = { mastodon: 'Mastodon' };
    for (const provider of this.registry.linked()) {
      labels[provider.id] = provider.label;
    }
    const linked = ['mastodon', ...this.registry.linked().map((provider) => provider.id)].filter(
      (id) => this.prefs.isProviderVisible(id as ProviderId),
    );

    const slices = sliceByProvider(posts, labels, linked);
    this.slices.set(slices);
    this.droppedByWindow.set(this.aggregator.droppedByWindow());
    this.report(
      diagnoseFeed({
        posts,
        outcomes: [],
        bounds: this.bounds(posts, this.aggregator.droppedByWindow()),
        bySource: Object.fromEntries(slices.map((slice) => [slice.label, slice.count])),
        slices,
      }),
    );
  }

  /**
   * Widen the reading window one step, then re-diagnose.
   *
   * Re-running the sample rather than only flipping the setting: the verdict on
   * screen was computed against the narrow window, and leaving it there would
   * have the page still blaming a window the reader just widened.
   */
  protected widenWindow(): void {
    this.prefs.setHomeWindow(this.prefs.homeWindow() === 'today' ? 'week' : 'all');
    this.rerun();
  }

  /** Turn Calm off from the diagnosis that named it, then re-diagnose. */
  protected turnCalmOff(): void {
    this.prefs.setAlgoCalm(false);
    this.rerun();
  }

  private rerun(): void {
    this.loading.set(true);
    this.ngOnInit();
  }

  private report(diagnosis: FeedDiagnosis): void {
    this.diagnosis.set(diagnosis);
    this.collectedAt.set(new Date());
    this.loading.set(false);
  }

  /**
   * Group the sample by where it came from.
   *
   * Read off the source labels the provider already records (`@handle`, `#tag`, or a
   * provider name), so this costs nothing and stays correct as sources are added.
   */
  private countSources(posts: Status[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const outcome of this.provider.lastOutcomes()) {
      const label = outcome.handle.startsWith('#')
        ? 'Hashtags'
        : outcome.handle.startsWith('@')
          ? 'Follows'
          : outcome.handle;
      counts[label] = (counts[label] ?? 0) + outcome.fetched;
    }
    // Nothing recorded (a supplied or cached feed): report the sample as one bucket
    // rather than claiming a breakdown we did not measure.
    if (!Object.keys(counts).length && posts.length) {
      counts['Follows'] = posts.length;
    }
    return counts;
  }

  protected verdicts = computed(() => this.diagnosis()?.verdicts ?? []);

  protected sampleSize = computed(() => this.diagnosis()?.sampleSize ?? 0);

  /**
   * Provenance line. Built here rather than in the template so the punctuation
   * survives formatting — an interpolated clause between `@if` blocks renders with
   * stray spaces before the comma and full stop.
   */
  protected sampleLine = computed(() => {
    const sources = this.slices().length;
    const base = `Based on the last ${this.sampleSize()} posts in your Home feed`;
    return !this.isAnonymous() && sources > 1 ? `${base}, across ${sources} sources.` : `${base}.`;
  });

  protected icon(verdict: Verdict): string {
    return verdict.severity === 'ok' ? '✓' : '⚠';
  }

  /**
   * Apply an action the user picked.
   *
   * Local moderation, so this works for an anonymous reader — the whole point. The
   * page never acts on its own: every mute and unfollow here is a click.
   */
  protected act(action: DoctorAction): void {
    const account = action.account;
    if (!account) {
      return;
    }
    if (action.kind === 'mute' && action.seconds) {
      this.moderation.mute(account, action.seconds);
      this.note(account, 'Muted for 8 hours.');
      return;
    }
    if (action.kind === 'unfollow') {
      this.follows.unfollow(account, this.anonymous.server());
      this.note(account, 'Unfollowed.');
    }
  }

  private note(account: Account, message: string): void {
    this.acted.set({ ...this.acted(), [account.acct]: message });
  }

  protected actedOn(action: DoctorAction): string | null {
    const acct = action.account?.acct;
    return acct ? (this.acted()[acct] ?? null) : null;
  }

  protected readonly subject = feedSubject;
}
