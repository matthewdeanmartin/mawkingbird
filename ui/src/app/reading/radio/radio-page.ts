import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { PageDiagnostics } from '../../platform/diagnostics/page-diagnostics';
import { Server } from '../../platform/http/server';
import { RadioHandoff } from '../radio-handoff';
import { listenParams, radioAccount, radioPostRef } from '../radio-links';
import { LinkedAudioResolver } from './linked-audio-resolver';
import { RadioDock } from './radio-dock';
import { RadioHeader } from './radio-header';
import { isContinuous, RadioPlayer } from './radio-player';
import { readPlaylistFragment } from './radio-playlists';
import { RadioSettings } from './radio-settings';

// i18n radio.nowPlaying: Now playing
// i18n radio.nothingPlaying: Nothing is playing
// i18n radio.nothingPlayingHint: Play one of your saved singles, or a playlist.
// i18n radio.opening: Opening recording…
// i18n radio.openFailed: Could not open that post. It may be private or deleted.

/**
 * `/radio` is what is playing now; `/radio/settings` is Radio's settings. Radio
 * is the verb "play": Singles and Playlists are where music is found and kept.
 * `?play=` plays a post; older shared links (accounts, posts, playlists) open
 * their new home.
 */
@Component({
  selector: 'app-radio-page',
  imports: [RouterLink, TranslocoPipe, MbButton, MbContentState, RadioHeader, RadioSettings],
  templateUrl: './radio-page.html',
  styleUrl: './radio-lists.css',
})
export class RadioPage {
  readonly player = inject(RadioPlayer);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly handoff = inject(RadioHandoff);
  private readonly publicApi = inject(AnonymousPublicApi);
  private readonly linked = inject(LinkedAudioResolver);
  private readonly server = inject(Server);
  private readonly diagnostics = inject(PageDiagnostics);
  readonly view = signal<'radio' | 'settings'>('radio');
  readonly opening = signal(false);
  readonly failed = signal(false);
  private generation = 0;

  constructor() {
    this.player.installDock(RadioDock);
    const destroy = inject(DestroyRef);
    this.view.set(this.route.snapshot?.data?.['view'] === 'settings' ? 'settings' : 'radio');
    this.player.fullView.set(this.view() === 'radio');
    this.route.queryParamMap.pipe(takeUntilDestroyed(destroy)).subscribe((params) => {
      if (this.view() === 'settings') return;
      const play = radioPostRef(params.get('play'));
      if (play?.originalUrl) {
        void this.playPost(play.originalUrl);
        return;
      }
      // Links people shared before Singles and Playlists existed open their new home.
      const fragment = this.route.snapshot?.fragment ?? '';
      const post = radioPostRef(params.get('post'));
      const account = radioAccount(params.get('acct'));
      if (post?.originalUrl) this.forward(['/playlists', 'shared'], { post: post.originalUrl });
      else if (account) this.forward(['/singles', 'find'], { acct: account.acct });
      else if (readPlaylistFragment(fragment)) this.forward(['/playlists', 'shared'], {}, fragment);
    });
    destroy.onDestroy(() => {
      this.generation++;
      this.player.fullView.set(false);
    });
  }

  suspendReading(): void {
    this.player.fullView.set(false);
  }

  resumeReading(): void {
    this.player.fullView.set(this.view() === 'radio');
  }

  private forward(
    path: string[],
    queryParams: Record<string, string> = {},
    fragment?: string,
  ): void {
    void this.router.navigate(path, { queryParams, fragment, replaceUrl: true });
  }

  /** "Play in Radio" from a post: it plays as a Single; one that can't continue opens on Listen. */
  private async playPost(url: string): Promise<void> {
    const generation = ++this.generation;
    this.opening.set(true);
    this.failed.set(false);
    try {
      const post =
        this.handoff.take(url) ??
        (await firstValueFrom(this.publicApi.getStatus(radioPostRef(url)!)));
      await this.linked.ready([post]);
      if (generation !== this.generation) return;
      const tracks = this.player.tracks(post).filter(isContinuous);
      if (tracks.length) {
        this.player.playTracks(tracks);
        // Drop the post parameters so a reload does not start it again.
        this.forward(['/radio']);
      } else
        void this.router.navigate(['/listen'], {
          queryParams: listenParams(post, this.server.baseUrl()),
          replaceUrl: true,
        });
    } catch (error) {
      if (generation !== this.generation) return;
      this.diagnostics.error('Radio', 'post:failed', error, { transport: 'public-origin', url });
      this.failed.set(true);
    } finally {
      if (generation === this.generation) this.opening.set(false);
    }
  }
}

// Radio strings shared by the Singles, Playlists and Now Playing pages.
// i18n radio.title: Radio
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
// i18n radio.signIn: Sign in with a Mastodon account to use Radio.
// i18n radio.listenProvider: Listen on {{provider}} in Radio
// i18n radio.nativeOnly: Native Mastodon audio only
// i18n radio.nativeOnlyHint: Otherwise, also find links to supported external audio players.
// i18n radio.tab.settings: Settings
// i18n radio.hashtag: Hashtag
// i18n radio.hashtagHint: For example #robotmusic. Posts linking music players count, not only attached audio.
// i18n radio.closeMenu: Close menu
// i18n radio.renameTrack: Rename
// i18n radio.renamePrompt: Title for this playlist entry. Leave it empty to use the automatic title.
// i18n radio.publishThread: Publish as a Mastodon thread
// i18n radio.publishHint: The playlist becomes a post with its name, followed by one reply per track. Replies under a public post are unlisted so they do not fill your followers’ timelines.
// i18n radio.threadVisibility: Visibility
// i18n radio.public: Public
// i18n radio.unlisted: Unlisted
// i18n radio.followers: Followers only
// i18n radio.threadPlan: This will create {{posts}} posts, edit {{edits}} and delete {{deletions}}.
// i18n radio.threadDeleteLimit: Mastodon allows about {{limit}} deletions per half hour. Larger changes may stop part way; Update thread resumes where it stopped.
// i18n radio.threadNotEditable: This thread was not written one track per reply, so tracks cannot be removed or reordered here. You can still add tracks at the end.
// i18n radio.threadCurrent: The published thread matches this playlist.
// i18n radio.publishAsThread: Publish thread
// i18n radio.updateThread: Update thread
// i18n radio.threadProgress: Sent {{done}} of {{total}}…
// i18n radio.threadFailed: Publishing stopped. Progress so far is saved; Update thread continues from there.
// i18n radio.viewThread: View thread
// i18n radio.findThreads: Find my playlist threads
// i18n radio.findingThreads: Looking through your recent posts…
// i18n radio.noThreads: No playlist threads found in your recent posts.
// i18n radio.draftPost: Draft playlist post
// i18n radio.draftThread: Draft playlist thread
// i18n radio.privatePlaylist: Sharing requires public links and a playlist of at most 200 links. You can save this playlist locally.
// i18n radio.trackActions: Track {{number}} actions
// i18n radio.moveUp: Move up
// i18n radio.moveDown: Move down
// i18n radio.removeTrack: Remove
// i18n radio.importing: Importing playlist…
// i18n radio.importResult: Unsupported or unavailable links skipped: {{count}}
// i18n radio.saveFailed: Could not save your playlists in this browser.
// i18n radio.addPlaylist: Add to playlist
// i18n radio.playResults: Play all results
