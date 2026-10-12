import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { VideoSubscriptions } from '../../providers/videos/video-subscriptions';
import { YoutubeFeeds } from '../../providers/videos/youtube-feeds';

// i18n videos.title: Video feeds
// i18n videos.subscriptions: Subscriptions
// i18n videos.paste: YouTube channel link, @handle or channel ID
// i18n videos.subscribe: Subscribe
// i18n videos.subscribing: Finding channel…
// i18n videos.unsubscribe: Unsubscribe
// i18n videos.enable: Include this channel
// i18n videos.emptySubs: No video feeds yet. Paste a channel above to subscribe.
// i18n videos.resolveFailed: Couldn't find that channel. Check the link or try its UC channel ID.
// i18n videos.savedSub: Channel subscribed.
// i18n videos.all: All videos
@Component({
  selector: 'app-video-subscriptions-panel',
  imports: [FormsModule, RouterLink, TranslocoPipe, MbButton],
  template: `
    <h2>{{ 'videos.subscriptions' | transloco }}</h2>
    <form (ngSubmit)="subscribe()">
      <label for="video-channel">{{ 'videos.paste' | transloco }}</label>
      <input id="video-channel" name="channel" [(ngModel)]="channel" maxlength="500" required />
      <button mbButton type="submit" [disabled]="busy() || !channel.trim()">
        {{ (busy() ? 'videos.subscribing' : 'videos.subscribe') | transloco }}
      </button>
    </form>
    @if (message()) {
      <p role="status">{{ message() | transloco }}</p>
    }
    <nav [attr.aria-label]="'videos.subscriptions' | transloco">
      <a
        routerLink="/videos"
        (click)="opened.emit()"
        [attr.aria-current]="!selected() ? 'page' : null"
        >{{ 'videos.all' | transloco }}</a
      >
      @for (feed of subs.feeds(); track feed.id) {
        <div class="subscription">
          <a
            routerLink="/videos"
            (click)="opened.emit()"
            [queryParams]="{ channel: feed.id }"
            [attr.aria-current]="selected() === feed.id ? 'page' : null"
            >{{ feed.title }}</a
          >
          <div class="actions">
            <label
              ><input
                type="checkbox"
                [checked]="feed.enabled"
                (change)="subs.setEnabled(feed.id, $any($event.target).checked)"
              />
              {{ 'videos.enable' | transloco }}</label
            >
            <button
              mbButton
              variant="outline"
              size="small"
              type="button"
              (click)="subs.remove(feed.id)"
            >
              {{ 'videos.unsubscribe' | transloco }}
            </button>
          </div>
        </div>
      } @empty {
        <p class="muted">{{ 'videos.emptySubs' | transloco }}</p>
      }
    </nav>
  `,
  styles: `
    :host {
      display: block;
    }
    h2 {
      font-size: 1rem;
      margin: 0 0 1rem;
    }
    form {
      display: grid;
      gap: 0.6rem;
      margin-bottom: 1rem;
    }
    input:not([type='checkbox']) {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    nav > a,
    .subscription {
      display: block;
      padding: 0.8rem 0;
      border-bottom: 1px solid var(--border);
    }
    a {
      overflow-wrap: anywhere;
    }
    a[aria-current='page'] {
      font-weight: 700;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.6rem;
      margin-top: 0.6rem;
      font-size: 0.8rem;
    }
  `,
})
export class VideoSubscriptionsPanel {
  readonly selected = input<string | null>(null);
  readonly opened = output<void>();
  protected subs = inject(VideoSubscriptions);
  private youtube = inject(YoutubeFeeds);
  protected channel = '';
  protected busy = signal(false);
  protected message = signal('');
  protected async subscribe(): Promise<void> {
    if (this.busy() || !this.channel.trim()) return;
    this.busy.set(true);
    this.message.set('');
    try {
      const channel = await this.youtube.resolve(this.channel);
      this.subs.add(channel.id, channel.title);
      this.channel = '';
      this.message.set('videos.savedSub');
    } catch {
      this.message.set('videos.resolveFailed');
    } finally {
      this.busy.set(false);
    }
  }
}
