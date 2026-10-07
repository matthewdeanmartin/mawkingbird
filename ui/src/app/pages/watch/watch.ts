import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { ThreadLoader } from '../read/thread-loader';
import { VideoPlayer } from '../../video-player/video-player';
import { attachmentSource, statusVideo, youtubeSource } from '../../video-player/media-source';
import { StatusCard } from '../../status-card/status-card';
import { StatusVisibility } from '../../status-visibility';
import { TrustedAccounts } from '../../trusted-accounts';
import { FollowTrust } from '../../follow-trust';
import { ClientPrefs } from '../../client-prefs';
import { Server } from '../../server';
import { Auth } from '../../auth';
import { ReadingZen } from '../../reading-zen';
import { MbButton } from '../../design-system/button/button';
import { parseAnonymousStatusRouteRef } from '../../providers/anonymous/anonymous-route-ref';
import { Status } from '../../models';
import { PartyConversation } from './party-conversation';

// i18n watch.title: Watch
// i18n watch.back: Back
// i18n watch.loading: Opening video…
// i18n watch.unavailable: This video is unavailable or you don't have access to its post.
// i18n watch.wrongServer: Switch to the server this post belongs to before opening its video.
// i18n watch.reveal: Show video
// i18n watch.hiddenMedia: Media is hidden by your reading preferences. You can open this video without changing them.
// i18n watch.warning: This post has a content warning or sensitive media.
// i18n watch.filterWarning: This post matched a content filter.
// i18n watch.conversation: Conversation
// i18n watch.noComments: No comments yet.
// i18n watch.thread: Open full thread
@Component({
  selector: 'app-watch',
  imports: [VideoPlayer, StatusCard, TranslocoPipe, RouterLink, MbButton, PartyConversation],
  providers: [ThreadLoader],
  templateUrl: './watch.html',
  styleUrl: './watch.css',
})
export class Watch {
  protected party = viewChild(PartyConversation);
  protected partySession = computed(() => JSON.stringify(this.params()));
  protected loader = inject(ThreadLoader);
  private route = inject(ActivatedRoute);
  private server = inject(Server);
  private auth = inject(Auth);
  private visibility = inject(StatusVisibility);
  private trusted = inject(TrustedAccounts);
  private followTrust = inject(FollowTrust);
  private prefs = inject(ClientPrefs);
  private location = inject(Location);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  protected params = signal<Record<string, string>>({});
  protected error = signal('');
  protected direct = signal(false);
  protected revealed = linkedSignal({ source: this.params, computation: () => false });
  protected hidden = computed(() => {
    const status = this.loader.status();
    return status ? this.visibility.rendersNothing(status, 'thread') : false;
  });
  protected warning = computed(() => {
    const status = this.loader.status();
    if (!status) return false;
    this.trusted.entries();
    this.followTrust.revision();
    return (
      (!!status.spoiler_text && !this.trusted.cwExpanded(status.account)) ||
      (status.sensitive && !this.trusted.sensitiveShown(status.account))
    );
  });
  protected filterWarning = computed(() => {
    const status = this.loader.status();
    return status
      ? this.visibility
          .activeFilters(status, 'thread')
          .some((filter) => filter.filter.filter_action === 'warn')
      : false;
  });
  protected textOnly = computed(() => !this.prefs.showImages() || this.prefs.feedReader());
  protected gated = computed(
    () => !this.revealed() && (this.warning() || this.filterWarning() || this.textOnly()),
  );
  protected source = computed(() => {
    const params = this.params();
    const status = this.loader.status();
    if (this.error() || this.hidden()) return null;
    if (this.direct()) return youtubeSource(`https://youtu.be/${params['youtube'] ?? ''}`);
    if (!status) return null;
    if (params['attachment']) {
      const media = status.media_attachments.find((item) => item.id === params['attachment']);
      return media ? attachmentSource(media) : null;
    }
    const video = statusVideo(status);
    return video && video.videoId === params['youtube'] ? video : null;
  });

  constructor() {
    const release = inject(ReadingZen).hold('full');
    this.destroyRef.onDestroy(() => {
      this.loader.destroy();
      release();
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.loader.destroy();
      this.loader.status.set(null);
      this.loader.descendants.set([]);
      this.loader.loadError.set(null);
      this.loader.publicContextUnavailable.set(false);
      this.params.set(Object.fromEntries(params.keys.map((key) => [key, params.get(key) ?? ''])));
      this.error.set('');
      const post = params.get('post');
      this.direct.set(!post);
      if (!post) {
        this.loader.loading.set(false);
        if (!this.source()) this.error.set('watch.unavailable');
        return;
      }
      if (post.length > 4000) {
        this.error.set('watch.unavailable');
        return;
      }
      const suppliedServer = params.get('server');
      if (!parseAnonymousStatusRouteRef(post) && !post.includes(':')) {
        try {
          const url = new URL(suppliedServer ?? '');
          if (
            url.username ||
            url.password ||
            url.origin !== new URL(this.server.baseUrl() || location.origin).origin
          ) {
            this.error.set('watch.wrongServer');
            return;
          }
        } catch {
          this.error.set('watch.wrongServer');
          return;
        }
      }
      this.loader.load(post);
    });
    // Account changes invalidate the original authorization and stop the player.
    let identity: string | undefined;
    effect(() => {
      const kind = this.auth.kind();
      const next = `${kind}:${this.auth.token() ?? ''}:${kind === 'bluesky' ? (this.auth.account()?.id ?? '') : ''}:${this.server.baseUrl()}`;
      if (identity !== undefined && identity !== next) {
        this.loader.destroy();
        this.loader.status.set(null);
        this.error.set('watch.unavailable');
      }
      identity = next;
    });
  }

  protected back(): void {
    if (history.state?.navigationId > 1) this.location.back();
    else void this.router.navigate(['/home']);
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
