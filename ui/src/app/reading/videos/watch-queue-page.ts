import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AppDialogs } from '../../shell/app-dialogs';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbIcon } from '../../design-system/icon/icon';
import {
  MbItemList,
  MbItemMeta,
  MbItemPicture,
  MbItemRow,
  MbItemTitle,
} from '../../design-system/item-list/item-list';
import { MbToolbar, MbToolbarButton } from '../../design-system/toolbar/toolbar';
import { MbPageHeader } from '../../design-system/page-header/page-header';
import {
  QueuedVideo,
  queueKey,
  validWatchParams,
  WATCH_QUEUE_LIMIT,
  WatchQueue,
} from './watch-queue';
import { HistoryEntry, PostHistory } from '../../publishing/post-history';

/** How many recently seen videos to offer under the queue. */
export const RECENT_VIDEOS = 6;

// i18n videoQueue.title: Watch queue
// i18n videoQueue.up: Move up
// i18n videoQueue.down: Move down
// i18n videoQueue.remove: Remove
// i18n videoQueue.clear: Clear queue
// i18n videoQueue.clearConfirm: Remove everything from your watch queue?
// i18n videoQueue.count: {{count}} of {{limit}}
// i18n videoQueue.fromYoutube: YouTube
// i18n videoQueue.fromPost: Fediverse post
// i18n videoQueue.untitledRow: Untitled video
// i18n videoQueue.rowAria: {{position}}. {{title}}
// i18n videoQueue.lead: Up next, in order. Next on Watch plays the top one and drops the one you finished.
// i18n videoQueue.emptyTitle: Nothing lined up
// i18n videoQueue.emptyLine: Add a video from any post, or from what you just saw below.
// i18n videoQueue.recent: Recently seen
// i18n videoQueue.recentAdd: Add
// i18n videoQueue.recentAddAria: Add {{title}}
// i18n videoQueue.by: by {{name}}

/** The account's watch queue, in play order. */
@Component({
  selector: 'app-watch-queue-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbContentState,
    MbIcon,
    MbItemList,
    MbItemMeta,
    MbItemPicture,
    MbItemRow,
    MbItemTitle,
    MbPageHeader,
    MbToolbar,
    MbToolbarButton,
  ],
  template: `
    <mb-page-header
      embedded
      [title]="'videoQueue.title' | transloco"
      [description]="'videoQueue.lead' | transloco"
    >
      @if (queue.items().length) {
        <button mbButton variant="compact" tone="danger" type="button" (click)="clear()">
          {{ 'videoQueue.clear' | transloco }}
        </button>
      }
    </mb-page-header>
    @if (queue.items(); as items) {
      @if (items.length) {
        <p class="muted">
          {{ 'videoQueue.count' | transloco: { count: items.length, limit: limit } }}
        </p>
        <ol mbItemList class="queue">
          @for (item of items; track item.key; let i = $index, first = $first, last = $last) {
            @let title = titleOf(item);
            <li
              mbItemRow
              [attr.aria-label]="'videoQueue.rowAria' | transloco: { position: i + 1, title }"
            >
              @if (item.poster; as poster) {
                <mb-item-picture
                  shape="wide"
                  [src]="poster"
                  link="/watch"
                  [queryParams]="item.params"
                />
              }
              <a mbItemTitle routerLink="/watch" [queryParams]="item.params">{{ title }}</a>
              <span mbItemMeta>{{
                (item.params['post'] ? 'videoQueue.fromPost' : 'videoQueue.fromYoutube') | transloco
              }}</span>
              <mb-toolbar density="compact" embedded [label]="title">
                <button
                  mbToolbarButton
                  type="button"
                  [attr.aria-label]="'videoQueue.up' | transloco"
                  [title]="'videoQueue.up' | transloco"
                  [disabled]="first"
                  (click)="queue.move(item.key, -1)"
                >
                  <mb-icon name="up" />
                </button>
                <button
                  mbToolbarButton
                  type="button"
                  [attr.aria-label]="'videoQueue.down' | transloco"
                  [title]="'videoQueue.down' | transloco"
                  [disabled]="last"
                  (click)="queue.move(item.key, 1)"
                >
                  <mb-icon name="down" />
                </button>
                <button
                  mbToolbarButton
                  type="button"
                  [attr.aria-label]="'videoQueue.remove' | transloco"
                  [title]="'videoQueue.remove' | transloco"
                  (click)="queue.remove(item.key)"
                >
                  <mb-icon name="remove" />
                </button>
              </mb-toolbar>
            </li>
          }
        </ol>
      } @else {
        <mb-content-state
          [title]="'videoQueue.emptyTitle' | transloco"
          [description]="'videoQueue.emptyLine' | transloco"
        />
      }
    }
    @if (recent().length) {
      <!-- Videos in posts you scrolled past, newest first, not already lined up. -->
      <section class="recent" [attr.aria-label]="'videoQueue.recent' | transloco">
        <h2>{{ 'videoQueue.recent' | transloco }}</h2>
        <ul mbItemList>
          @for (entry of recent(); track entry.key) {
            <li mbItemRow>
              @if (entry.video!.poster; as poster) {
                <mb-item-picture
                  shape="wide"
                  [src]="poster"
                  link="/watch"
                  [queryParams]="entry.video!.params"
                />
              }
              <a mbItemTitle routerLink="/watch" [queryParams]="entry.video!.params">{{
                entry.video!.title || entry.text || ('videoQueue.untitledRow' | transloco)
              }}</a>
              <span mbItemMeta>{{
                'videoQueue.by' | transloco: { name: entry.name || entry.author }
              }}</span>
              <button
                mbButton
                variant="compact"
                type="button"
                [attr.aria-label]="
                  'videoQueue.recentAddAria'
                    | transloco: { title: entry.video!.title || entry.text || entry.author }
                "
                (click)="addSeen(entry)"
              >
                <mb-icon name="add" size="small" /> {{ 'videoQueue.recentAdd' | transloco }}
              </button>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 16px;
      padding: 16px;
    }
    .muted {
      margin: 0;
      color: var(--muted);
    }
    .recent h2 {
      font-size: 16px;
      margin: 0 0 8px;
    }
  `,
})
export class WatchQueuePage {
  protected readonly queue = inject(WatchQueue);
  protected readonly limit = WATCH_QUEUE_LIMIT;
  private readonly dialogs = inject(AppDialogs);
  private readonly transloco = inject(TranslocoService);
  private readonly history = inject(PostHistory);

  /**
   * Videos in posts recently scrolled past (post history, newest first), not
   * already in the queue. Empty when History is turned off in settings.
   */
  protected readonly recent = computed(() => {
    const queued = new Set(this.queue.items().map((item) => item.key));
    const seen = new Set<string>();
    return (this.history.current()?.entries() ?? [])
      .filter((entry): entry is HistoryEntry & { video: NonNullable<HistoryEntry['video']> } => {
        if (!entry.video || !validWatchParams(entry.video.params)) return false;
        const key = queueKey(entry.video.params);
        if (queued.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, RECENT_VIDEOS);
  });

  protected addSeen(entry: HistoryEntry): void {
    if (!entry.video) return;
    this.queue.add({
      title: entry.video.title || entry.text,
      ...(entry.video.poster ? { poster: entry.video.poster } : {}),
      params: entry.video.params,
    });
  }

  protected titleOf(item: QueuedVideo): string {
    return item.title || this.transloco.translate('videoQueue.untitledRow');
  }

  protected async clear(): Promise<void> {
    if (
      await this.dialogs.confirm(this.transloco.translate('videoQueue.clearConfirm'), {
        danger: true,
      })
    ) {
      this.queue.clear();
    }
  }
}
