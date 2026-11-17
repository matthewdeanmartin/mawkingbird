import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom, timeout } from 'rxjs';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbToolbar, MbToolbarButton } from '../../design-system/toolbar/toolbar';
import { Api } from '../../platform/api/api';
import { Status } from '../../platform/api/models';
import { PageDiagnostics } from '../../platform/diagnostics/page-diagnostics';
import { Auth } from '../../platform/session/auth';
import { AppDialogs } from '../../shell/app-dialogs';
import { radioAccount, radioPostRef } from '../radio-links';
import { PlaylistThread, playlistThreads } from './playlist-thread';
import { RadioDock } from './radio-dock';
import { RadioHeader } from './radio-header';
import { RadioIcon } from './radio-icon';
import { RadioPlayer } from './radio-player';
import { RadioPlaylists, SavedRadioPlaylist } from './radio-playlists';
import { postTitle } from './track-title';
import { PlaylistsTabs } from './section-tabs';
import { PlaylistPublisher } from './playlist-publisher';
import { countKey } from './count-key';

// i18n playlists.title: Playlists
// i18n playlists.new: New playlist
// i18n playlists.find: Find playlists
// i18n playlists.empty: No playlists yet
// i18n playlists.emptyHint: Start one and add your saved singles, or find a playlist someone shared.
// i18n playlists.savedSingles: Saved singles
// i18n playlists.play: Play {{name}}
// i18n playlists.open: Open {{name}}
// i18n playlists.delete: Delete {{name}}
// i18n playlists.published: Published
// i18n playlists.storageFailed: This browser could not save your playlists.
// i18n playlists.findLead: Playlists on Mastodon are a post with several recordings, or a thread of them.
// i18n playlists.link: Playlist link
// i18n playlists.linkHint: A post link. Replies by the same person are included.
// i18n playlists.openLink: Open
// i18n playlists.badLink: That isn’t a link to a public post.
// i18n playlists.fromAccount: From an account
// i18n playlists.account: Account handle
// i18n playlists.accountHint: Such as name@server.example. Looks through their recent posts.
// i18n playlists.search: Look
// i18n playlists.searching: Looking through recent posts…
// i18n playlists.none: No playlists found in their recent posts.
// i18n playlists.lookupFailed: Could not read that account’s posts.
// i18n playlists.recordings.one: {{count}} recording
// i18n playlists.recordings.other: {{count}} recordings
// i18n playlists.view: Open {{name}}
// i18n playlists.mine: Playlists I posted
// i18n playlists.mineHint: Threads in your recent posts with two or more recordings. Keep one to update it from here when you share it again.
// i18n playlists.adopt: Keep as a playlist

const SCAN_PAGES = 5;

@Component({
  selector: 'app-playlists-page',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbContentState,
    MbField,
    MbControl,
    MbToolbar,
    MbToolbarButton,
    RadioHeader,
    RadioIcon,
    PlaylistsTabs,
  ],
  templateUrl: './playlists-page.html',
  styleUrl: './radio-lists.css',
})
export class PlaylistsPage {
  readonly playlists = inject(RadioPlaylists);
  readonly player = inject(RadioPlayer);
  readonly listening = computed(() => this.playlists.saved());
  readonly publisher = inject(PlaylistPublisher);
  private readonly auth = inject(Auth);
  private readonly api = inject(Api);
  private readonly publicApi = inject(AnonymousPublicApi);
  private readonly router = inject(Router);
  private readonly dialogs = inject(AppDialogs);
  private readonly transloco = inject(TranslocoService);
  private readonly diagnostics = inject(PageDiagnostics);
  /** `/playlists/find` shows the finding tools; `/playlists` the library. */
  readonly finding = signal(false);
  readonly link = signal('');
  readonly linkError = signal(false);
  readonly handle = signal('');
  readonly looking = signal(false);
  readonly lookFailed = signal(false);
  readonly found = signal<PlaylistThread[] | null>(null);
  readonly countKey = countKey;
  private generation = 0;

  constructor() {
    this.player.installDock(RadioDock);
    effect(() => {
      this.auth.kind();
      this.auth.token();
      this.playlists.refresh();
    });
    const destroy = inject(DestroyRef);
    inject(ActivatedRoute)
      .data.pipe(takeUntilDestroyed(destroy))
      .subscribe((data) => this.finding.set(data['view'] === 'find'));
    destroy.onDestroy(() => this.generation++);
  }

  get signedIn(): boolean {
    return !this.auth.isAnonymous && !this.auth.isForeignPrimary;
  }

  create(): void {
    const id = this.playlists.create(this.transloco.translate('playlists.untitled'));
    if (id) void this.router.navigate(['/playlists', id]);
  }

  play(row: SavedRadioPlaylist): void {
    this.player.playTracks(row.tracks);
  }

  async delete(row: SavedRadioPlaylist): Promise<void> {
    if (
      await this.dialogs.confirm(
        this.transloco.translate('playlist.deleteConfirm', { name: row.name }),
      )
    )
      this.playlists.remove(row.id);
  }

  openLink(): void {
    const ref = radioPostRef(this.link().trim());
    this.linkError.set(!ref);
    if (ref?.originalUrl)
      void this.router.navigate(['/playlists', 'shared'], {
        queryParams: { post: ref.originalUrl },
      });
  }

  /** Read an account's recent posts and keep its playlist-shaped posts and threads. */
  async look(): Promise<void> {
    const generation = ++this.generation;
    this.looking.set(true);
    this.lookFailed.set(false);
    this.found.set(null);
    try {
      const handle = this.handle().trim().replace(/^@/, '');
      const posts: Status[] = [];
      let accountId: string;
      if (this.signedIn) {
        const account = await firstValueFrom(this.api.lookupAccount(handle).pipe(timeout(30_000)));
        accountId = account.id;
        let maxId: string | undefined;
        for (let page = 0; page < SCAN_PAGES; page++) {
          const batch = await firstValueFrom(
            this.api
              .getAccountStatuses(account.id, { maxId, limit: 40, excludeReblogs: true })
              .pipe(timeout(30_000)),
          );
          posts.push(...batch);
          if (batch.length < 40) break;
          maxId = batch.at(-1)!.id;
        }
      } else {
        const remote = radioAccount(handle);
        if (!remote) throw new Error('A full handle is needed signed out');
        const account = await firstValueFrom(
          this.publicApi.lookupAccount(remote.server, remote.acct.split('@')[0]),
        );
        accountId = account.id;
        const ref = { server: remote.server, id: account.id };
        let maxId: string | undefined;
        for (let page = 0; page < SCAN_PAGES; page++) {
          const batch = await firstValueFrom(
            this.publicApi.getAccountStatuses(ref, { maxId, limit: 40, excludeReblogs: true }),
          );
          posts.push(...batch);
          maxId = (batch.at(-1)?.providerRef as { statusId?: string } | undefined)?.statusId;
          if (batch.length < 40 || !maxId) break;
        }
      }
      if (generation !== this.generation) return;
      this.found.set(playlistThreads(posts, accountId));
    } catch (error) {
      if (generation !== this.generation) return;
      this.diagnostics.error('Radio', 'playlist-find:failed', error);
      this.lookFailed.set(true);
    } finally {
      if (generation === this.generation) this.looking.set(false);
    }
  }

  title(thread: PlaylistThread): string {
    return postTitle(thread.root) || this.transloco.translate('radio.thread.untitled');
  }

  async adopt(thread: PlaylistThread): Promise<void> {
    const id = await this.publisher.adopt(thread);
    if (id) void this.router.navigate(['/playlists', id]);
  }

  /** Open a found playlist as a shared preview; its link carries the whole thread. */
  view(thread: PlaylistThread): void {
    const url = radioPostRef(thread.root.url ?? '')?.originalUrl;
    if (url) void this.router.navigate(['/playlists', 'shared'], { queryParams: { post: url } });
  }
}
