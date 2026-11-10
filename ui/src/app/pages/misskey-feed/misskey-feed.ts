import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom, Subscription } from 'rxjs';
import { Auth } from '../../auth';
import { MbButton } from '../../design-system/button/button';
import { Status } from '../../models';
import { MisskeyApi } from '../../providers/misskey/misskey-api';
import { MisskeyAuth } from '../../providers/misskey/misskey-auth';
import {
  misskeyIdentity,
  misskeyIdentityCanWrite,
  misskeyIdentityHas,
} from '../../providers/misskey/misskey-identity-store';
import { MkChannel, MkFeedKind } from '../../providers/misskey/misskey-types';
import { StatusCard } from '../../status-card/status-card';

// i18n pages.misskeyFeed.kind.antenna: Antenna
// i18n pages.misskeyFeed.kind.list: List
// i18n pages.misskeyFeed.kind.channel: Channel
// i18n pages.misskeyFeed.kind.clip: Clip
// i18n pages.misskeyFeed.loading: Loading…
// i18n pages.misskeyFeed.none: Nothing here yet.
// i18n pages.misskeyFeed.failed: Could not load this from the Misskey server.
// i18n pages.misskeyFeed.needsAccount: This needs a Misskey account. Sign in to read it.
// i18n pages.misskeyFeed.more: Load more
// i18n pages.misskeyFeed.back: All feeds
// i18n pages.misskeyFeed.follow: Follow channel
// i18n pages.misskeyFeed.unfollow: Unfollow channel
// i18n pages.misskeyFeed.followFailed: That did not work on Misskey. Please try again.
// i18n pages.misskeyFeed.approveChannels: Allow following channels
// i18n pages.misskeyFeed.approveChannelsHint: Your Misskey sign-in is from before channels could be followed here, so {{server}} needs to approve once more.

const KINDS: readonly MkFeedKind[] = ['antenna', 'list', 'channel', 'clip'];

/**
 * One Misskey antenna, list, channel or clip (`/misskey/:kind/:id`): its
 * notes, newest first, paged by `untilId`. Opened from the Feeds page. A
 * channel can be followed from here, which also brings it into Home's Social
 * timeline on Misskey.
 */
@Component({
  selector: 'app-misskey-feed',
  imports: [RouterLink, TranslocoPipe, MbButton, StatusCard],
  template: `
    <div class="mk-feed">
      <p class="mk-feed-back small">
        <a routerLink="/feeds">← {{ 'pages.misskeyFeed.back' | transloco }}</a>
      </p>
      <p class="mk-feed-kind muted small">
        {{ 'pages.misskeyFeed.kind.' + kind() | transloco }}
      </p>
      <h1 class="mk-feed-title">{{ name() || '…' }}</h1>
      @if (description(); as text) {
        <p class="mk-feed-description muted">{{ text }}</p>
      }
      @if (channelNeedsApproval()) {
        <div class="mk-feed-actions">
          <p class="muted small">
            {{ 'pages.misskeyFeed.approveChannelsHint' | transloco: { server: host() } }}
          </p>
          <button mbButton variant="outline" type="button" (click)="approveChannels()">
            {{ 'pages.misskeyFeed.approveChannels' | transloco }}
          </button>
        </div>
      } @else if (canFollowChannel()) {
        <div class="mk-feed-actions">
          <button
            mbButton
            type="button"
            [variant]="channelFollowing() ? 'outline' : 'solid'"
            [disabled]="busy()"
            (click)="toggleChannelFollow()"
          >
            {{
              (channelFollowing() ? 'pages.misskeyFeed.unfollow' : 'pages.misskeyFeed.follow')
                | transloco
            }}
          </button>
          @if (actionFailed()) {
            <p class="error small" role="alert">
              {{ 'pages.misskeyFeed.followFailed' | transloco }}
            </p>
          }
        </div>
      }
      @if (loading()) {
        <p class="muted center" role="status">{{ 'pages.misskeyFeed.loading' | transloco }}</p>
      } @else if (failed()) {
        <p class="center" role="alert">
          {{
            (needsAccount() ? 'pages.misskeyFeed.needsAccount' : 'pages.misskeyFeed.failed')
              | transloco
          }}
        </p>
      } @else {
        @for (status of notes(); track status.id) {
          <app-status-card
            [status]="status"
            (changed)="onChanged($event)"
            (deleted)="onDeleted($event)"
          />
        } @empty {
          <p class="muted center">{{ 'pages.misskeyFeed.none' | transloco }}</p>
        }
        @if (!exhausted() && notes().length) {
          <div class="mk-more">
            <button
              mbButton
              variant="outline"
              type="button"
              [disabled]="loadingMore()"
              (click)="more()"
            >
              {{ 'pages.misskeyFeed.more' | transloco }}
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .mk-feed-back,
    .mk-feed-kind,
    .mk-feed-description,
    .mk-feed-actions {
      margin: 8px 16px 0;
    }
    .mk-feed-title {
      margin: 0 16px 4px;
      font-size: 20px;
      overflow-wrap: anywhere;
    }
    .mk-feed-description {
      white-space: pre-line;
    }
    .mk-feed-actions {
      margin-bottom: 12px;
    }
    .mk-more {
      display: flex;
      justify-content: center;
      padding: 8px 16px;
    }
  `,
})
export class MisskeyFeed implements OnInit, OnDestroy {
  private api = inject(MisskeyApi);
  private auth = inject(Auth);
  private route = inject(ActivatedRoute);
  private misskeyAuth = inject(MisskeyAuth);

  protected kind = signal<MkFeedKind>('antenna');
  protected id = signal('');
  protected name = signal('');
  protected description = signal<string | null>(null);
  protected notes = signal<Status[]>([]);
  protected loading = signal(true);
  protected loadingMore = signal(false);
  protected failed = signal(false);
  protected needsAccount = signal(false);
  protected exhausted = signal(false);
  protected channelFollowing = signal(false);
  protected busy = signal(false);
  protected actionFailed = signal(false);
  private untilId: string | null = null;
  private seq = 0;
  private sub = new Subscription();

  private readonly server = computed(
    () => misskeyIdentity(this.auth.activeMisskeyKey())?.profile.server ?? '',
  );
  protected readonly host = computed(() => {
    try {
      return new URL(this.server()).host;
    } catch {
      return '';
    }
  });
  /** A channel, read by an account that may write: following is on offer. */
  private readonly channelWriter = computed(
    () =>
      this.kind() === 'channel' &&
      !this.auth.isMisskeyVisitor &&
      misskeyIdentityCanWrite(this.auth.activeMisskeyKey()),
  );
  /** Following a channel needs `write:channels`, asked for since M3. */
  protected readonly canFollowChannel = computed(
    () =>
      this.channelWriter() && misskeyIdentityHas('write:channels', this.auth.activeMisskeyKey()),
  );
  /** A token from before M3: approve once more to follow channels. */
  protected readonly channelNeedsApproval = computed(
    () => this.channelWriter() && !this.canFollowChannel(),
  );

  protected approveChannels(): void {
    const server = this.server();
    if (server) location.assign(this.misskeyAuth.begin(server, false));
  }

  ngOnInit(): void {
    this.sub.add(
      this.route.paramMap.subscribe((params) => {
        const kind = params.get('kind') as MkFeedKind;
        this.kind.set(KINDS.includes(kind) ? kind : 'antenna');
        this.id.set(params.get('id') ?? '');
        this.name.set('');
        this.description.set(null);
        this.notes.set([]);
        this.untilId = null;
        this.exhausted.set(false);
        this.failed.set(false);
        this.needsAccount.set(false);
        this.loading.set(true);
        const seq = ++this.seq;
        void this.describe(seq);
        void this.page(seq).finally(() => {
          if (seq === this.seq) this.loading.set(false);
        });
      }),
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  protected async more(): Promise<void> {
    if (this.loadingMore() || this.exhausted()) return;
    this.loadingMore.set(true);
    try {
      await this.page(this.seq);
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected async toggleChannelFollow(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionFailed.set(false);
    const follow = !this.channelFollowing();
    try {
      await firstValueFrom(this.api.setChannelFollowing(this.id(), follow));
      this.channelFollowing.set(follow);
    } catch {
      this.actionFailed.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  private async describe(seq: number): Promise<void> {
    try {
      const info = await firstValueFrom(this.api.feedInfo(this.kind(), this.id()));
      if (seq !== this.seq) return;
      this.name.set(info.name ?? '');
      this.description.set(info.description || null);
      if (this.kind() === 'channel') {
        this.channelFollowing.set(!!(info as MkChannel).isFollowing);
      }
    } catch {
      // The notes below say whether the feed could be read at all.
    }
  }

  private async page(seq: number): Promise<void> {
    try {
      const [found, { adaptMisskeyNote }] = await Promise.all([
        firstValueFrom(this.api.feedNotes(this.kind(), this.id(), this.untilId)),
        import('../../providers/misskey/misskey-adapter'),
      ]);
      if (seq !== this.seq) return;
      const last = found.at(-1)?.id ?? null;
      this.exhausted.set(!last || last === this.untilId);
      this.untilId = last;
      const server = this.server();
      this.notes.update((list) => [
        ...list,
        ...found.filter((n) => !n.isHidden).map((n) => adaptMisskeyNote(n, server)),
      ]);
    } catch (err) {
      if (seq === this.seq) {
        const signInRequired =
          typeof err === 'object' && err !== null && 'signInRequired' in err
            ? !!(err as { signInRequired: boolean }).signInRequired
            : false;
        this.needsAccount.set(signInRequired);
        this.failed.set(true);
        this.exhausted.set(true);
      }
    }
  }

  protected onChanged(updated: Status): void {
    this.notes.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
  }

  protected onDeleted(removed: Status): void {
    this.notes.update((list) => list.filter((s) => s.id !== removed.id));
  }
}
