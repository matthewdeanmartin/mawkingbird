import { Component, computed, effect, inject, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { Auth } from '../../platform/session/auth';
import { countKey } from './count-key';
import { PlaylistPublisher } from './playlist-publisher';
import { PlaylistThread } from './playlist-thread';
import { playlistPath, RadioPlaylists, SavedRadioPlaylist } from './radio-playlists';
import { postTitle } from './track-title';

// i18n studio.playlists.title: Playlists to publish
// i18n studio.playlists.lead: Build a playlist here to post it: one post with every link, or a thread with one reply per recording. Any recording can join.
// i18n studio.playlists.new: New playlist to publish
// i18n studio.playlists.empty: No playlists to publish yet
// i18n studio.playlists.emptyHint: Start one here, or copy a listening playlist from its page with Publish from Studio.
// i18n studio.playlists.published: Published
// i18n studio.playlists.changed: Published · changes not posted yet
// i18n studio.playlists.draft: Not published
// i18n studio.playlists.mine: Already on Mastodon
// i18n studio.playlists.mineHint: Playlists you posted that Studio doesn’t keep yet, found in your recent posts.
// i18n studio.playlists.adopt: Keep in Studio
// i18n studio.playlists.signIn: Sign in to publish playlists.

/**
 * Studio's playlists: the ones made to publish. Threads already posted are found
 * on arrival, so a listener never has to ask for them.
 */
@Component({
  selector: 'app-studio-playlists',
  imports: [RouterLink, TranslocoPipe, MbButton, MbContentState],
  templateUrl: './studio-playlists.html',
  styleUrl: './radio-lists.css',
})
export class StudioPlaylists {
  readonly playlists = inject(RadioPlaylists);
  readonly publisher = inject(PlaylistPublisher);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  readonly countKey = countKey;
  readonly path = playlistPath;
  readonly authored = computed(() => this.playlists.saved().filter((row) => row.authored));

  constructor() {
    effect(() => {
      this.auth.kind();
      this.auth.token();
      this.playlists.refresh();
      untracked(() => {
        if (this.signedIn && !this.publisher.finding()) void this.publisher.find();
      });
    });
  }

  get signedIn(): boolean {
    return !this.auth.isAnonymous && !this.auth.isForeignPrimary;
  }

  state(row: SavedRadioPlaylist): string {
    if (!row.published) return 'studio.playlists.draft';
    return this.publisher.cost(this.publisher.plan(row))
      ? 'studio.playlists.changed'
      : 'studio.playlists.published';
  }

  create(): void {
    const id = this.playlists.create(this.transloco.translate('playlists.untitled'), [], true);
    if (id) void this.router.navigate(playlistPath({ id, authored: true }));
  }

  title(thread: PlaylistThread): string {
    return postTitle(thread.root) || this.transloco.translate('radio.thread.untitled');
  }

  async adopt(thread: PlaylistThread): Promise<void> {
    const id = await this.publisher.adopt(thread);
    if (id) void this.router.navigate(playlistPath({ id, authored: true }));
  }
}
