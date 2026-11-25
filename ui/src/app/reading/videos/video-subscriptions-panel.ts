import { booleanAttribute, Component, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbHelp } from '../../design-system/help/help';
import { MbButton } from '../../design-system/button/button';
import { VideoSubscriptions } from './video-subscriptions';
import { YoutubeFeeds } from './youtube-feeds';
import { channelInput } from './youtube-channel';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbAddBox } from '../../design-system/add-box/add-box';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbIcon } from '../../design-system/icon/icon';
import { MbMenuItem } from '../../design-system/menu/menu-item';
import { MbPostMenu } from '../../design-system/menu/post-menu';
import { MbNavigation, MbNavLink } from '../../design-system/navigation/navigation';
import { MbPageHeader } from '../../design-system/page-header/page-header';

// i18n videos.title: Video feeds
// i18n videos.proxyHelp: About video subscriptions
// i18n videos.subscriptions: Subscriptions
// i18n videos.channelPage: Channel
// i18n videos.findCreators: Find YouTubers on Mastodon
// i18n videos.paste: YouTube channel link, @handle or channel ID
// i18n videos.subscribe: Subscribe
// i18n videos.subscribing: Finding channel…
// i18n videos.unsubscribe: Unsubscribe
// i18n videos.manageChannels: Channels ({{count}})
// i18n videos.channelMenu: {{channel}}: options
// i18n videos.notIncluded: Not in All videos
// i18n videos.enable: Include this channel
// i18n videos.emptySubs: No video feeds yet. Paste a channel above to subscribe.
// i18n videos.resolveFailed: Couldn't find that channel. Check the link or try its UC channel ID.
// i18n videos.savedSub: Channel subscribed.
// i18n videos.all: All videos
// i18n videos.checkChannel: Check channel on YouTube
// i18n videos.failureDetails: Subscription details
// i18n videos.retrySubscription: Retry subscription
// i18n videos.closeDetails: Close
let nextId = 0;

@Component({
  selector: 'app-video-subscriptions-panel',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbAddBox,
    MbButton,
    MbControl,
    MbDialog,
    MbField,
    MbHelp,
    MbIcon,
    MbMenuItem,
    MbNavigation,
    MbNavLink,
    MbPageHeader,
    MbPostMenu,
  ],
  template: `
    <mb-page-header embedded [level]="level()" [title]="'videos.subscriptions' | transloco">
      <mb-help [label]="'videos.proxyHelp' | transloco"
        ><p>{{ 'videos.proxyNote' | transloco }}</p></mb-help
      >
    </mb-page-header>
    @if (collapsible()) {
      <!-- On a phone the feed comes first; the channels wait behind this. -->
      <button
        mbButton
        variant="compact"
        class="reveal"
        type="button"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="bodyId"
        (click)="open.set(!open())"
      >
        <mb-icon [name]="open() ? 'up' : 'down'" size="small" />
        {{ 'videos.manageChannels' | transloco: { count: subs.feeds().length } }}
      </button>
    }
    <div class="body" [id]="bodyId" [class.closed]="collapsible() && !open()">
      <form mbAddBox (ngSubmit)="subscribe()">
        <mb-field [label]="'videos.paste' | transloco" [error]="error() | transloco">
          <input
            mbControl
            name="channel"
            autocomplete="off"
            [(ngModel)]="channel"
            maxlength="500"
          />
        </mb-field>
        <button
          mbButton
          type="submit"
          [attr.aria-label]="(busy() ? 'videos.subscribing' : 'videos.subscribe') | transloco"
          [title]="'videos.subscribe' | transloco"
          [disabled]="busy()"
        >
          <mb-icon name="add" />
        </button>
      </form>
      @if (message()) {
        <p role="status">{{ message() | transloco }}</p>
      }
      @if (failure(); as error) {
        <mb-dialog
          [title]="'videos.failureDetails' | transloco"
          [closeLabel]="'videos.closeDetails' | transloco"
          (dismissed)="failure.set(null)"
        >
          <p>{{ 'videos.resolveFailed' | transloco }}</p>
          <p>{{ error.input }}</p>
          <p>{{ error.detail }}</p>
          @if (error.url) {
            <a [href]="error.url" target="_blank" rel="noopener noreferrer">{{
              'videos.checkChannel' | transloco
            }}</a>
          }
          <button
            mbButton
            type="button"
            mbDialogActions
            (click)="channel = error.input; subscribe()"
          >
            {{ 'videos.retrySubscription' | transloco }}
          </button>
        </mb-dialog>
      }
      <nav mbNavigation [label]="'videos.subscriptions' | transloco">
        <a mbNavLink routerLink="/videos" [current]="!selected()" (click)="opened.emit()">{{
          'videos.all' | transloco
        }}</a>
        @for (feed of subs.feeds(); track feed.id) {
          <div class="subscription">
            <a
              mbNavLink
              routerLink="/videos"
              [queryParams]="{ channel: feed.id }"
              [current]="selected() === feed.id"
              (click)="opened.emit()"
              ><span dir="auto">{{ feed.title }}</span>
              @if (!feed.enabled) {
                <span class="muted">{{ 'videos.notIncluded' | transloco }}</span>
              }
            </a>
            <mb-post-menu
              [label]="'videos.channelMenu' | transloco: { channel: feed.title }"
              [closeLabel]="'videos.closeDetails' | transloco"
            >
              <a mbMenuItem [routerLink]="['/videos/channel', feed.id]" (click)="opened.emit()">{{
                'videos.channelPage' | transloco
              }}</a>
              <button
                type="button"
                mbMenuItem
                [pressed]="feed.enabled"
                (click)="subs.setEnabled(feed.id, !feed.enabled)"
              >
                {{ 'videos.enable' | transloco }}
              </button>
              <button type="button" mbMenuItem tone="danger" (click)="subs.remove(feed.id)">
                {{ 'videos.unsubscribe' | transloco }}
              </button>
            </mb-post-menu>
          </div>
        } @empty {
          <p class="muted">{{ 'videos.emptySubs' | transloco }}</p>
        }
      </nav>
      <!-- The way to the creator kits on phones, where the rail is hidden. -->
      <a routerLink="/videos/starters" (click)="opened.emit()">{{
        'videos.findCreators' | transloco
      }}</a>
    </div>
  `,
  styles: `
    :host,
    .body {
      display: grid;
      gap: 12px;
      min-width: 0;
    }
    p {
      margin: 0;
    }
    .reveal {
      display: none;
      justify-self: start;
    }
    .subscription {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
    }
    .subscription span {
      display: block;
    }
    .muted {
      color: var(--muted);
      font-size: 13px;
    }
    nav p {
      padding-block: 12px;
    }
    @media (max-width: 1000px) {
      .reveal {
        display: inline-flex;
      }
      .closed {
        display: none;
      }
    }
  `,
})
export class VideoSubscriptionsPanel {
  readonly selected = input<string | null>(null);
  /** 1 where the panel is the page's own heading, as on Videos. */
  readonly level = input<1 | 2>(2);
  /** Fold the channels away at rail-stacking widths, behind a button. */
  readonly collapsible = input(false, { transform: booleanAttribute });
  readonly opened = output<void>();
  protected subs = inject(VideoSubscriptions);
  private youtube = inject(YoutubeFeeds);
  protected channel = '';
  protected busy = signal(false);
  protected message = signal('');
  protected error = signal('');
  /** With nothing subscribed yet, the box to add a channel is the point. */
  protected open = signal(!this.subs.feeds().length);
  protected readonly bodyId = `video-subscriptions-${nextId++}`;
  protected failure = signal<{ input: string; detail: string; url: string | null } | null>(null);
  protected async subscribe(): Promise<void> {
    if (this.busy() || !this.channel.trim()) return;
    this.busy.set(true);
    this.message.set('');
    this.error.set('');
    this.failure.set(null);
    const input = this.channel.trim();
    try {
      const channel = await this.youtube.resolve(input);
      this.subs.add(channel.id, channel.title);
      this.channel = '';
      this.message.set('videos.savedSub');
    } catch (error) {
      this.error.set('videos.resolveFailed');
      const parsed = channelInput(input);
      this.failure.set({
        input,
        detail:
          error instanceof Error || error instanceof HttpErrorResponse
            ? error.message
            : String(error),
        url: parsed
          ? 'url' in parsed
            ? parsed.url
            : `https://www.youtube.com/channel/${parsed.id}`
          : null,
      });
    } finally {
      this.busy.set(false);
    }
  }
}
