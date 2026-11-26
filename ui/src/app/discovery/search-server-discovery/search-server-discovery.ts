import { translatedComputed } from '../../i18n/translated';
import { MbButton } from '../../design-system/button/button';
import { MbDialog } from '../../design-system/dialog/dialog';
import {
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

// i18n searchServerDiscovery.start: Find a search server
// i18n searchServerDiscovery.title: Search server directory
// i18n searchServerDiscovery.close: Close
// i18n searchServerDiscovery.intro: Choose the search you need, then pick a server. We check your connection when you choose one.
// i18n searchServerDiscovery.support: Search support
// i18n searchServerDiscovery.accounts: Accounts
// i18n searchServerDiscovery.posts: Posts
// i18n searchServerDiscovery.hashtags: Hashtags
// i18n searchServerDiscovery.checking: Checking connection…
// i18n searchServerDiscovery.finding: That server is unavailable from your network. Looking for one you can reach…
// i18n searchServerDiscovery.found: This server is reachable from your network.
// i18n searchServerDiscovery.noAvailable: No reachable server was found for this search.
// i18n searchServerDiscovery.use: Use this search server
// i18n searchServerDiscovery.noMatches: No servers offer this search in the current directory.
// i18n searchServerDiscovery.checkedAt: Directory checked {{date}}.
/** One server's anonymous-search support, measured while preparing the snapshot. */
export interface SearchServerFlags {
  domain: string;
  accounts: boolean;
  posts: boolean;
  tagsOnly: boolean;
}

export interface SearchServerSnapshot {
  checkedAt: string;
  checked: number;
  servers: SearchServerFlags[];
}

type Capability = 'accounts' | 'hashtags' | 'posts';
const SNAPSHOT_URL = 'search-servers.json';

/** Choose from build-time capabilities; only probe the network after a choice. */
@Component({
  selector: 'app-search-server-discovery',
  imports: [MbButton, MbDialog, TranslocoPipe],
  templateUrl: './search-server-discovery.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './search-server-discovery.css',
})
export class SearchServerDiscovery implements OnDestroy {
  private readonly transloco = inject(TranslocoService);
  readonly currentServer = input('');
  readonly startLabel = input('');
  protected readonly startText = translatedComputed(
    () => this.startLabel() || this.transloco.translate<string>('searchServerDiscovery.start'),
  );
  readonly selected = output<string>();

  protected readonly dialogOpen = signal(false);
  protected readonly directoryServers = signal<SearchServerFlags[]>([]);
  protected readonly checkedAt = signal('');
  protected readonly capability = signal<Capability>('accounts');
  protected readonly hasPosts = computed(() =>
    this.directoryServers().some((server) => server.posts),
  );
  protected readonly checking = signal('');
  protected readonly finding = signal(false);
  protected readonly fallback = signal(false);
  protected readonly available = signal<SearchServerFlags[]>([]);
  protected readonly exhausted = signal(false);
  protected readonly candidates = computed(() => {
    const current = this.currentServer()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .toLowerCase();
    return this.directoryServers().filter(
      (server) =>
        server.domain.toLowerCase() !== current && this.supports(server, this.capability()),
    );
  });
  protected readonly visibleServers = computed(() =>
    this.fallback() ? this.available() : this.candidates(),
  );

  private controller: AbortController | null = null;
  private sequence = 0;
  private snapshot: Promise<SearchServerSnapshot | null> | null = null;

  ngOnDestroy(): void {
    this.closeDialog();
  }

  protected async openDialog(): Promise<void> {
    this.cancel();
    this.fallback.set(false);
    this.available.set([]);
    this.exhausted.set(false);
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
    this.cancel();
  }

  private cancel(): void {
    this.sequence++;
    this.controller?.abort();
    this.controller = null;
    this.checking.set('');
    this.finding.set(false);
  }

  protected setCapability(event: Event): void {
    this.cancel();
    this.capability.set((event.target as HTMLSelectElement).value as Capability);
    this.fallback.set(false);
    this.available.set([]);
    this.exhausted.set(false);
  }

  /** A chosen host gets one reachability request. Only a failure starts a fallback walk. */
  protected async choose(server: SearchServerFlags): Promise<void> {
    if (this.checking() || this.finding()) return;
    const sequence = ++this.sequence;
    if (this.fallback()) {
      this.selected.emit(`https://${server.domain}`);
      this.closeDialog();
      return;
    }
    this.checking.set(server.domain);
    const reachable = await this.checkReachability(server.domain);
    if (sequence !== this.sequence) return;
    this.checking.set('');
    if (reachable) {
      this.selected.emit(`https://${server.domain}`);
      this.closeDialog();
      return;
    }
    this.fallback.set(true);
    this.finding.set(true);
    for (const candidate of this.candidates()) {
      if (sequence !== this.sequence) return;
      if (candidate.domain === server.domain) continue;
      if (await this.checkReachability(candidate.domain)) {
        if (sequence !== this.sequence) return;
        this.available.set([candidate]);
        this.finding.set(false);
        return;
      }
    }
    if (sequence === this.sequence) {
      this.finding.set(false);
      this.exhausted.set(true);
    }
  }

  private supports(server: SearchServerFlags, capability: Capability): boolean {
    if (capability === 'hashtags') return server.tagsOnly || server.posts;
    return server[capability];
  }

  private async checkReachability(domain: string): Promise<boolean> {
    const controller = new AbortController();
    this.controller = controller;
    try {
      const response = await fetch(`https://${domain}/api/v1/instance`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]),
      });
      return response.ok && !controller.signal.aborted;
    } catch {
      return false;
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  private loadSnapshot(): Promise<SearchServerSnapshot | null> {
    this.snapshot ??= fetch(new URL(SNAPSHOT_URL, document.baseURI).toString())
      .then((response) => (response.ok ? (response.json() as Promise<SearchServerSnapshot>) : null))
      .catch(() => null);
    return this.snapshot;
  }
}
