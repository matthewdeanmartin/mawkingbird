import {
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MastodonServers, ServerSuggestion } from '../mastodon-servers';
import { probeServerAvailability } from '../server-availability';

// i18n serverDiscovery.start: Find another server
// i18n serverDiscovery.searching.label: Looking for an available server…
// i18n serverDiscovery.searching.tried: {{count}} tried
// i18n serverDiscovery.searching.cancel: Cancel
// i18n serverDiscovery.searching.bundledNote: Using the bundled Mastodon server directory.
// i18n serverDiscovery.candidate.available: {{domain}} is available
// i18n serverDiscovery.candidate.availableDegraded: {{domain}} is available but degraded
// i18n serverDiscovery.candidate.degradedNote: Images will not load because {{mediaHost}} is blocked or down.
// i18n serverDiscovery.candidate.itsMediaServer: its media server
// i18n serverDiscovery.candidate.use: Use this server
// i18n serverDiscovery.candidate.keepLooking: Keep looking
// i18n serverDiscovery.exhausted.note: Couldn’t find an available server right now. Your current server has not changed.
// i18n serverDiscovery.exhausted.retry: Search again
// i18n serverDiscovery.acceptDegraded.label: Accept degraded servers with blocked or down CDNs
// i18n serverDiscovery.sizeLabel.veryLarge: very large
// i18n serverDiscovery.sizeLabel.large: large
// i18n serverDiscovery.sizeLabel.midSize: mid-size
// i18n serverDiscovery.sizeLabel.cozy: cozy

type DiscoveryState = 'idle' | 'searching' | 'found' | 'exhausted';

export interface DiscoveredServer extends ServerSuggestion {
  title: string;
  degraded: boolean;
  mediaHost: string | null;
}

/** Finds a CORS-accessible Mastodon instance without depending on the live directory. */
@Component({
  selector: 'app-server-discovery',
  imports: [TranslocoPipe],
  templateUrl: './server-discovery.html',
  styleUrl: './server-discovery.css',
})
export class ServerDiscovery implements OnDestroy, OnInit {
  private readonly directory = inject(MastodonServers);
  private readonly transloco = inject(TranslocoService);

  readonly currentServer = input('');
  /**
   * The button's text. Empty means "use the default", which is a translation
   * key rather than an English literal — an `input()` default is evaluated
   * before any injection context exists, so it cannot call `translate()`
   * itself. Callers that pass their own label are unaffected.
   */
  readonly startLabel = input('');
  protected readonly startText = computed(
    () => this.startLabel() || this.transloco.translate<string>('serverDiscovery.start'),
  );
  /**
   * Begin hunting on mount instead of waiting for a click.
   *
   * For the unreachable-server dialog, where the visitor did not go looking for
   * a server picker — they asked to read the app and the door was shut. Making
   * them press a button to start a search they never requested adds a step to
   * an error path. Off by default: the settings and login mounts are places
   * someone chose to go, and a page that starts probing hundreds of hosts on
   * arrival is not what those pages promise.
   */
  readonly autoStart = input(false);
  readonly selected = output<string>();

  protected readonly state = signal<DiscoveryState>('idle');
  protected readonly candidate = signal<DiscoveredServer | null>(null);
  protected readonly tried = signal(0);
  protected readonly acceptDegraded = signal(false);
  protected readonly directorySource = this.directory.source;

  private readonly attempted = new Set<string>();
  private searchAbort: AbortController | null = null;
  private searchSequence = 0;

  ngOnInit(): void {
    if (this.autoStart()) {
      void this.startSearch();
    }
  }

  ngOnDestroy(): void {
    this.cancel(false);
  }

  protected async startSearch(reset = true): Promise<void> {
    this.cancel(false);
    if (reset) {
      this.attempted.clear();
      this.tried.set(0);
    }
    this.candidate.set(null);
    this.state.set('searching');
    const sequence = ++this.searchSequence;
    this.searchAbort = new AbortController();

    await this.directory.ready();
    if (sequence !== this.searchSequence) {
      return;
    }

    const currentDomain = this.currentServer()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .toLowerCase();
    const excluded = new Set(this.attempted);
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

  protected sizeLabel(users: number): string {
    if (users >= 100_000) return this.transloco.translate('serverDiscovery.sizeLabel.veryLarge');
    if (users >= 10_000) return this.transloco.translate('serverDiscovery.sizeLabel.large');
    if (users >= 1_000) return this.transloco.translate('serverDiscovery.sizeLabel.midSize');
    if (users > 0) return this.transloco.translate('serverDiscovery.sizeLabel.cozy');
    return '';
  }

  private async runWorker(queue: ServerSuggestion[], sequence: number): Promise<void> {
    while (sequence === this.searchSequence && this.state() === 'searching') {
      const server = queue.shift();
      if (!server) {
        return;
      }
      this.attempted.add(server.domain.toLowerCase());
      this.tried.update((count) => count + 1);
      const result = await probeServerAvailability(
        `https://${server.domain}`,
        this.searchAbort?.signal,
        4000,
      );
      const usable =
        result.status === 'available' || (result.status === 'degraded' && this.acceptDegraded());
      if (usable && sequence === this.searchSequence && this.state() === 'searching') {
        this.candidate.set({
          ...server,
          title: result.title,
          degraded: result.status === 'degraded',
          mediaHost: result.mediaUrl ? new URL(result.mediaUrl).host : null,
        });
        this.state.set('found');
        this.searchAbort?.abort();
        return;
      }
    }
  }
}
