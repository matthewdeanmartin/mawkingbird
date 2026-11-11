import { MbDiscoveryCandidate } from '../../design-system/identity/discovery-candidate';
import { MbSpinner } from '../../design-system/identity/spinner';
import { MbPostAction } from '../../design-system/post-actions/post-actions';
import { MbButton } from '../../design-system/button/button';
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
import { Terminology } from '../../i18n/terminology';

// i18n searchServerDiscovery.start: Find a search server
// i18n searchServerDiscovery.idle.snapshotNote: Offers servers from Mawkingbird's directory that allowed anonymous search — both accounts and posts — when last checked, and confirms one still does. Nothing changes until you approve one.
// i18n searchServerDiscovery.checking.label: Checking that {{domain}} still allows search…
// i18n searchServerDiscovery.searching.cancel: Cancel
// i18n searchServerDiscovery.candidate.allowsSearch: {{domain}} allows anonymous search
// i18n searchServerDiscovery.candidate.found: Found {{accounts}} accounts and {{statuses}} {{posts}} for the test queries.
// i18n searchServerDiscovery.candidate.use: Use this search server
// i18n searchServerDiscovery.candidate.keepLooking: Keep looking
// i18n searchServerDiscovery.exhausted.none: None of the {{checked}} servers in Mawkingbird's directory allowed anonymous search when last checked ({{date}}). Your search server has not changed; you can still type one in.
// i18n searchServerDiscovery.exhausted.note: No other server in the directory allows anonymous search right now. Your search server has not changed.
// i18n searchServerDiscovery.exhausted.retry: Check again
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

/** One host that failed its live confirmation, kept so the check shows its work. */
interface Attempt {
  domain: string;
  reason: string;
}

/** One server's anonymous-search support, as `npm run search-servers:snapshot` found it. */
export interface SearchServerFlags {
  domain: string;
  accounts: boolean;
  posts: boolean;
  tagsOnly: boolean;
}

/** `public/search-servers.json`. */
export interface SearchServerSnapshot {
  checkedAt: string;
  checked: number;
  servers: SearchServerFlags[];
}

const SNAPSHOT_URL = 'search-servers.json';

/** How many rejections to keep on screen. Enough to look alive, not a wall of text. */
const VISIBLE_ATTEMPTS = 6;

/**
 * Offers a server that will actually answer anonymous search.
 *
 * It used to walk the whole Mastodon directory live, probing server after
 * server for minutes, and in practice no server in the directory qualified, so
 * every hunt ended empty. Which servers qualify is now measured ahead of time
 * by `npm run search-servers:snapshot` and shipped as `search-servers.json`.
 * This component reads it and offers qualifying servers one at a time, each
 * confirmed with a single live probe first, since a server can change its
 * mind after the snapshot. When none qualified it says so at once, with the
 * count and date, instead of making anyone wait.
 *
 * The bar is still {@link isUsableSearchServer}: accounts *and* posts. A failed
 * live confirmation goes to {@link SearchServerRejects}, and the next candidate
 * is tried.
 */
@Component({
  selector: 'app-search-server-discovery',
  imports: [MbButton, MbPostAction, MbDiscoveryCandidate, MbSpinner, TranslocoPipe],
  templateUrl: './search-server-discovery.html',
  styleUrl: './search-server-discovery.css',
})
export class SearchServerDiscovery implements OnDestroy {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  private readonly directory = inject(MastodonServers);
  private readonly rejects = inject(SearchServerRejects);
  private readonly transloco = inject(TranslocoService);

  /** Excluded from the offer — usually the server already in use for search. */
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
  /** The server being confirmed live right now. */
  protected readonly checking = signal('');
  protected readonly attempts = signal<Attempt[]>([]);
  protected readonly rejectCount = this.rejects.count;
  /** Set when the snapshot itself had no qualifying server, for the note. */
  protected readonly snapshotNone = signal<{ checked: number; date: string } | null>(null);

  private readonly attempted = new Set<string>();
  private snapshot: Promise<SearchServerSnapshot | null> | null = null;
  private searchAbort: AbortController | null = null;
  private searchSequence = 0;

  ngOnDestroy(): void {
    this.cancel(false);
  }

  protected async startSearch(reset = true): Promise<void> {
    this.cancel(false);
    if (reset) {
      this.attempted.clear();
      this.attempts.set([]);
    }
    this.candidate.set(null);
    this.snapshotNone.set(null);
    this.checking.set('');
    this.state.set('searching');
    const sequence = ++this.searchSequence;
    this.searchAbort = new AbortController();

    const [snapshot] = await Promise.all([this.loadSnapshot(), this.directory.ready()]);
    if (sequence !== this.searchSequence) {
      return;
    }
    const usable = (snapshot?.servers ?? []).filter((server) => server.accounts && server.posts);
    if (!usable.length) {
      this.snapshotNone.set({
        checked: snapshot?.checked ?? 0,
        date: snapshot?.checkedAt ? new Date(snapshot.checkedAt).toLocaleDateString() : '?',
      });
      this.state.set('exhausted');
      return;
    }

    const excluded = new Set([...this.attempted, ...this.rejects.domains()]);
    const currentDomain = this.currentServer()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .toLowerCase();
    if (currentDomain) {
      excluded.add(currentDomain);
    }
    const details = new Map(
      this.directory.shuffled().map((server) => [server.domain.toLowerCase(), server]),
    );
    const queue = usable
      .map((server) => server.domain.toLowerCase())
      .filter((domain) => !excluded.has(domain));

    for (const domain of queue) {
      this.attempted.add(domain);
      this.checking.set(domain);
      const probe = await probeSearchServer(`https://${domain}`, this.searchAbort?.signal, 6000);
      if (sequence !== this.searchSequence) {
        return;
      }
      if (isUsableSearchServer(probe)) {
        const known = details.get(domain);
        this.candidate.set({
          domain,
          description: known?.description ?? '',
          category: known?.category ?? '',
          users: known?.users ?? 0,
          accounts: probe.accounts,
          statuses: probe.statuses ?? 0,
        });
        this.state.set('found');
        return;
      }
      // An aborted probe is not a verdict: a cancelled check must not poison
      // the reject list with hosts we never really asked.
      if (this.searchAbort?.signal.aborted) {
        return;
      }
      this.recordRejection(domain, probe);
    }
    this.state.set('exhausted');
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

  /** Forget every rejected server, so the next look re-checks them. */
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

  /** The shipped snapshot, fetched once per component; null when it cannot be read. */
  private loadSnapshot(): Promise<SearchServerSnapshot | null> {
    this.snapshot ??= fetch(new URL(SNAPSHOT_URL, document.baseURI).toString())
      .then((response) => (response.ok ? (response.json() as Promise<SearchServerSnapshot>) : null))
      .catch(() => null);
    return this.snapshot;
  }

  private recordRejection(domain: string, probe: SearchServerProbe): void {
    this.rejects.add(domain, probe.status);
    // Tags-only is worth naming: it is the failure that looks most like success.
    const reason = isTagsOnly(probe) ? 'hashtags only, no posts' : rejectReason(probe.status);
    this.attempts.update((list) => [{ domain, reason }, ...list].slice(0, VISIBLE_ATTEMPTS));
  }
}
