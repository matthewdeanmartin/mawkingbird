import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { AnonymousPublicApi } from '../../providers/anonymous/anonymous-public-api';
import { qualifiedHandle } from '../../account-handle';
import { radioAccount, radioPostRef } from '../../radio-links';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom, map, of, Subscription, tap, timeout } from 'rxjs';
import { PageDiagnostics } from '../../page-diagnostics';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { RadioPlayer } from './radio-player';
import { MbNavigation, MbNavLink } from '../../design-system/navigation/navigation';
import { MbToolbar, MbToolbarButton } from '../../design-system/toolbar/toolbar';
import { MbHelp } from '../../design-system/help/help';
import { Drafts } from '../../drafts';
import { RadioHandoff } from '../../radio-handoff';
import {
  playlistFragment,
  playlistUrls,
  readPlaylistFragment,
  RadioPlaylists,
} from './radio-playlists';
import { RadioTrack } from './radio-player';
import { RadioDock } from './radio-dock';
import { RadioIcon } from './radio-icon';
import { RadioStudio } from './radio-studio';
import { Status, UserList } from '../../models';
import { StatusCard } from '../../status-card/status-card';

// i18n radio.title: Radio
// i18n radio.source: Audio source
// i18n radio.account: Account
// i18n radio.home: Home feed
// i18n radio.list: List
// i18n radio.handle: Account handle
// i18n radio.handleHint: Enter a local username or username@server.
// i18n radio.chooseList: Choose a list
// i18n radio.discover: Find audio
// i18n radio.more: Continue scanning
// i18n radio.cancel: Cancel scan
// i18n radio.progress: Scanned {{scanned}} posts · found {{matches}} audio posts
// i18n radio.loading: Looking for audio…
// i18n radio.failed: Could not load audio. Try Find audio again.
// i18n radio.rateLimited: The server asked us to wait until {{time}} before trying again.
// i18n radio.exhausted: Reached the end of the available feed.
// i18n radio.paused: Scan paused. Continue to look for older audio posts.
// i18n radio.empty: Choose a feed to find audio posts.
// i18n radio.signIn: Sign in with a Mastodon account to use Radio.
// i18n radio.studioTitle: Radio Studio
// i18n radio.studioHint: Your audio catalogue and publication workspace will appear here.
// i18n radio.playerHint: Choose audio from an account, your home feed or a list. Radio keeps playing as you explore the app.
// i18n radio.listenProvider: Listen on {{provider}} in Radio
// i18n radio.nativeOnly: Native Mastodon audio only
// i18n radio.nativeOnlyHint: Otherwise, also find links to supported external audio players.

@Component({
  selector: 'app-radio-page',
  imports: [
    FormsModule,
    TranslocoPipe,
    MbButton,
    MbCheckbox,
    MbContentState,
    MbField,
    MbControl,
    StatusCard,
    RouterLink,
    MbNavigation,
    MbNavLink,
    MbToolbar,
    MbToolbarButton,
    MbHelp,
    RadioStudio,
    RadioIcon,
  ],
  templateUrl: './radio-page.html',
  styleUrl: './radio-page.css',
})
export class RadioPage {
  private readonly diagnostics = inject(PageDiagnostics);
  private readonly publicApi = inject(AnonymousPublicApi);
  private readonly route = inject(ActivatedRoute);
  readonly view = signal<'search' | 'playlist' | 'radio'>('search');
  readonly playlists = inject(RadioPlaylists);
  private readonly router = inject(Router);
  private readonly drafts = inject(Drafts);
  private readonly handoff = inject(RadioHandoff);
  readonly playlistName = signal('');
  readonly importText = signal('');
  readonly includeThread = signal(true);
  readonly importing = signal(false);
  readonly importSkipped = signal<number | null>(null);
  readonly message = signal('');
  private importGeneration = 0;
  private sourceKey = '';
  private buildScan = false;
  readonly playlistableOnly = signal(false);
  readonly results = computed(() =>
    this.view() === 'playlist' || this.playlistableOnly()
      ? this.scan.posts().filter((post) => this.player.tracks(post).length)
      : this.scan.posts(),
  );
  readonly shareable = computed(
    () =>
      this.player.queue().length > 0 &&
      playlistUrls(this.player.queue()).length <= 200 &&
      playlistFragment(playlistUrls(this.player.queue())).length <= 100_000 &&
      this.player.queue().every((track) => !!playlistUrls([track]).length),
  );
  readonly shared = signal(false);
  readonly shareParams = signal<{ acct?: string; post?: string } | null>(null);
  private readonly api = inject(Api);
  private readonly destroy = inject(DestroyRef);
  readonly auth = inject(Auth);
  readonly studio = inject(ActivatedRoute).snapshot.routeConfig?.path === 'radio/studio';
  readonly player = inject(RadioPlayer);
  readonly scan = this.player.scan;
  readonly source = this.player.source;
  readonly handle = this.player.handle;
  readonly listId = this.player.listId;
  readonly lists = signal<UserList[]>([]);
  readonly resolving = signal(false);
  readonly failed = signal(false);
  readonly started = this.player.started;
  readonly scanReady = this.player.scanReady;
  private lookup?: Subscription;
  private listRequest?: Subscription;

  constructor() {
    this.player.installDock(RadioDock);
    this.playlists.refresh();
    effect(() => {
      this.auth.kind();
      this.auth.token();
      this.playlists.refresh();
    });
    effect(() => {
      const posts = this.scan.posts();
      if (this.buildScan)
        untracked(() => this.player.addTracks(posts.flatMap((post) => this.player.tracks(post))));
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((params) => {
      if (this.studio) return;
      const post = radioPostRef(params.get('post'));
      const account = radioAccount(params.get('acct'));
      const view = params.get('view');
      this.view.set(
        view === 'search' || view === 'radio' || view === 'playlist'
          ? view
          : post || account
            ? 'playlist'
            : 'search',
      );
      this.player.fullView.set(this.view() === 'radio');
      const key = JSON.stringify([post?.originalUrl, account?.acct, params.get('add')]);
      if (key === this.sourceKey) return;
      this.sourceKey = key;
      this.importGeneration++;
      this.importing.set(false);
      if (!post && !account) return;
      this.shared.set(true);
      this.cancel();
      this.player.editPlaylist();
      this.player.nativeOnly.set(false);
      this.started.set(true);
      this.failed.set(false);
      this.scanReady.set(true);
      if (post) {
        this.shareParams.set({ post: post.originalUrl });
        void this.loadPost(post.originalUrl!, params.get('add') === '1', view === 'radio');
      } else if (account) {
        this.buildScan = true;
        this.source.set('account');
        this.handle.set(account.acct);
        if (this.signedIn) this.discover();
        else this.discoverPublicAccount(account);
      }
    });
    this.route.fragment?.pipe(takeUntilDestroyed(this.destroy)).subscribe((fragment) => {
      const urls = readPlaylistFragment(fragment ?? '');
      if (urls && fragment !== this.lastFragment) {
        this.lastFragment = fragment ?? '';
        this.shared.set(true);
        void this.importLinks(urls, false, true);
      }
    });
    if (this.source() === 'list') this.chooseSource('list');
    this.destroy.onDestroy(() => {
      this.importGeneration++;
      this.player.fullView.set(false);
      this.lookup?.unsubscribe();
      if (!this.player.active()) this.scan.cancel();
    });
  }

  get signedIn(): boolean {
    return !this.auth.isAnonymous && !this.auth.isBlueskyPrimary;
  }

  chooseSource(source: 'account' | 'home' | 'list'): void {
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

  cancel(): void {
    this.lookup?.unsubscribe();
    this.resolving.set(false);
    this.scan.cancel();
  }

  changeNativeOnly(value: boolean): void {
    this.cancel();
    this.player.editPlaylist();
    this.scan.clear();
    this.player.nativeOnly.set(value);
    this.started.set(false);
    this.scanReady.set(false);
    this.failed.set(false);
  }

  discover(): void {
    this.buildScan = this.view() === 'playlist';
    if (!this.signedIn && this.source() === 'account') {
      const account = radioAccount(this.handle());
      if (account) {
        this.shared.set(true);
        this.discoverPublicAccount(account);
        this.updateSourceUrl(account.acct);
      }
      return;
    }
    if (!this.signedIn || Date.now() < this.scan.retryAt()) return;
    this.cancel();
    this.player.editPlaylist();
    this.failed.set(false);
    this.shareParams.set(null);
    this.started.set(true);
    this.scanReady.set(false);
    const source = this.source();
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
            this.shareParams.set(acct ? { acct } : null);
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

  private discoverPublicAccount(account: { acct: string; server: string }): void {
    if (Date.now() < this.scan.retryAt()) return;
    this.cancel();
    this.player.editPlaylist();
    this.scan.clear();
    this.started.set(true);
    this.failed.set(false);
    this.resolving.set(true);
    this.shareParams.set({ acct: account.acct });
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

  private lastFragment = '';
  private scanError(error: unknown, transport: string): void {
    this.diagnostics.error('Radio', 'feed-scan:failed', error, {
      transport,
      source: this.source(),
      handle: this.source() === 'account' ? this.handle() : undefined,
    });
  }
  private updateSourceUrl(acct: string): void {
    this.sourceKey = JSON.stringify([undefined, acct, null]);
    void this.router.navigate(['/radio'], {
      queryParams: { view: this.view(), acct },
      replaceUrl: true,
    });
  }
  switchView(view: 'search' | 'playlist' | 'radio'): void {
    void this.router.navigate(['/radio'], {
      queryParams: { view },
      queryParamsHandling: 'merge',
      preserveFragment: true,
    });
  }
  syncPlaylistUrl(view = this.view()): void {
    this.buildScan = false;
    const urls = playlistUrls(this.player.queue());
    this.lastFragment = this.shareable() ? playlistFragment(urls) : '';
    void this.router.navigate(['/radio'], {
      queryParams: { view },
      fragment: this.lastFragment,
      replaceUrl: true,
    });
  }
  addPost(post: Status): void {
    this.player.addTracks(this.player.tracks(post));
    this.message.set('radio.added');
    this.syncPlaylistUrl();
  }
  addResults(): void {
    this.player.addTracks(this.results().flatMap((post) => this.player.tracks(post)));
    this.syncPlaylistUrl();
  }
  move(index: number, offset: number): void {
    this.player.moveTrack(index, offset);
    this.syncPlaylistUrl();
  }
  remove(index: number): void {
    this.player.removeTrack(index);
    this.syncPlaylistUrl();
  }
  save(): void {
    this.playlists.save(this.playlistName(), this.player.queue());
    this.message.set(this.playlists.error() ? 'radio.saveFailed' : 'radio.saved');
    this.syncPlaylistUrl();
  }
  load(tracks: RadioTrack[]): void {
    this.player.replacePlaylist(tracks);
    this.syncPlaylistUrl();
  }
  /** `play` comes from an in-app Open in Radio action; shared links never autoplay. */
  async loadPost(url: string, append: boolean, play = false): Promise<void> {
    const generation = ++this.importGeneration;
    this.importing.set(true);
    try {
      const post =
        this.handoff.take(url) ??
        (await firstValueFrom(this.publicApi.getStatus(radioPostRef(url)!)));
      if (generation !== this.importGeneration) return;
      await this.scan.start(() => of({ statuses: [post], next: null }));
      if (generation !== this.importGeneration) return;
      const tracks = this.player.tracks(post);
      if (append) this.player.addTracks(tracks);
      else this.player.replacePlaylist(tracks);
      if (!tracks.length) {
        this.message.set('radio.notQueueable');
        this.view.set('search');
        this.player.fullView.set(false);
      } else if (play) {
        const key = tracks[0].key;
        this.player.select(this.player.queue().findIndex((track) => track.key === key));
        // Drop add/play parameters so a reload does not queue the post again.
        this.syncPlaylistUrl('radio');
      }
    } catch (error) {
      if (generation === this.importGeneration) {
        this.diagnostics.error('Radio', 'post:failed', error, { transport: 'public-origin', url });
        this.failed.set(true);
      }
    } finally {
      if (generation === this.importGeneration) this.importing.set(false);
    }
  }
  async importLinks(
    urls?: string[],
    thread = this.includeThread(),
    replace = false,
  ): Promise<void> {
    const generation = ++this.importGeneration;
    this.importing.set(true);
    const result = await this.playlists.importUrls(
      urls ?? this.importText().match(/https?:\/\/[^\s<>"]+/g) ?? [],
      thread,
    );
    if (generation !== this.importGeneration) return;
    if (replace) {
      this.player.replacePlaylist(result.tracks);
      if (urls)
        this.scan.posts.set([
          ...new Map(result.tracks.map((track) => [track.post.id, track.post])).values(),
        ]);
    } else this.player.addTracks(result.tracks);
    this.importSkipped.set(result.skipped);
    this.importing.set(false);
    this.started.set(true);
    if (!urls) this.syncPlaylistUrl();
  }
  publish(thread: boolean): void {
    if (!this.shareable()) return;
    const urls = playlistUrls(this.player.queue());
    this.drafts.handoff({
      segments: thread ? urls : [urls.join('\n')],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });
    void this.router.navigate(['/home']);
  }
  playQueue(): void {
    if (this.player.queue().length) this.player.select(0);
    this.switchView('radio');
  }

  retryTime(): string {
    return new Date(this.scan.retryAt()).toLocaleTimeString();
  }

  playPost(post: Status): void {
    this.player.addTracks(this.player.tracks(post));
    this.player.select(this.player.queue().findIndex((track) => track.post.id === post.id));
    this.switchView('radio');
  }
  canQueue(post: Status): boolean {
    return this.player.tracks(post).length > 0;
  }
}

function feedPage(statuses: Status[]): { statuses: Status[]; next: string | null } {
  // Short pages do not prove exhaustion; try the cursor until the server returns no posts.
  return { statuses, next: statuses.at(-1)?.id ?? null };
}

// i18n radio.tab.search: Search
// i18n radio.tab.playlist: Playlist
// i18n radio.tab.radio: Radio
// i18n radio.chooseTrack: Choose a playlist or track to start Radio.
// i18n radio.sourcesHelp: Which sources can join a playlist?
// i18n radio.sourcesHint: Playlists support native Mastodon audio, SoundCloud, and Mixcloud. Other music embeds are available in Search, but cannot join continuous Radio playback.
// i18n radio.playlistName: Playlist name
// i18n radio.savePlaylist: Save playlist locally
// i18n radio.playPlaylist: Play playlist
// i18n radio.addResults: Add results to playlist
// i18n radio.draftPost: Draft playlist post
// i18n radio.draftThread: Draft playlist thread
// i18n radio.shareHint: Copy the address bar URL to share this playlist. Draft a post or thread to publish its links.
// i18n radio.privatePlaylist: Sharing requires public links and a playlist of at most 200 links. You can save this playlist locally.
// i18n radio.trackActions: Track {{number}} actions
// i18n radio.moveUp: Move up
// i18n radio.moveDown: Move down
// i18n radio.removeTrack: Remove
// i18n radio.savedPlaylists: Saved playlists
// i18n radio.loadPlaylist: Load {{name}}
// i18n radio.deletePlaylist: Delete saved playlist
// i18n radio.importUrls: Audio or post URLs
// i18n radio.importHint: Paste music URLs or a public Mastodon post URL. Import up to 200 links in order.
// i18n radio.importPlaylist: Add URLs to playlist
// i18n radio.includeThread: Include the author’s self-reply thread
// i18n radio.importing: Importing playlist…
// i18n radio.importResult: Unsupported or unavailable links skipped: {{count}}
// i18n radio.saved: Playlist saved in this browser.
// i18n radio.saveFailed: Could not save the playlist in this browser. Your current queue is retained.
// i18n radio.added: Added to playlist.
// i18n radio.addPlaylist: Add to playlist
// i18n radio.playlistableOnly: Playlistable only
// i18n radio.notQueueable: This post has no audio that Radio can play continuously. Its player is shown below.
