import { AccountName } from '../../accounts/account-name';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbMenuItem } from '../../design-system/menu/menu-item';
import { MbPostMenu } from '../../design-system/menu/post-menu';
import { MbToolbar, MbToolbarButton } from '../../design-system/toolbar/toolbar';
import { PageDiagnostics } from '../../platform/diagnostics/page-diagnostics';
import { Auth } from '../../platform/session/auth';
import { AppDialogs } from '../../shell/app-dialogs';
import { radioPostRef } from '../radio-links';
import { PlaylistDraft } from './playlist-draft';
import { RadioDock } from './radio-dock';
import { RadioHeader } from './radio-header';
import { ReadingBack } from '../../shell/reading-back';
import { MbIcon } from '../../design-system/icon/icon';
import {
  MbItemList,
  MbItemMeta,
  MbItemRow,
  MbItemTitle,
} from '../../design-system/item-list/item-list';
import { isContinuous, RadioPlayer, RadioTrack } from './radio-player';
import { RadioPlaylists, SavedRadioPlaylist } from './radio-playlists';
import { SavedSingles } from './saved-singles';
import { countKey } from './count-key';
import { postTitle } from './track-title';
import { TrackActions } from './track-actions';

// i18n playlists.untitled: Untitled playlist
// i18n playlist.notFound: This playlist isn’t saved in this browser
// i18n playlist.notFoundHint: Playlists are kept per browser and account. Open a playlist link to listen to one shared with you.
// i18n playlist.shared: Shared playlist
// i18n playlist.sharedLead: A playlist someone shared. Play it, or save a copy to change it.
// i18n playlist.loading: Opening playlist…
// i18n playlist.loadFailed: Could not open this playlist. Its posts may be private or deleted.
// i18n playlist.skipped.one: {{count}} link can’t play here and was left out.
// i18n playlist.skipped.other: {{count}} links can’t play here and were left out.
// i18n playlist.saveCopy: Save a copy
// i18n playlist.name: Name
// i18n playlist.description: Description (optional)
// i18n playlist.play: Play
// i18n playlist.shuffle: Shuffle
// i18n playlist.addTracks: Add tracks
// i18n playlist.fromSavedHint: From your saved singles. Only recordings that play one after another can join.
// i18n playlist.noSavedSingles: No saved singles can join yet.
// i18n playlist.findMore: Find more singles
// i18n playlist.add: Add {{title}}
// i18n playlist.empty: This playlist is empty
// i18n playlist.emptyHint: Add tracks from your saved singles below, or find more.
// i18n playlist.trackCount.one: {{count}} track
// i18n playlist.trackCount.other: {{count}} tracks
// i18n playlist.link: Link to this playlist
// i18n playlist.linkHint: The link opens the thread you posted; it plays here in order, and anywhere else as an ordinary thread.
// i18n playlist.notPosted: Share the playlist to post it as a thread; the thread is its link.
// i18n playlist.delete: Delete playlist
// i18n playlist.deleteConfirm: Delete “{{name}}” from this browser? A published thread stays on Mastodon.
// i18n playlist.back: Playlists
// i18n playlist.share: Share
// i18n playlist.ownPage: Plays on its own page
// i18n playlist.more: More playlist actions

/**
 * One playlist: a saved one edits in place (every change is kept at once), and
 * `shared` previews one from a link until the listener saves a copy.
 */
@Component({
  selector: 'app-playlist-page',
  imports: [
    AccountName,
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbContentState,
    MbField,
    MbControl,
    MbToolbar,
    MbToolbarButton,
    MbPostMenu,
    MbMenuItem,
    RadioHeader,
    MbIcon,
    MbItemList,
    MbItemMeta,
    MbItemRow,
    MbItemTitle,
    ReadingBack,
  ],
  templateUrl: './playlist-page.html',
  styleUrls: ['./radio-lists.css', './playlist-page.css'],
})
export class PlaylistPage {
  readonly playlists = inject(RadioPlaylists);
  readonly player = inject(RadioPlayer);
  readonly singles = inject(SavedSingles);
  readonly actions = inject(TrackActions);
  private readonly preview = inject(PlaylistDraft);
  private readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogs = inject(AppDialogs);
  private readonly transloco = inject(TranslocoService);
  private readonly diagnostics = inject(PageDiagnostics);
  readonly countKey = countKey;
  readonly id = signal('');
  readonly shared = computed(() => this.id() === 'shared');
  readonly row = computed<SavedRadioPlaylist | null>(() =>
    this.shared() ? null : (this.playlists.saved().find((item) => item.id === this.id()) ?? null),
  );
  readonly tracks = computed(() =>
    this.shared() ? this.preview.tracks() : (this.row()?.tracks ?? []),
  );
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly skipped = signal(0);
  readonly message = signal('');
  /** Saved Singles that could join: they play continuously and aren't here yet. */
  readonly isContinuous = isContinuous;
  readonly candidates = computed(() => {
    const keys = new Set(this.tracks().map((track) => track.key));
    return this.singles
      .items()
      .map((item) => item.track)
      .filter((track) => isContinuous(track) && !keys.has(track.key));
  });
  /** A posted playlist's link: the thread is the playlist, and the player reads it. */
  readonly threadLink = computed(() => this.row()?.published?.url ?? '');
  private generation = 0;
  private lastSource = '';

  constructor() {
    this.player.installDock(RadioDock);
    effect(() => {
      this.auth.kind();
      this.auth.token();
      this.playlists.refresh();
      this.singles.refresh();
    });
    const destroy = inject(DestroyRef);
    this.route.paramMap.pipe(takeUntilDestroyed(destroy)).subscribe((params) => {
      this.id.set(params.get('id') ?? '');
      this.message.set('');
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed(destroy)).subscribe((params) => {
      const post = radioPostRef(params.get('post'));
      if (this.shared() && post?.originalUrl)
        void this.load(post.originalUrl, [post.originalUrl], true);
    });
    destroy.onDestroy(() => this.generation++);
  }

  get signedIn(): boolean {
    return !this.auth.isAnonymous && !this.auth.isForeignPrimary;
  }

  /** A shared playlist: a post (with its self-reply thread) or a list of links. */
  private async load(source: string, urls: string[], thread: boolean): Promise<void> {
    if (source === this.lastSource) return;
    this.lastSource = source;
    const generation = ++this.generation;
    this.loading.set(true);
    this.failed.set(false);
    try {
      const result = await this.playlists.importUrls(urls, thread);
      if (generation !== this.generation) return;
      const name = result.tracks[0] ? postTitle(result.tracks[0].post) : '';
      this.preview.replace(result.tracks, name);
      this.skipped.set(result.skipped);
      if (!result.tracks.length) this.failed.set(true);
    } catch (error) {
      if (generation !== this.generation) return;
      this.diagnostics.error('Radio', 'playlist:failed', error, { transport: 'public-origin' });
      this.failed.set(true);
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  heading(): string {
    if (this.shared()) return this.preview.name() || this.transloco.translate('playlist.shared');
    return this.row()?.name || this.transloco.translate('playlists.untitled');
  }

  play(index = 0): void {
    this.player.playTracks(this.tracks(), index);
  }

  shuffle(): void {
    const tracks = [...this.tracks()];
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
    this.player.playTracks(tracks);
  }

  saveCopy(): void {
    const name = this.preview.name() || this.transloco.translate('playlists.untitled');
    const id = this.playlists.create(name, this.preview.tracks());
    if (id) void this.router.navigate(['/playlists', id]);
  }

  private change(edit: (row: SavedRadioPlaylist) => SavedRadioPlaylist): void {
    const row = this.row();
    if (row) this.playlists.update(row.id, edit);
  }

  rename(name: string): void {
    const value = name.trim().slice(0, 200);
    if (value) this.change((row) => ({ ...row, name: value }));
  }

  describe(text: string): void {
    const value = text.trim().slice(0, 1000);
    this.change((row) => {
      const { description: _old, ...rest } = row;
      return value ? { ...rest, description: value } : rest;
    });
  }

  add(track: RadioTrack): void {
    this.change((row) => ({ ...row, tracks: [...row.tracks, track] }));
  }

  move(index: number, offset: number): void {
    this.change((row) => {
      const tracks = [...row.tracks];
      const next = index + offset;
      if (!tracks[index] || !tracks[next]) return row;
      [tracks[index], tracks[next]] = [tracks[next], tracks[index]];
      return { ...row, tracks };
    });
  }

  remove(index: number): void {
    this.change((row) => ({ ...row, tracks: row.tracks.filter((_, i) => i !== index) }));
  }

  async retitle(index: number): Promise<void> {
    const track = this.tracks()[index];
    if (!track) return;
    const title = await this.dialogs.prompt(
      this.transloco.translate('radio.renamePrompt'),
      this.player.title(track),
    );
    if (title === null) return;
    this.change((row) => ({
      ...row,
      tracks: row.tracks.map((item, i) => {
        if (i !== index) return item;
        const { title: _old, ...rest } = item;
        return title.trim() ? { ...rest, title: title.trim().slice(0, 200) } : rest;
      }),
    }));
  }

  async delete(): Promise<void> {
    const row = this.row();
    if (!row) return;
    if (
      !(await this.dialogs.confirm(
        this.transloco.translate('playlist.deleteConfirm', { name: row.name }),
      ))
    )
      return;
    this.playlists.remove(row.id);
    void this.router.navigate(['/playlists']);
  }
}
