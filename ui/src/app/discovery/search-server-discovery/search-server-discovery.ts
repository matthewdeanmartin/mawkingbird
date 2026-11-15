import { MbButton } from '../../design-system/button/button';
import { MbDialog } from '../../design-system/dialog/dialog';
import { Component, computed, inject, input, OnDestroy, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

// i18n searchServerDiscovery.start: Find a search server
// i18n searchServerDiscovery.title: Search server directory
// i18n searchServerDiscovery.close: Close
// i18n searchServerDiscovery.intro: Filter by the search features each server offered when last checked. Check whether a server is reachable from your current network before choosing it.
// i18n searchServerDiscovery.support: Search support
// i18n searchServerDiscovery.any: Any
// i18n searchServerDiscovery.none: No search support
// i18n searchServerDiscovery.accounts: Accounts
// i18n searchServerDiscovery.posts: Posts
// i18n searchServerDiscovery.hashtags: Hashtags
// i18n searchServerDiscovery.reachability: Reachability
// i18n searchServerDiscovery.all: All
// i18n searchServerDiscovery.reachable: Reachable
// i18n searchServerDiscovery.unreachable: Unreachable
// i18n searchServerDiscovery.notChecked: Not checked
// i18n searchServerDiscovery.checkConnection: Check connection
// i18n searchServerDiscovery.use: Use this search server
// i18n searchServerDiscovery.noMatches: No servers match these filters.
// i18n searchServerDiscovery.checkedAt: Directory checked {{date}}.
// i18n searchServerDiscovery.checkListed: Check listed servers
// i18n searchServerDiscovery.checkingListed: Checking {{done}} of {{total}} servers…
// i18n searchServerDiscovery.cancelChecks: Stop checking
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

/** Browse the shipped capability snapshot and check network reachability live. */
@Component({
  selector: 'app-search-server-discovery',
  imports: [MbButton, MbDialog, TranslocoPipe],
  templateUrl: './search-server-discovery.html',
  styleUrl: './search-server-discovery.css',
})
export class SearchServerDiscovery implements OnDestroy {
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

  protected readonly dialogOpen = signal(false);
  protected readonly directoryServers = signal<SearchServerFlags[]>([]);
  protected readonly checkedAt = signal('');
  protected readonly capabilityFilter = signal<'any' | 'none' | 'accounts' | 'posts' | 'hashtags'>(
    'any',
  );
  protected readonly reachFilter = signal<'all' | 'reachable' | 'unreachable'>('all');
  protected readonly reachability = signal<
    Record<string, 'checking' | 'reachable' | 'unreachable'>
  >({});
  protected readonly scanTotal = signal(0);
  protected readonly scanDone = signal(0);
  protected readonly scanning = signal(false);
  protected readonly visibleServers = computed(() =>
    this.directoryServers().filter((server) => {
      const capability = this.capabilityFilter();
      const reach = this.reachability()[server.domain];
      const current = this.currentServer()
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '')
        .toLowerCase();
      return (
        server.domain.toLowerCase() !== current &&
        (capability === 'any' ||
          (capability === 'none'
            ? !server.accounts && !server.posts && !server.tagsOnly
            : capability === 'hashtags'
              ? server.tagsOnly || server.posts
              : server[capability])) &&
        (this.reachFilter() === 'all' || reach === this.reachFilter())
      );
    }),
  );
  private readonly reachChecks = new Map<string, AbortController>();
  private scanSequence = 0;

  private snapshot: Promise<SearchServerSnapshot | null> | null = null;

  ngOnDestroy(): void {
    this.closeDialog();
  }

  protected async openDialog(): Promise<void> {
    this.dialogOpen.set(true);
    const snapshot = await this.loadSnapshot();
    if (this.dialogOpen()) {
      this.directoryServers.set(snapshot?.servers ?? []);
      this.checkedAt.set(
        snapshot?.checkedAt ? new Date(snapshot.checkedAt).toLocaleDateString() : '',
      );
    }
  }

  protected closeDialog(): void {
    this.dialogOpen.set(false);
    this.stopChecks();
  }

  protected stopChecks(): void {
    this.scanSequence++;
    this.scanning.set(false);
    for (const check of this.reachChecks.values()) check.abort();
    this.reachChecks.clear();
    this.reachability.update((state) =>
      Object.fromEntries(Object.entries(state).filter(([, value]) => value !== 'checking')),
    );
  }

  /** Probe the currently listed hosts in bounded parallel batches. */
  protected async checkListed(): Promise<void> {
    if (this.scanning()) return;
    const queue = this.visibleServers().filter(
      (server) => !['reachable', 'checking'].includes(this.reachability()[server.domain]),
    );
    const sequence = ++this.scanSequence;
    this.scanTotal.set(queue.length);
    this.scanDone.set(0);
    this.scanning.set(true);
    let next = 0;
    const worker = async () => {
      while (sequence === this.scanSequence && next < queue.length) {
        const server = queue[next++];
        await this.checkReachability(server.domain);
        if (sequence === this.scanSequence) this.scanDone.update((count) => count + 1);
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, queue.length) }, worker));
    if (sequence === this.scanSequence) this.scanning.set(false);
  }

  protected setCapability(event: Event): void {
    this.capabilityFilter.set(
      (event.target as HTMLSelectElement).value as
        'any' | 'none' | 'accounts' | 'posts' | 'hashtags',
    );
  }

  protected setReach(event: Event): void {
    this.reachFilter.set(
      (event.target as HTMLSelectElement).value as 'all' | 'reachable' | 'unreachable',
    );
  }

  protected async checkReachability(domain: string): Promise<void> {
    const controller = new AbortController();
    this.reachChecks.set(domain, controller);
    this.reachability.update((state) => ({ ...state, [domain]: 'checking' }));
    try {
      const response = await fetch(`https://${domain}/api/v1/instance`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]),
      });
      if (!controller.signal.aborted)
        this.reachability.update((state) => ({
          ...state,
          [domain]: response.ok ? 'reachable' : 'unreachable',
        }));
    } catch {
      if (!controller.signal.aborted)
        this.reachability.update((state) => ({ ...state, [domain]: 'unreachable' }));
    } finally {
      if (this.reachChecks.get(domain) === controller) this.reachChecks.delete(domain);
    }
  }

  protected useListed(server: SearchServerFlags): void {
    if (this.reachability()[server.domain] !== 'reachable') return;
    this.selected.emit(`https://${server.domain}`);
    this.closeDialog();
  }

  /** The shipped snapshot, fetched once per component; null when it cannot be read. */
  private loadSnapshot(): Promise<SearchServerSnapshot | null> {
    this.snapshot ??= fetch(new URL(SNAPSHOT_URL, document.baseURI).toString())
      .then((response) => (response.ok ? (response.json() as Promise<SearchServerSnapshot>) : null))
      .catch(() => null);
    return this.snapshot;
  }
}
