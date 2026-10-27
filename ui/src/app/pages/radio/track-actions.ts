import { computed, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { AppDialogs } from '../../app-dialogs';
import { Drafts } from '../../drafts';
import { CATALOGUE_POST } from './catalogue-search';
import { PlaylistPublisher } from './playlist-publisher';
import { RadioPlayer, RadioTrack } from './radio-player';
import { RadioPlaylists, trackUrl } from './radio-playlists';

// i18n radio.share.viaLoc: via the Library of Congress
// i18n radio.share.viaArchive: via the Internet Archive
// i18n radio.share.viaPost: shared by @{{acct}}
// i18n radio.share.rights: Rights: {{rights}}
// i18n radio.append.confirm: Add “{{title}}” to “{{playlist}}”? This will create {{posts}} posts and edit {{edits}} on Mastodon.
// i18n radio.append.private: “{{title}}” is not public, so it cannot join a published playlist.
// i18n radio.append.done: Added to “{{playlist}}”.
// i18n radio.append.failed: Could not update “{{playlist}}”. Progress is saved; Update thread in Publish continues it.

/**
 * What a listener can do with one recording wherever it appears: share it in a
 * new post, add it to the playlist being built, or append it to a published
 * playlist thread. Shared by Listen, Radio and Studio's Find Shareable.
 */
@Injectable({ providedIn: 'root' })
export class TrackActions {
  private readonly drafts = inject(Drafts);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly dialogs = inject(AppDialogs);
  private readonly player = inject(RadioPlayer);
  private readonly playlists = inject(RadioPlaylists);
  private readonly publisher = inject(PlaylistPublisher);

  /** Published playlists, newest last, that a track can be appended to. */
  readonly published = computed(() => this.playlists.saved().filter((row) => !!row.published));

  /** A post that names the recording, credits its source and links it. */
  shareText(track: RadioTrack, nowPlaying = true): string {
    const catalogue = track.post.id.startsWith(CATALOGUE_POST);
    const title = this.player.title(track);
    const author = track.post.account.display_name || track.post.account.acct;
    const credit = catalogue
      ? [
          author !== title ? author : '',
          this.transloco.translate(
            track.post.account.id === 'loc' ? 'radio.share.viaLoc' : 'radio.share.viaArchive',
          ),
        ]
          .filter(Boolean)
          .join(' · ')
      : this.transloco.translate('radio.share.viaPost', { acct: track.post.account.acct });
    const link =
      !catalogue && ['public', 'unlisted'].includes(track.post.visibility) && track.post.url
        ? track.post.url
        : (trackUrl(track) ?? '');
    return [title, credit, link, nowPlaying ? '#nowplaying' : ''].filter(Boolean).join('\n');
  }

  /** Open Studio's composer with a post about this recording, ready to edit. */
  share(track: RadioTrack): void {
    this.drafts.handoff({
      segments: [this.shareText(track)],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });
    void this.router.navigate(['/radio/studio']);
  }

  /** Append to the queue being built; publishing happens from Build Playlist → Publish. */
  addToPlaylist(tracks: RadioTrack[]): void {
    this.player.addTracks(tracks);
  }

  /**
   * Append a recording to a published playlist: saved locally, then one reply
   * (and a root edit for the new count) after the listener confirms the cost.
   */
  async append(track: RadioTrack, rowId: string): Promise<string> {
    const row = this.playlists.saved().find((item) => item.id === rowId);
    if (!row?.published) return '';
    const title = this.player.title(track);
    const names = { title, playlist: row.name };
    if (!trackUrl(track)) return this.transloco.translate('radio.append.private', names);
    if (row.tracks.some((item) => item.key === track.key))
      return this.transloco.translate('radio.append.done', names);
    const next = { ...row, tracks: [...row.tracks, track] };
    const plan = this.publisher.plan(next);
    const confirmed = await this.dialogs.confirm(
      this.transloco.translate('radio.append.confirm', {
        ...names,
        posts: plan.post.length,
        edits: plan.edit.length + (plan.editRoot ? 1 : 0),
      }),
    );
    if (!confirmed) return '';
    this.playlists.update(rowId, () => next);
    const done = await this.publisher.publish(rowId, row.published.visibility);
    return this.transloco.translate(done ? 'radio.append.done' : 'radio.append.failed', names);
  }
}
