import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AppDialogs } from '../../shell/app-dialogs';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
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
// i18n videoQueue.watch: Watch
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
  imports: [RouterLink, TranslocoPipe, MbButton, MbContentState, MbPageHeader],
  template: `
    <mb-page-header
      [title]="'videoQueue.title' | transloco"
      [description]="'videoQueue.lead' | transloco"
    />
    @if (queue.items(); as items) {
      @if (items.length) {
        <div class="queue-bar">
          <span class="muted">{{
            'videoQueue.count' | transloco: { count: items.length, limit: limit }
          }}</span>
          <button mbButton variant="outline" size="small" type="button" (click)="clear()">
            {{ 'videoQueue.clear' | transloco }}
          </button>
        </div>
        <ol class="queue">
          @for (item of items; track item.key; let i = $index, first = $first, last = $last) {
            <li
              [attr.aria-label]="
                'videoQueue.rowAria' | transloco: { position: i + 1, title: titleOf(item) }
              "
            >
              @if (item.poster) {
                <img [src]="item.poster" alt="" width="120" height="68" loading="lazy" />
              }
              <div class="queue-text">
                <strong>{{ titleOf(item) }}</strong>
                <span class="muted small">{{
                  (item.params['post'] ? 'videoQueue.fromPost' : 'videoQueue.fromYoutube')
                    | transloco
                }}</span>
              </div>
              <div class="queue-actions">
                <a mbButton size="small" routerLink="/watch" [queryParams]="item.params">{{
                  'videoQueue.watch' | transloco
                }}</a>
                <button
                  mbButton
                  variant="outline"
                  size="small"
                  type="button"
                  [disabled]="first"
                  (click)="queue.move(item.key, -1)"
                >
                  {{ 'videoQueue.up' | transloco }}
                </button>
                <button
                  mbButton
                  variant="outline"
                  size="small"
                  type="button"
                  [disabled]="last"
                  (click)="queue.move(item.key, 1)"
                >
                  {{ 'videoQueue.down' | transloco }}
                </button>
                <button
                  mbButton
                  variant="outline"
                  size="small"
                  type="button"
                  (click)="queue.remove(item.key)"
                >
                  {{ 'videoQueue.remove' | transloco }}
                </button>
              </div>
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
        <ul class="queue">
          @for (entry of recent(); track entry.key) {
            <li>
              @if (entry.video!.poster) {
                <img [src]="entry.video!.poster" alt="" width="120" height="68" loading="lazy" />
              }
              <div class="queue-text">
                <strong>{{
                  entry.video!.title || entry.text || ('videoQueue.untitledRow' | transloco)
                }}</strong>
                <span class="muted small">{{
                  'videoQueue.by' | transloco: { name: entry.name || entry.author }
                }}</span>
              </div>
              <div class="queue-actions">
                <button
                  mbButton
                  size="small"
                  type="button"
                  [attr.aria-label]="
                    'videoQueue.recentAddAria'
                      | transloco: { title: entry.video!.title || entry.text || entry.author }
                  "
                  (click)="addSeen(entry)"
                >
                  {{ 'videoQueue.recentAdd' | transloco }}
                </button>
                <a
                  mbButton
                  variant="outline"
                  size="small"
                  routerLink="/watch"
                  [queryParams]="entry.video!.params"
                  >{{ 'videoQueue.watch' | transloco }}</a
                >
              </div>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 1rem;
    }
    .recent h2 {
      font-size: 1.05rem;
      margin: 1.5rem 0 0.5rem;
    }
    .queue-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .queue {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.5rem;
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem;
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    img {
      width: 120px;
      height: 68px;
      object-fit: cover;
      border-radius: 4px;
      flex: 0 0 auto;
    }
    .queue-text {
      display: grid;
      gap: 2px;
      flex: 1 1 12rem;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .queue-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
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
