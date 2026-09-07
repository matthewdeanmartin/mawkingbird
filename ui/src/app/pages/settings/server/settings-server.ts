import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '../../../auth';
import { MastodonServers } from '../../../mastodon-servers';
import { AnonymousAccount } from '../../../providers/anonymous/anonymous-account';
import { AnonymousPreferences } from '../../../providers/anonymous/anonymous-preferences';
import { ServerDiscovery } from '../../../server-discovery/server-discovery';
import { ServerPicker } from '../../../server-picker/server-picker';
import { probeServerAvailability } from '../../../server-availability';
import { SearchServerDiscovery } from '../../../search-server-discovery/search-server-discovery';
import { SearchServer } from '../../../search-server';
import { FeedCapability } from '../../../feed-capability';
import { SearchCapability } from '../../../search-capability';
import { SearchServerRejects, rejectReason } from '../../../search-server-rejects';
import { TranslocoPipe } from '@jsverse/transloco';

type ConnectionStatus = 'checking' | 'available' | 'degraded' | 'unreachable';

/** Anonymous-only control for the public Mastodon instance used by read-only API calls. */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.server.title: Server
// i18n settings.server.intro: Choose the Mastodon server used for public timelines, profiles, and searches while you browse anonymously. Your browser-local identity and preferences stay the same.
// i18n settings.server.current: Current server
// i18n settings.server.usersListed: · {{count}} users listed
// i18n settings.server.status.checking: Checking…
// i18n settings.server.status.available: ✓ Available
// i18n settings.server.status.degraded: ⚠ Available, but degraded — images will not load
// i18n settings.server.status.unreachable: ⚠ Unreachable
// i18n settings.server.checkConnection: Check connection
// i18n settings.server.changed: Now browsing anonymously via {{host}}.
// i18n settings.server.findAnother: Find another server
// i18n settings.server.findAnother.hint: We’ll check randomly selected servers from the bundled Mastodon directory. Nothing changes until you approve a working server.
// i18n settings.server.specific: Use a specific server
// i18n settings.server.specific.hint: Enter a server domain if you already know where you want to browse.
// i18n settings.server.search: Search server
// i18n settings.server.search.hint: Many servers disable search for logged-out visitors, and practically none will full-text search posts without an account — the best you get is the posts behind a hashtag, and not every server serves those either. Search — and only search — can be sent to one that does.
// i18n settings.server.search.here: Searches go here. Everything else uses your own server.
// i18n settings.server.search.own: Your own server
// i18n settings.server.search.none: No separate search server configured.
// i18n settings.server.search.useOwn: Use my own server
// i18n settings.server.rejects.one: {{count}} server checked and rejected
// i18n settings.server.rejects.other: {{count}} servers checked and rejected
// i18n settings.server.rejects.hint: These are skipped when hunting for a search server, so a second hunt doesn't re-probe the same servers. A server that turns search on later won't be found again until you forget them.
// i18n settings.server.rejects.forget: Forget all {{count}} and re-check
// i18n settings.server.anonymous: Anonymous browsing
@Component({
  selector: 'app-settings-server',
  imports: [FormsModule, ServerDiscovery, ServerPicker, SearchServerDiscovery, TranslocoPipe],
  templateUrl: './settings-server.html',
  styleUrl: './settings-server.css',
})
export class SettingsServer implements OnInit {
  private readonly auth = inject(Auth);
  private readonly anonymous = inject(AnonymousAccount);
  protected readonly anonymousPreferences = inject(AnonymousPreferences);
  private readonly directory = inject(MastodonServers);
  private readonly searchCapability = inject(SearchCapability);
  private readonly feedCaps = inject(FeedCapability);
  protected readonly searchServer = inject(SearchServer);
  protected readonly rejects = inject(SearchServerRejects);
  protected readonly rejectReason = rejectReason;

  protected readonly currentUrl = this.anonymous.server;
  protected readonly currentHost = computed(() => this.currentUrl().replace(/^https?:\/\//, ''));
  protected readonly suggestion = computed(() =>
    this.directory.servers().find((item) => item.domain === this.currentHost()),
  );
  protected readonly connectionStatus = signal<ConnectionStatus>('checking');
  protected readonly changed = signal(false);
  /**
   * Retention choices, sharing the `settings.anonymous.age.*` keys with the
   * Anonymous settings page: it is the same control rendered in two places, and
   * one set of translations should cover both.
   */
  protected readonly ageOptions = [
    { days: 30, key: 'settings.anonymous.age.days30' },
    { days: 90, key: 'settings.anonymous.age.months3' },
    { days: 180, key: 'settings.anonymous.age.months6' },
    { days: 365, key: 'settings.anonymous.age.years1' },
    { days: 730, key: 'settings.anonymous.age.years2' },
    { days: 1825, key: 'settings.anonymous.age.years5' },
  ];

  ngOnInit(): void {
    void this.directory.ensureLoaded();
    void this.checkCurrent();
  }

  protected useServer(url: string): void {
    this.auth.enterAnonymous(url);
    this.changed.set(true);
    void this.checkCurrent();
  }

  protected async checkCurrent(): Promise<void> {
    this.connectionStatus.set('checking');
    // Which feeds this server serves is cached for a day, so "check connection"
    // is also the button that re-asks: someone whose admin just turned the
    // local timeline back on has one obvious place to go, and it is this one.
    this.feedCaps.reset();
    this.feedCaps.ensureAll();
    try {
      const result = await probeServerAvailability(this.currentUrl());
      this.connectionStatus.set(result.status);
    } catch {
      this.connectionStatus.set('unreachable');
    }
  }

  // --- search server ---
  // Search can be pointed at a different instance than everything else, because
  // plenty of servers turn off anonymous search. Only the search call moves.

  /** Adopt a search server found by the discovery walk. */
  protected useSearchServer(url: string): void {
    this.searchServer.setBaseUrl(url);
    // Per-host verdicts don't describe the new host. Drop them.
    this.searchCapability.reset();
  }

  protected clearSearchServer(): void {
    this.searchServer.clear();
    this.searchCapability.reset();
  }

  protected forgetRejects(): void {
    this.rejects.clear();
  }

  protected setMaximumAge(days: string | number): void {
    this.anonymousPreferences.setFollowedPostMaxAgeDays(Number(days));
  }
}
