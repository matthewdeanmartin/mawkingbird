import { AccountName } from '../../accounts/account-name';
import {
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbMenuItem } from '../../design-system/menu/menu-item';
import { MbPostMenu } from '../../design-system/menu/post-menu';
import { MbToolbar, MbToolbarButton } from '../../design-system/toolbar/toolbar';
import { PageDiagnostics } from '../../platform/diagnostics/page-diagnostics';
import { Server } from '../../platform/http/server';
import { Auth } from '../../platform/session/auth';
import { RadioHandoff } from '../radio-handoff';
import { listenParams, radioPostRef } from '../radio-links';
import { CATALOGUE_POST } from './catalogue-search';
import { LinkedAudioResolver } from './linked-audio-resolver';
import { RadioDock } from './radio-dock';
import { RadioHeader } from './radio-header';
import { MbIcon } from '../../design-system/icon/icon';
import {
  MbItemList,
  MbItemMeta,
  MbItemRow,
  MbItemTitle,
} from '../../design-system/item-list/item-list';
import { isContinuous, RadioPlayer, RadioTrack } from './radio-player';
import { RadioPlaylists, SavedRadioPlaylist } from './radio-playlists';
import { TrackActions } from './track-actions';
import { SavedSingles } from './saved-singles';
import { SinglesTabs } from './section-tabs';
import { AppDialogs } from '../../shell/app-dialogs';
import { postHasPage } from './single-page';
import { countKey } from './count-key';

// i18n singles.title: Saved singles
// i18n singles.clearAll: Clear all
// i18n singles.clearConfirm: Remove all {{count}} saved singles? Playlists keep their tracks.
// i18n singles.find: Find singles
// i18n singles.empty: No saved singles yet
// i18n singles.emptyHint: Find music in posts, hashtags, accounts or public catalogues, then save the recordings you like.
// i18n singles.play: Play {{title}}
// i18n singles.open: Open {{title}}
// i18n singles.remove: Remove {{title}}
// i18n singles.share: Share {{title}}
// i18n singles.addTo: Add {{title}} to a playlist
// i18n singles.ownPage: Plays on its own page
// i18n singles.saving: Saving…
// i18n singles.saved.one: Saved {{count}} single.
// i18n singles.saved.other: Saved {{count}} singles.
// i18n singles.alreadySaved: Already in your saved singles.
// i18n singles.nothingToSave: This post has no recording to save.
// i18n singles.saveFailed: Could not open that post. It may be private or deleted.
// i18n singles.storageFailed: This browser could not save your singles.
// i18n singles.noPlaylists: No playlists yet
// i18n singles.newPlaylist: New playlist with this single
// i18n singles.source.mastodon: Mastodon

/** True when a track's post can open on the Listen page (not a catalogue or pasted link). */
export function hasSinglePage(track: RadioTrack): boolean {
  return postHasPage(track.post);
}

@Component({
  selector: 'app-singles-page',
  imports: [
    AccountName,
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbContentState,
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
    SinglesTabs,
  ],
  templateUrl: './singles-page.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './radio-lists.css',
})
export class SinglesPage {
  readonly singles = inject(SavedSingles);
  readonly playlists = inject(RadioPlaylists);
  readonly player = inject(RadioPlayer);
  readonly actions = inject(TrackActions);
  private readonly auth = inject(Auth);
  private readonly server = inject(Server);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly handoff = inject(RadioHandoff);
  private readonly publicApi = inject(AnonymousPublicApi);
  private readonly linked = inject(LinkedAudioResolver);
  private readonly diagnostics = inject(PageDiagnostics);
  private readonly transloco = inject(TranslocoService);
  private readonly dialogs = inject(AppDialogs);
  readonly message = signal('');
  readonly saving = signal(false);
  readonly isContinuous = isContinuous;
  readonly hasPage = hasSinglePage;

  constructor() {
    this.player.installDock(RadioDock);
    effect(() => {
      this.auth.kind();
      this.auth.token();
      this.singles.refresh();
      this.playlists.refresh();
    });
    // Saved post links resolve linked Library of Congress items before playing.
    effect(() => this.linked.resolve(this.singles.items().map((item) => item.track.post)));
    this.route.queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((params) => {
      const save = params.get('save');
      if (save) void this.saveFrom(save);
    });
  }

  /** "Save single" from a post card elsewhere: the card hands its post over, or it is fetched. */
  private async saveFrom(url: string): Promise<void> {
    this.saving.set(true);
    this.message.set('');
    try {
      const ref = radioPostRef(url);
      const post =
        this.handoff.take(url) ??
        (ref ? await firstValueFrom(this.publicApi.getStatus(ref)) : null);
      if (!post) throw new Error('Not a post link');
      await this.linked.ready([post]);
      const tracks = this.player.singlesOf(post);
      if (!tracks.length) this.say('singles.nothingToSave');
      else {
        const added = this.singles.save(tracks);
        if (this.singles.error()) this.say('singles.storageFailed');
        else if (added) this.say(countKey('singles.saved', added), { count: added });
        else this.say('singles.alreadySaved');
      }
    } catch (error) {
      this.diagnostics.error('Radio', 'single-save:failed', error, { transport: 'public-origin' });
      this.say('singles.saveFailed');
    } finally {
      this.saving.set(false);
      // A reload must not save the post again.
      void this.router.navigate(['/singles'], { replaceUrl: true });
    }
  }

  async clearAll(): Promise<void> {
    const count = this.singles.items().length;
    if (
      count &&
      (await this.dialogs.confirm(this.transloco.translate('singles.clearConfirm', { count })))
    )
      this.singles.clear();
  }

  /** Continuous Singles play here; the others open the page where their player lives. */
  play(track: RadioTrack): void {
    if (isContinuous(track)) this.player.playSingle(track);
    else if (hasSinglePage(track))
      void this.router.navigate(['/listen'], { queryParams: this.listen(track) });
  }

  listen(track: RadioTrack): Record<string, string> {
    return listenParams(
      track.post,
      this.server.baseUrl(),
      track.external ? undefined : track.media.id,
    );
  }

  /** Playlists that can take this Single: only recordings that play one after another join one. */
  playlistsFor(track: RadioTrack): SavedRadioPlaylist[] {
    return isContinuous(track) ? this.playlists.saved() : [];
  }

  addTo(track: RadioTrack, playlistId: string): void {
    this.message.set(this.actions.keep([track], playlistId));
  }

  /** Start a playlist from this Single and open it. */
  newPlaylist(track: RadioTrack): void {
    const name = this.player.title(track);
    const id = this.playlists.create(name, [track]);
    if (id) void this.router.navigate(['/playlists', id]);
  }

  private say(key: string, params?: Record<string, unknown>): void {
    this.message.set(this.transloco.translate(key, params));
  }

  source(track: RadioTrack): string {
    if (track.external) return track.external.label;
    if (track.post.id.startsWith(CATALOGUE_POST) || /^https?:/i.test(track.post.id))
      return track.post.account.display_name || track.post.account.acct;
    return this.transloco.translate('singles.source.mastodon');
  }
}
