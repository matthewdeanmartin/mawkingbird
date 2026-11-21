import { AccountName } from '../../accounts/account-name';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ExternalPlayerHost } from '../audio-embeds/external-player-host';
import { postExternalMedia } from '../audio-embeds/providers';
import { ProviderPreferences } from '../audio-embeds/provider-preferences';
import { Auth } from '../../platform/session/auth';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { FollowTrust } from '../../accounts/follow-trust';
import { Status } from '../../platform/api/models';
import { parseAnonymousStatusRouteRef } from '../../accounts/anonymous/anonymous-route-ref';
import { Server } from '../../platform/http/server';
import { StatusCard } from '../../posts/status-card/status-card';
import { StatusVisibility } from '../../moderation/status-visibility';
import { TrustedAccounts } from '../../accounts/trusted-accounts';
import { ThreadLoader } from '../read/thread-loader';
import { LinkedAudioResolver } from './linked-audio-resolver';
import { RadioDock } from './radio-dock';
import { RadioIcon } from './radio-icon';
import { RadioPlayer, RadioTrack } from './radio-player';
import { SavedSingles } from './saved-singles';
import { RadioPlaylists } from './radio-playlists';
import { TrackActions } from './track-actions';
import { ReadingBack } from '../../shell/reading-back';
import { MbPostMenu } from '../../design-system/menu/post-menu';
import { MbMenuItem } from '../../design-system/menu/menu-item';

// i18n listen.title: Listen
// i18n listen.loading: Opening recording…
// i18n listen.unavailable: This recording is unavailable or you don't have access to its post.
// i18n listen.wrongServer: Switch to the server this post belongs to before opening its recording.
// i18n listen.noAudio: This post has no recording to play.
// i18n listen.reveal: Show recording
// i18n listen.warning: This post has a content warning or sensitive media.
// i18n listen.filterWarning: This post matched a content filter.
// i18n listen.hiddenMedia: Media is hidden by your reading preferences. You can open this recording without changing them.
// i18n listen.play: Play
// i18n listen.resume: Resume from {{time}}
// i18n listen.startOver: Start from the beginning
// i18n listen.playNext: Play next in Radio
// i18n listen.addQueue: Add to playlist
// i18n listen.saveSingle: Save single
// i18n listen.newPlaylist: New playlist
// i18n listen.queued: Added to the Radio queue.
// i18n listen.back15: Back 15 seconds
// i18n listen.forward30: Forward 30 seconds
// i18n listen.position: Playback position
// i18n listen.providerBar: The {{provider}} player is in the Radio bar below. It keeps playing while you browse.
// i18n listen.recordings: Recordings in this post
// i18n listen.inline: Other players
// i18n listen.inlineHint: These services play here only; they stop when you leave this page.
// i18n listen.conversation: Conversation
// i18n listen.noComments: No comments yet.

/**
 * One recording with its conversation, for a several-minute listen or a podcast.
 * Playback runs through Radio, so it continues when the reader moves on and the
 * dock takes over; this page shows its own controls while the recording plays.
 */
@Component({
  selector: 'app-listen-page',
  imports: [
    AccountName,
    FormsModule,
    TranslocoPipe,
    MbButton,
    MbField,
    MbControl,
    StatusCard,
    ExternalPlayerHost,
    RadioIcon,
    MbPostMenu,
    MbMenuItem,
    ReadingBack,
  ],
  providers: [ThreadLoader],
  templateUrl: './listen-page.html',
  styleUrl: './listen-page.css',
})
export class ListenPage {
  protected readonly loader = inject(ThreadLoader);
  protected readonly player = inject(RadioPlayer);
  protected readonly singles = inject(SavedSingles);
  protected readonly playlists = inject(RadioPlaylists);
  protected readonly actions = inject(TrackActions);
  private readonly transloco = inject(TranslocoService);
  private readonly linked = inject(LinkedAudioResolver);
  private readonly services = inject(ProviderPreferences);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly server = inject(Server);
  private readonly auth = inject(Auth);
  private readonly visibility = inject(StatusVisibility);
  private readonly trusted = inject(TrustedAccounts);
  private readonly followTrust = inject(FollowTrust);
  private readonly prefs = inject(ClientPrefs);
  protected readonly params = signal<Record<string, string>>({});
  protected readonly error = signal('');
  /** Thread-wide CW state, as on the thread page: one toggle opens or closes every warning. */
  protected readonly threadCwOpen = signal<boolean | null>(null);
  protected readonly message = signal('');
  protected readonly revealed = linkedSignal({ source: this.params, computation: () => false });

  protected readonly hidden = computed(() => {
    const status = this.loader.status();
    return status ? this.visibility.rendersNothing(status, 'thread') : false;
  });
  protected readonly warning = computed(() => {
    const status = this.loader.status();
    if (!status) return false;
    this.trusted.entries();
    this.followTrust.revision();
    return (
      (!!status.spoiler_text && !this.trusted.cwExpanded(status.account)) ||
      (status.sensitive && !this.trusted.sensitiveShown(status.account))
    );
  });
  protected readonly filterWarning = computed(() => {
    const status = this.loader.status();
    return status
      ? this.visibility
          .activeFilters(status, 'thread')
          .some((filter) => filter.filter.filter_action === 'warn')
      : false;
  });
  protected readonly textOnly = computed(() => !this.prefs.showImages() || this.prefs.feedReader());
  protected readonly gated = computed(
    () => !this.revealed() && (this.warning() || this.filterWarning() || this.textOnly()),
  );

  /** Recordings Radio can play: attachments, linked files and one provider alternative. */
  protected readonly recordings = computed<RadioTrack[]>(() => {
    const status = this.loader.status();
    if (!status) return [];
    const tracks = this.player.tracks(status.reblog ?? status);
    const native = tracks.filter((track) => !track.external);
    return [...native, ...tracks.filter((track) => track.external).slice(0, native.length ? 0 : 1)];
  });
  /** Providers that only play inline: Spotify, Apple Music, Deezer, Bandcamp… */
  protected readonly inline = computed(() => {
    const status = this.loader.status();
    return status
      ? this.services
          .arrange(postExternalMedia(status))
          .filter((source) => source.embed && source.type === 'audio' && !source.controllable)
      : [];
  });
  protected readonly chosen = linkedSignal(() => {
    const wanted = this.params()['media'];
    const list = this.recordings();
    return list.find((track) => track.media.id === wanted) ?? list[0] ?? null;
  });
  /** This page's recording is the one Radio is playing. */
  protected readonly playing = computed(() => {
    const chosen = this.chosen();
    return !!chosen && this.player.active() && this.player.current()?.key === chosen.key;
  });
  protected readonly resumeAt = computed(() => {
    const chosen = this.chosen();
    return chosen && !this.playing() ? (this.player.positions().get(chosen.key)?.time ?? 0) : 0;
  });
  /** Skip buttons suit anything past a couple of minutes: talks, podcasts, long mixes. */
  protected readonly long = computed(() => this.player.duration() >= 120);
  /** Replies in reading order, indented by depth (capped so long threads stay readable). */
  protected readonly comments = computed(() => {
    const root = this.loader.status();
    const depth = new Map<string, number>(root ? [[root.id, 0]] : []);
    return this.loader.descendants().map((post) => {
      const level = Math.min(3, (depth.get(post.in_reply_to_id ?? '') ?? 0) + 1);
      depth.set(post.id, level);
      return { post, level };
    });
  });

  constructor() {
    this.player.installDock(RadioDock);
    this.playlists.refresh();
    this.singles.refresh();
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      this.loader.destroy();
      this.player.dockSuppressed.set(false);
    });
    effect(() => {
      const status = this.loader.status();
      if (status) this.linked.resolve([status.reblog ?? status]);
    });
    effect(() => this.player.dockSuppressed.set(this.playing()));
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.loader.destroy();
      this.loader.status.set(null);
      this.loader.descendants.set([]);
      this.loader.loadError.set(null);
      this.loader.publicContextUnavailable.set(false);
      this.threadCwOpen.set(null);
      this.params.set(Object.fromEntries(params.keys.map((key) => [key, params.get(key) ?? ''])));
      this.error.set('');
      this.message.set('');
      const post = params.get('post');
      if (!post || post.length > 4000) {
        this.loader.loading.set(false);
        this.error.set('listen.unavailable');
        return;
      }
      // As on Watch: a server-local id is only meaningful on the server that issued it.
      if (!parseAnonymousStatusRouteRef(post) && !post.includes(':')) {
        try {
          const url = new URL(params.get('server') ?? '');
          if (
            url.username ||
            url.password ||
            url.origin !== new URL(this.server.baseUrl() || location.origin).origin
          ) {
            this.error.set('listen.wrongServer');
            return;
          }
        } catch {
          this.error.set('listen.wrongServer');
          return;
        }
      }
      this.loader.load(post);
    });
    // Account changes invalidate the original authorization.
    let identity: string | undefined;
    effect(() => {
      const next = `${this.auth.kind()}:${this.auth.token() ?? ''}:${this.server.baseUrl()}`;
      if (identity !== undefined && identity !== next) {
        this.loader.destroy();
        this.loader.status.set(null);
        this.error.set('listen.unavailable');
      }
      identity = next;
    });
  }

  protected play(at = 0): void {
    const track = this.chosen();
    if (track) this.player.playSingle(track, at);
  }
  protected playNext(): void {
    const track = this.chosen();
    if (!track) return;
    this.player.playNext([track]);
    this.message.set(this.transloco.translate('listen.queued'));
  }
  protected async append(track: RadioTrack, rowId: string): Promise<void> {
    const result = await this.actions.append(track, rowId);
    if (result) this.message.set(result);
  }
  /** Keep this page's recording, or its first inline player, as a saved Single. */
  protected saveSingle(): void {
    const track = this.chosen() ?? this.inlineSingle();
    if (track) this.message.set(this.actions.keep([track]));
  }
  protected addTo(playlistId: string): void {
    const track = this.chosen();
    if (track) this.message.set(this.actions.keep([track], playlistId));
  }
  protected newPlaylist(): void {
    const track = this.chosen();
    if (!track) return;
    const id = this.playlists.create(this.player.title(track), [track]);
    if (id) void this.router.navigate(['/playlists', id]);
  }
  /** A post whose only players play inline is still a Single worth keeping. */
  private inlineSingle(): RadioTrack | null {
    const status = this.loader.status();
    return status ? (this.player.singlesOf(status.reblog ?? status)[0] ?? null) : null;
  }
  protected clock(seconds: number): string {
    const value = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(value / 3600);
    const rest = `${Math.floor((value % 3600) / 60)}:${String(value % 60).padStart(2, '0')}`;
    return hours ? `${hours}:${rest.padStart(5, '0')}` : rest;
  }
  protected onReply(reply: Status): void {
    this.loader.descendants.update((replies) => [...replies, reply]);
  }
  protected onCommentChanged(status: Status): void {
    this.loader.descendants.update((items) =>
      items.map((item) => (item.id === status.id ? status : item)),
    );
  }
  protected onCommentDeleted(status: Status): void {
    this.loader.descendants.update((items) => items.filter((item) => item.id !== status.id));
  }
}
