import { translatedComputed } from '../../i18n/translated';
import { defaultServer } from '../../platform/http/home-server';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { map, Subscription, tap, timeout } from 'rxjs';
import { qualifiedHandle } from '../../accounts/account-handle';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { MbAddBox } from '../../design-system/add-box/add-box';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { RadioOption } from '../../design-system/radio-group/radio-group';
import { MbTab, MbTabs } from '../../design-system/tabs/tabs';
import { serializeMastodonQuery } from '../../discovery/search/mastodon-query-serializer';
import { isMastodonSaved, SavedSearches } from '../../discovery/search/saved-searches';
import { Api } from '../../platform/api/api';
import { Status, UserList } from '../../platform/api/models';
import { PageDiagnostics } from '../../platform/diagnostics/page-diagnostics';
import { Server } from '../../platform/http/server';
import { Auth } from '../../platform/session/auth';
import { listenParams, radioAccount } from '../radio-links';
import { CataloguePanel } from './catalogue-panel';
import { RadioDock } from './radio-dock';
import { RadioHeader } from './radio-header';
import {
  isContinuous,
  RadioPlayer,
  RadioSource,
  RadioTrack,
  radioTag,
  recordingId,
} from './radio-player';
import { RadioPlaylists, SavedRadioPlaylist } from './radio-playlists';
import { SavedSingles } from './saved-singles';
import { TrackActions } from './track-actions';
import { SinglesTabs } from './section-tabs';
import { ReadingBack } from '../../shell/reading-back';
import { TrackResult } from './track-result';
import { countKey } from './count-key';

// i18n findSingles.addTitle: Add to {{playlist}}
// i18n findSingles.addLead: Recordings that play one after another can join this playlist. Others play on their own page.
// i18n findSingles.where: Where to look
// i18n findSingles.scope.account: Account
// i18n findSingles.scope.accountHint: Everything one person has posted.
// i18n findSingles.scope.tag: Tags
// i18n findSingles.scope.tagHint: Such as #nowplaying or #fedimusic.
// i18n findSingles.scope.home: Home
// i18n findSingles.scope.homeHint: Posts from people you follow.
// i18n findSingles.scope.list: List
// i18n findSingles.scope.listHint: One of your lists.
// i18n findSingles.scope.saved: Searches
// i18n findSingles.scope.savedHint: A search saved on the Search screen.
// i18n findSingles.scope.catalogue: Catalogues
// i18n findSingles.scope.catalogueHint: Library of Congress, Internet Archive, Openverse, Audius and Wikimedia Commons.
// i18n findSingles.scope.links: Links
// i18n findSingles.scope.linksHint: Paste post links, audio files, SoundCloud or Mixcloud links.
// i18n findSingles.progress.one: Scanned {{scanned}} posts in {{requests}} API call · {{matches}} with music
// i18n findSingles.progress.other: Scanned {{scanned}} posts in {{requests}} API calls · {{matches}} with music
// i18n findSingles.openSaved: Open Saved singles
// i18n findSingles.openPlaylist: Open {{playlist}}
// i18n findSingles.savedSearch: Saved search
// i18n findSingles.chooseSaved: Choose a saved search
// i18n findSingles.links: Links, one or more
// i18n findSingles.openLinks: Open links
// i18n findSingles.save: Save single
// i18n findSingles.saved: Saved
// i18n findSingles.addToPlaylist: Add to playlist
// i18n findSingles.added: Added
// i18n findSingles.nativeOnly: Only native Mastodon audio: recordings attached to posts, which always play in a playlist
// i18n findSingles.saveResults: Save all results
// i18n findSingles.addResults: Add all results
// i18n findSingles.empty: Choose where to look, then search.
// i18n findSingles.anonymousFeeds: Sign in to look through your home feed, lists and saved searches.

const SCAN_SOURCES = ['account', 'tag', 'home', 'list', 'saved'] as const;

@Component({
  selector: 'app-find-singles-page',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbAddBox,
    MbButton,
    MbCheckbox,
    MbContentState,
    MbField,
    MbControl,
    MbTabs,
    MbTab,
    CataloguePanel,
    RadioHeader,
    SinglesTabs,
    TrackResult,
    ReadingBack,
  ],
  templateUrl: './find-singles-page.html',
  styleUrl: './radio-lists.css',
})
export class FindSinglesPage {
  private readonly diagnostics = inject(PageDiagnostics);
  private readonly publicApi = inject(AnonymousPublicApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly api = inject(Api);
  private readonly destroy = inject(DestroyRef);
  private readonly server = inject(Server);
  private readonly mainSearches = inject(SavedSearches);
  readonly auth = inject(Auth);
  readonly player = inject(RadioPlayer);
  readonly playlists = inject(RadioPlaylists);
  readonly singles = inject(SavedSingles);
  private readonly actions = inject(TrackActions);
  readonly scan = this.player.scan;
  readonly source = this.player.source;
  readonly tag = this.player.tag;
  readonly handle = this.player.handle;
  readonly listId = this.player.listId;
  readonly started = this.player.started;
  readonly scanReady = this.player.scanReady;
  readonly savedId = signal('');
  readonly lists = signal<UserList[]>([]);
  readonly resolving = signal(false);
  readonly failed = signal(false);
  readonly importText = signal('');
  readonly importing = signal(false);
  readonly importSkipped = signal<number | null>(null);
  readonly message = signal('');
  /** The playlist results are added to, from `?playlist=`; none means saving Singles. */
  readonly targetId = signal<string | null>(null);
  readonly target = computed(
    () => this.playlists.saved().find((row) => row.id === this.targetId()) ?? null,
  );
  private lookup?: Subscription;
  private listRequest?: Subscription;
  private sourceKey = '';
  private importGeneration = 0;

  readonly results = computed(() => this.scan.posts());
  /** How far a scan got, so a long one is never silent: posts read, requests sent, matches. */
  readonly progress = translatedComputed(() =>
    this.transloco.translate(countKey('findSingles.progress', this.scan.requests()), {
      scanned: this.scan.scanned(),
      requests: this.scan.requests(),
      matches: this.results().length,
    }),
  );
  private readonly resultsArea = viewChild<ElementRef<HTMLElement>>('resultsArea');
  readonly canPlayResults = computed(() => this.player.resultTracks().length > 0);
  readonly catalogueSource = computed(() => this.source() === 'catalogue');
  /** Saved post searches (signed in) and hashtag searches from the main Search screen. */
  readonly savedSearches = computed(() =>
    this.mainSearches
      .all()
      .filter(isMastodonSaved)
      .filter(
        (saved) =>
          (saved.search.target === 'posts' && this.signedIn) ||
          (saved.search.target === 'hashtags' && !!radioTag(saved.search.hashtag?.text ?? '')),
      ),
  );
  readonly scopes = translatedComputed<RadioOption[]>(() => {
    const t = (key: string) => this.transloco.translate(key);
    return [
      {
        value: 'account',
        label: t('findSingles.scope.account'),
        hint: t('findSingles.scope.accountHint'),
      },
      { value: 'tag', label: t('findSingles.scope.tag'), hint: t('findSingles.scope.tagHint') },
      ...(this.signedIn
        ? [
            {
              value: 'home',
              label: t('findSingles.scope.home'),
              hint: t('findSingles.scope.homeHint'),
            },
            {
              value: 'list',
              label: t('findSingles.scope.list'),
              hint: t('findSingles.scope.listHint'),
            },
          ]
        : []),
      ...(this.savedSearches().length
        ? [
            {
              value: 'saved',
              label: t('findSingles.scope.saved'),
              hint: t('findSingles.scope.savedHint'),
            },
          ]
        : []),
      {
        value: 'catalogue',
        label: t('findSingles.scope.catalogue'),
        hint: t('findSingles.scope.catalogueHint'),
      },
      {
        value: 'links',
        label: t('findSingles.scope.links'),
        hint: t('findSingles.scope.linksHint'),
      },
    ];
  });
  /** Whether the chosen scan source has what it needs to search. */
  readonly searchReady = computed(() => {
    const source = this.source();
    if (source === 'tag') return !!radioTag(this.tag());
    if (source === 'account') return !!this.handle().trim();
    if (source === 'list') return !!this.listId();
    if (source === 'saved') return !!this.savedId();
    return source === 'home';
  });
  readonly scanSource = computed(() => (SCAN_SOURCES as readonly string[]).includes(this.source()));

  constructor() {
    this.player.installDock(RadioDock);
    effect(() => {
      this.auth.kind();
      this.auth.token();
      this.playlists.refresh();
      this.singles.refresh();
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((params) => {
      this.targetId.set(params.get('playlist'));
      const account = radioAccount(params.get('acct'));
      const key = account?.acct ?? '';
      if (key === this.sourceKey) return;
      this.sourceKey = key;
      if (!account) return;
      // A shared account link shows its audio; keeping any of it is the listener's choice.
      this.cancel();
      this.player.nativeOnly.set(false);
      this.source.set('account');
      this.handle.set(account.acct);
      if (this.signedIn) this.discover();
      else this.discoverPublicAccount(account);
    });
    if (this.source() === 'list') this.chooseSource('list');
    if (!this.signedIn && !['account', 'tag', 'catalogue', 'links'].includes(this.source()))
      this.source.set('account');
    this.destroy.onDestroy(() => {
      this.importGeneration++;
      this.lookup?.unsubscribe();
      if (!this.player.following()) this.scan.cancel();
    });
  }

  suspendReading(): void {
    this.lookup?.unsubscribe();
    // A queue that follows this scan owns it; leaving the page must not stop the music.
    if (!this.player.following()) this.scan.cancel();
  }

  resumeReading(): void {
    /* Results and the form stay as they were. */
  }

  get signedIn(): boolean {
    return !this.auth.isAnonymous && !this.auth.isForeignPrimary;
  }

  chooseSource(choice: string): void {
    const source = choice as RadioSource;
    // Results belong to the search that found them; a new place starts empty.
    if (source !== this.source()) this.reset();
    this.source.set(source);
    if (source === 'list' && !this.lists().length && this.signedIn) {
      this.listRequest?.unsubscribe();
      this.failed.set(false);
      this.listRequest = this.api
        .lists()
        .pipe(timeout(30_000), takeUntilDestroyed(this.destroy))
        .subscribe({
          next: (lists) => this.lists.set(lists),
          error: (error) => {
            this.diagnostics.error('Radio', 'lists:failed', error);
            this.failed.set(true);
          },
        });
    }
  }

  /** A saved hashtag search runs as the hashtag source; a post search runs as itself. */
  chooseSaved(id: string): void {
    this.savedId.set(id);
  }

  cancel(): void {
    this.lookup?.unsubscribe();
    this.resolving.set(false);
    this.scan.cancel();
  }

  /** Forget the current search and its results; what is playing keeps playing. */
  private reset(): void {
    this.importGeneration++;
    this.cancel();
    this.player.following.set(false);
    this.scan.clear();
    this.started.set(false);
    this.scanReady.set(false);
    this.failed.set(false);
    this.importing.set(false);
    this.importSkipped.set(null);
    this.message.set('');
  }

  /** The filter changes what a search finds, so it searches again when it can. */
  changeNativeOnly(value: boolean): void {
    this.reset();
    this.player.nativeOnly.set(value);
    if (this.scanSource() && this.searchReady()) this.discover();
  }

  /** Begin a fresh scan: what is playing keeps playing, but no longer follows the old results. */
  private begin(): void {
    this.cancel();
    this.player.following.set(false);
    this.scan.clear();
    this.failed.set(false);
    this.message.set('');
    this.importSkipped.set(null);
    this.started.set(true);
    // Results start below the form; bring them into view so the search visibly began.
    setTimeout(() =>
      this.resultsArea()?.nativeElement.scrollIntoView?.({ block: 'start', behavior: 'smooth' }),
    );
  }

  discover(): void {
    if (!this.searchReady()) return;
    const source = this.source();
    if (source === 'saved') {
      const saved = this.savedSearches().find((item) => item.id === this.savedId());
      if (saved?.search.target === 'hashtags') {
        this.tag.set(radioTag(saved.search.hashtag?.text ?? '') ?? '');
        this.discoverTag();
      } else this.discoverSaved();
      return;
    }
    if (source === 'tag') {
      this.discoverTag();
      return;
    }
    if (!this.scanSource()) return;
    if (!this.signedIn && source === 'account') {
      const account = radioAccount(this.handle());
      if (account) this.discoverPublicAccount(account);
      return;
    }
    if (!this.signedIn || Date.now() < this.scan.retryAt()) return;
    this.begin();
    this.scanReady.set(false);
    const nativeOnly = this.player.nativeOnly();
    if (source === 'home') {
      this.scanReady.set(true);
      void this.scan.start((cursor) =>
        this.api.homeTimelinePage(cursor).pipe(
          tap({ error: (error) => this.scanError(error, 'signed-in') }),
          map((page) => ({ statuses: page.statuses, next: page.nextMaxId })),
        ),
      );
    } else if (source === 'list') {
      const id = this.listId();
      if (!id) return;
      this.scanReady.set(true);
      void this.scan.start((cursor) =>
        this.api
          .listTimeline(id, cursor, 40)
          .pipe(tap({ error: (error) => this.scanError(error, 'signed-in') }), map(feedPage)),
      );
    } else {
      const handle = this.handle().trim().replace(/^@/, '');
      if (!handle) return;
      this.resolving.set(true);
      this.lookup = this.api
        .lookupAccount(handle)
        .pipe(timeout(30_000), takeUntilDestroyed(this.destroy))
        .subscribe({
          next: (account) => {
            const acct = qualifiedHandle(account);
            if (acct) this.updateSourceUrl(acct);
            this.resolving.set(false);
            this.scanReady.set(true);
            void this.scan.start((cursor) =>
              this.api
                .getAccountStatuses(account.id, {
                  maxId: cursor,
                  limit: 40,
                  onlyMedia: nativeOnly,
                  excludeReblogs: true,
                })
                .pipe(tap({ error: (error) => this.scanError(error, 'signed-in') }), map(feedPage)),
            );
          },
          error: (error) => {
            this.diagnostics.error('Radio', 'account-lookup:failed', error, {
              transport: 'signed-in',
              handle,
            });
            this.resolving.set(false);
            this.failed.set(true);
          },
        });
    }
  }

  /**
   * A hashtag timeline: posts are usually links to players rather than attached
   * audio, so the server-side media filter applies only to native-only searches.
   * Signed out, the public timeline of the browsing server is read anonymously.
   */
  private discoverTag(): void {
    const tag = radioTag(this.tag());
    if (!tag || Date.now() < this.scan.retryAt()) return;
    this.begin();
    this.scanReady.set(true);
    const nativeOnly = this.player.nativeOnly();
    if (this.signedIn) {
      void this.scan.start((cursor) =>
        this.api
          .tagTimeline(tag, cursor, 40, nativeOnly)
          .pipe(tap({ error: (error) => this.scanError(error, 'signed-in') }), map(feedPage)),
      );
      return;
    }
    const server = this.server.baseUrl() || defaultServer();
    void this.scan.start((cursor) =>
      this.publicApi.getTagTimeline(server, tag, cursor, 40, nativeOnly).pipe(
        tap({ error: (error) => this.scanError(error, 'public-origin') }),
        map((statuses) => ({
          statuses,
          next:
            (statuses.at(-1)?.providerRef as { statusId?: string } | undefined)?.statusId ?? null,
        })),
      ),
    );
  }

  /** A saved post search runs through the server's search, paging by offset. */
  private discoverSaved(): void {
    const saved = this.savedSearches().find((item) => item.id === this.savedId());
    const criteria = saved?.search.post;
    if (!saved || !criteria || !this.signedIn || Date.now() < this.scan.retryAt()) return;
    this.begin();
    this.scanReady.set(true);
    const query = serializeMastodonQuery(
      this.player.nativeOnly() ? { ...criteria, contentType: 'audio' } : criteria,
    );
    void this.scan.start((cursor) => {
      const offset = Number(cursor ?? 0);
      return this.api.search(query, 'statuses', { limit: 40, offset }).pipe(
        tap({ error: (error) => this.scanError(error, 'signed-in') }),
        map((results) => ({
          statuses: results.statuses,
          next: results.statuses.length ? String(offset + results.statuses.length) : null,
        })),
      );
    });
  }

  private discoverPublicAccount(account: { acct: string; server: string }): void {
    if (Date.now() < this.scan.retryAt()) return;
    this.begin();
    this.resolving.set(true);
    this.lookup = this.publicApi
      .lookupAccount(account.server, account.acct.split('@')[0])
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (resolved) => {
          this.resolving.set(false);
          const ref = { server: account.server, id: resolved.id };
          this.scanReady.set(true);
          void this.scan.start((cursor) =>
            this.publicApi
              .getAccountStatuses(ref, {
                maxId: cursor,
                limit: 40,
                excludeReblogs: true,
                onlyMedia: this.player.nativeOnly(),
              })
              .pipe(
                tap({ error: (error) => this.scanError(error, 'public-origin') }),
                map((statuses) => ({
                  statuses,
                  next:
                    (statuses.at(-1)?.providerRef as { statusId?: string } | undefined)?.statusId ??
                    null,
                })),
              ),
          );
        },
        error: (error) => {
          this.diagnostics.error('Radio', 'account-lookup:failed', error, {
            transport: 'public-origin',
            handle: account.acct,
          });
          this.resolving.set(false);
          this.failed.set(true);
        },
      });
  }

  /** Pasted links become results, shown as posts like any other search. */
  async openLinks(): Promise<void> {
    const urls = this.importText().match(/https?:\/\/[^\s<>"]+/g) ?? [];
    if (!urls.length) return;
    const generation = ++this.importGeneration;
    this.begin();
    this.importing.set(true);
    const result = await this.playlists.importUrls(urls, true);
    if (generation !== this.importGeneration) return;
    this.scan.posts.set([
      ...new Map(result.tracks.map((track) => [track.post.id, track.post])).values(),
    ]);
    this.scan.exhausted.set(true);
    this.importSkipped.set(result.skipped);
    this.importing.set(false);
  }

  private scanError(error: unknown, transport: string): void {
    this.diagnostics.error('Radio', 'feed-scan:failed', error, {
      transport,
      source: this.source(),
      handle: this.source() === 'account' ? this.handle() : undefined,
    });
  }

  private updateSourceUrl(acct: string): void {
    this.sourceKey = acct;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { acct },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  retryTime(): string {
    return new Date(this.scan.retryAt()).toLocaleTimeString();
  }

  /** What a result offers: every recording it can be saved as, or the playlist's continuous ones. */
  private candidates(post: Status): RadioTrack[] {
    const singles = this.player.singlesOf(post);
    const row = this.target();
    return row ? singles.filter(isContinuous) : singles;
  }

  canKeep(post: Status): boolean {
    return this.candidates(post).length > 0;
  }

  /** Whether every recording the result offers is already saved, or already in the target. */
  isKept(post: Status): boolean {
    const tracks = this.candidates(post);
    if (!tracks.length) return false;
    const row = this.target();
    const kept = new Set(
      (row ? row.tracks : this.singles.items().map((item) => item.track)).map(recordingId),
    );
    return tracks.every((track) => kept.has(recordingId(track)));
  }

  /** Save the post's Singles (or add them to the target); pressed again, take them back out. */
  keep(post: Status): void {
    if (!this.isKept(post)) {
      this.keepTracks(this.candidates(post));
      return;
    }
    const tracks = this.candidates(post);
    const ids = new Set(tracks.map(recordingId));
    const row = this.target();
    if (row)
      this.playlists.update(row.id, (item) => ({
        ...item,
        tracks: item.tracks.filter((track) => !ids.has(recordingId(track))),
      }));
    else for (const track of tracks) this.singles.remove(track);
    this.message.set('');
  }

  /** Tell people about this result on the Share page. */
  share(post: Status): void {
    const [track] = this.player.singlesOf(post);
    if (track) this.actions.share(track);
  }

  keptLabel(): string {
    return this.target() ? 'findSingles.added' : 'findSingles.saved';
  }

  keepResults(): void {
    this.keepTracks(this.results().flatMap((post) => this.candidates(post)));
  }

  private keepTracks(tracks: RadioTrack[]): void {
    this.message.set(this.actions.keep(tracks, this.target()?.id));
  }

  /** Play a result as a Single; one that only plays on its own page opens there. */
  playPost(post: Status): void {
    const tracks = this.player.singlesOf(post);
    if (tracks.some(isContinuous)) this.player.playTracks(tracks.filter(isContinuous));
    else if (tracks.length)
      void this.router.navigate(['/listen'], {
        queryParams: listenParams(post, this.server.baseUrl()),
      });
  }

  /** Play every result found so far, continuing as the scan reads further. */
  playResults(): void {
    this.player.playResults();
  }

  playlistLink(row: SavedRadioPlaylist): string[] {
    return ['/playlists', row.id];
  }

  keepLabel(): string {
    return this.target() ? 'findSingles.addToPlaylist' : 'findSingles.save';
  }
}

function feedPage(statuses: Status[]): { statuses: Status[]; next: string | null } {
  // Short pages do not prove exhaustion; try the cursor until the server returns no posts.
  return { statuses, next: statuses.at(-1)?.id ?? null };
}
