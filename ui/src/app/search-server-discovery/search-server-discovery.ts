import { Component, computed, inject, input, OnDestroy, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MastodonServers, ServerSuggestion } from '../mastodon-servers';
import {
  isTagsOnly,
  isUsableSearchServer,
  probeSearchServer,
  SearchServerProbe,
} from '../search-server-probe';
import { rejectReason, SearchServerRejects } from '../search-server-rejects';
import { Terminology } from '../terminology';

// i18n searchServerDiscovery.start: Find a search server
// i18n searchServerDiscovery.idle.note: Checks randomly selected servers for one that answers search anonymously — both accounts and posts. Nothing changes until you approve one.
// i18n searchServerDiscovery.searching.label: Looking for a server that allows search…
// i18n searchServerDiscovery.searching.tried: {{count}} tried
// i18n searchServerDiscovery.searching.cancel: Cancel
// i18n searchServerDiscovery.searching.bundledNote: Using the bundled Mastodon server directory.
// i18n searchServerDiscovery.candidate.allowsSearch: {{domain}} allows anonymous search
// i18n searchServerDiscovery.candidate.found: Found {{accounts}} accounts and {{statuses}} {{posts}} for the test queries.
// i18n searchServerDiscovery.candidate.use: Use this search server
// i18n searchServerDiscovery.candidate.keepLooking: Keep looking
// i18n searchServerDiscovery.exhausted.note: Couldn’t find a server that allows anonymous search right now. Your search server has not changed.
// i18n searchServerDiscovery.exhausted.retry: Search again
// i18n searchServerDiscovery.rejects.skipping.one: Skipping {{count}} server already checked and rejected.
// i18n searchServerDiscovery.rejects.skipping.other: Skipping {{count}} servers already checked and rejected.
// i18n searchServerDiscovery.rejects.forget: Forget them and re-check
// i18n searchServerDiscovery.sizeLabel.veryLarge: very large
// i18n searchServerDiscovery.sizeLabel.large: large
// i18n searchServerDiscovery.sizeLabel.midSize: mid-size
// i18n searchServerDiscovery.sizeLabel.cozy: cozy

type DiscoveryState = 'idle' | 'searching' | 'found' | 'exhausted';

export interface DiscoveredSearchServer extends ServerSuggestion {
  /** Accounts the canary matched — evidence the index is live, not just reachable. */
  accounts: number;
  /** Posts the hashtag canary matched. Non-zero is the bar for adoption. */
  statuses: number;
}

/** One host we walked past, kept so the hunt shows its work. */
interface Attempt {
  domain: string;
  reason: string;
}

/** How many rejections to keep on screen. Enough to look alive, not a wall of text. */
const VISIBLE_ATTEMPTS = 6;

/**
 * Finds an instance that will actually answer anonymous search.
 *
 * A sibling of `server-discovery/`, and close to it on purpose — that component is
 * already mounted in two places (`login.html`, `settings-server.html`) and the
 * random-walk-with-three-workers shape is proven. Three things differ:
 *
 *  - The bar is {@link isUsableSearchServer}, not reachability: accounts *and* posts
 *    must come back. Posts are asked for by hashtag, because anonymous full-text
 *    search is off on every server in the directory, and a *list of matching tag
 *    names* does not count — plenty of hosts answer a tag query with the tag and no
 *    timeline, which looks like a result set and isn't one.
 *  - Failures are recorded in {@link SearchServerRejects}, so the next hunt starts
 *    where this one left off instead of re-probing the same ~1000 duds.
 *  - It narrates. A sweep through fifty servers that says only "searching…" looks
 *    broken; `mastodon.example — search needs a login` scrolling past is the
 *    feature working.
 */
@Component({
  selector: 'app-search-server-discovery',
  imports: [TranslocoPipe],
  templateUrl: './search-server-discovery.html',
  styleUrl: './search-server-discovery.css',
})
export class SearchServerDiscovery implements OnDestroy {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  private readonly directory = inject(MastodonServers);
  private readonly rejects = inject(SearchServerRejects);
  private readonly transloco = inject(TranslocoService);

  /** Excluded from the hunt — usually the server already in use for search. */
  readonly currentServer = input('');
  /**
   * The button's text. Empty means "use the default", which is a translation
   * key rather than an English literal — an `input()` default is evaluated
   * before any injection context exists, so it cannot call `translate()`
   * itself. Callers that pass their own label are unaffected.
   */
  readonly startLabel = input('');
  protected readonly startText = computed(
    () => this.startLabel() || this.transloco.translate<string>('searchServerDiscovery.start'),
  );
  readonly selected = output<string>();

  protected readonly state = signal<DiscoveryState>('idle');
  protected readonly candidate = signal<DiscoveredSearchServer | null>(null);
  protected readonly tried = signal(0);
  protected readonly attempts = signal<Attempt[]>([]);
  protected readonly directorySource = this.directory.source;
  protected readonly rejectCount = this.rejects.count;

  private readonly attempted = new Set<string>();
  private searchAbort: AbortController | null = null;
  private searchSequence = 0;

  ngOnDestroy(): void {
    this.cancel(false);
  }

  protected async startSearch(reset = true): Promise<void> {
    this.cancel(false);
    if (reset) {
      this.attempted.clear();
      this.tried.set(0);
      this.attempts.set([]);
    }
    this.candidate.set(null);
    this.state.set('searching');
    const sequence = ++this.searchSequence;
    this.searchAbort = new AbortController();

    await this.directory.ready();
    if (sequence !== this.searchSequence) {
      return;
    }

    // Three exclusion sources: this session's attempts, the persistent reject
    // list, and whatever is already in use.
    const excluded = new Set([...this.attempted, ...this.rejects.domains()]);
    const currentDomain = this.currentServer()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .toLowerCase();
    if (currentDomain) {
      excluded.add(currentDomain);
    }
    const queue = this.directory.shuffled(excluded);
    if (!queue.length) {
      this.state.set('exhausted');
      return;
    }

    await Promise.all(
      Array.from({ length: Math.min(3, queue.length) }, () => this.runWorker(queue, sequence)),
    );
    if (sequence === this.searchSequence && this.state() === 'searching') {
      this.state.set('exhausted');
    }
  }

  protected cancel(showIdle = true): void {
    this.searchSequence += 1;
    this.searchAbort?.abort();
    this.searchAbort = null;
    if (showIdle) {
      this.state.set('idle');
      this.candidate.set(null);
    }
  }

  protected useCandidate(): void {
    const candidate = this.candidate();
    if (candidate) {
      this.selected.emit(`https://${candidate.domain}`);
    }
  }

  /** Forget every rejected server, so the next hunt re-probes from scratch. */
  protected forgetRejects(): void {
    this.rejects.clear();
  }

  protected sizeLabel(users: number): string {
    if (users >= 100_000)
      return this.transloco.translate('searchServerDiscovery.sizeLabel.veryLarge');
    if (users >= 10_000) return this.transloco.translate('searchServerDiscovery.sizeLabel.large');
    if (users >= 1_000) return this.transloco.translate('searchServerDiscovery.sizeLabel.midSize');
    if (users > 0) return this.transloco.translate('searchServerDiscovery.sizeLabel.cozy');
    return '';
  }

  private async runWorker(queue: ServerSuggestion[], sequence: number): Promise<void> {
    while (sequence === this.searchSequence && this.state() === 'searching') {
      const server = queue.shift();
      if (!server) {
        return;
      }
      const domain = server.domain.toLowerCase();
      this.attempted.add(domain);
      this.tried.update((count) => count + 1);

      const probe = await probeSearchServer(
        `https://${server.domain}`,
        this.searchAbort?.signal,
        6000,
      );

      if (isUsableSearchServer(probe)) {
        if (sequence !== this.searchSequence || this.state() !== 'searching') {
          return;
        }
        this.candidate.set({
          ...server,
          accounts: probe.accounts,
          statuses: probe.statuses ?? 0,
        });
        this.state.set('found');
        this.searchAbort?.abort();
        return;
      }

      // An aborted probe is not a verdict — a cancelled hunt must not poison the
      // reject list with hosts we never really asked.
      if (this.searchAbort?.signal.aborted) {
        return;
      }
      this.recordRejection(domain, probe);
    }
  }

  private recordRejection(domain: string, probe: SearchServerProbe): void {
    this.rejects.add(domain, probe.status);
    // Tags-only is worth naming while it scrolls past: it is the failure that looks
    // most like success, so seeing it go by is what makes the bar legible.
    const reason = isTagsOnly(probe) ? 'hashtags only, no posts' : rejectReason(probe.status);
    this.attempts.update((list) => [{ domain, reason }, ...list].slice(0, VISIBLE_ATTEMPTS));
  }
}
