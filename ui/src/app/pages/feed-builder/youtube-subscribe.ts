import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { CHANNEL_ID, VideoSubscriptions } from '../../providers/videos/video-subscriptions';
import { AppOnlyLinkRel } from '../../public-page-urls';

export interface YoutubeChannel {
  id: string;
  title: string;
}

export interface YoutubeWords {
  subscribe: string;
  subscribed: string;
  subscribeAll: (count: number) => string;
  watch: string;
}

/**
 * Subscribe to a creator's YouTube channel inside Mawkingbird: the channel joins
 * video mode's YouTube subscriptions (`VideoSubscriptions`, its RSS feed), so
 * new videos show up in Mawkingbird without a YouTube account. A second click
 * unsubscribes. Kept in its own component, rendered in a `@defer` block, so the
 * prerendered page never touches browser storage.
 */
@Component({
  selector: 'app-youtube-subscribe',
  imports: [MbButton],
  template: `@if (valid()) {
    <button
      mbButton
      size="small"
      [variant]="subscribed() ? 'solid' : 'outline'"
      type="button"
      [attr.aria-pressed]="subscribed()"
      (click)="toggle()"
    >
      {{ subscribed() ? words().subscribed : words().subscribe }}
    </button>
  }`,
})
export class YoutubeSubscribe {
  private readonly subscriptions = inject(VideoSubscriptions);
  readonly channel = input.required<YoutubeChannel>();
  readonly words = input.required<YoutubeWords>();
  protected readonly valid = computed(() => CHANNEL_ID.test(this.channel().id));
  protected readonly subscribed = computed(() =>
    this.subscriptions.feeds().some((feed) => feed.id === this.channel().id),
  );

  protected toggle(): void {
    const { id, title } = this.channel();
    if (this.subscribed()) this.subscriptions.remove(id);
    else this.subscriptions.add(id, title);
  }
}

/** Subscribe to every creator's channel on the YouTube shelf at once. */
@Component({
  selector: 'app-youtube-subscribe-all',
  imports: [MbButton, MbContentLink, RouterLink, AppOnlyLinkRel],
  template: `<div class="youtube-all">
    <button mbButton type="button" [disabled]="!missing().length" (click)="subscribeAll()">
      {{ words().subscribeAll(channels().length) }}
    </button>
    @if (anySubscribed()) {
      <a mbContentLink routerLink="/videos">{{ words().watch }}</a>
    }
  </div>`,
  styles: `
    .youtube-all {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      margin-block: 8px 12px;
    }
  `,
})
export class YoutubeSubscribeAll {
  private readonly subscriptions = inject(VideoSubscriptions);
  readonly channels = input.required<YoutubeChannel[]>();
  readonly words = input.required<YoutubeWords>();
  protected readonly missing = computed(() =>
    this.channels().filter(
      (channel) => CHANNEL_ID.test(channel.id) && !this.subscriptions.has(channel.id),
    ),
  );
  protected readonly anySubscribed = computed(() =>
    this.channels().some((channel) =>
      this.subscriptions.feeds().some((feed) => feed.id === channel.id),
    ),
  );

  protected subscribeAll(): void {
    for (const channel of this.missing()) this.subscriptions.add(channel.id, channel.title);
  }
}
