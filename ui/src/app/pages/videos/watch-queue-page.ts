import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AppDialogs } from '../../app-dialogs';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbPageHeader } from '../../design-system/page-header/page-header';
import { QueuedVideo, WATCH_QUEUE_LIMIT, WatchQueue } from '../../providers/videos/watch-queue';

// i18n videoQueue.title: Watch queue
// i18n videoQueue.description: Videos you saved to watch, in order. Next on Watch plays the next one and takes the finished one off the list.
// i18n videoQueue.empty: Nothing queued yet
// i18n videoQueue.emptyHint: Use Queue on any video — in Fedi videos, YouTube or a post — to line it up here.
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

/** The account's watch queue, in play order. */
@Component({
  selector: 'app-watch-queue-page',
  imports: [RouterLink, TranslocoPipe, MbButton, MbContentState, MbPageHeader],
  template: `
    <mb-page-header
      [title]="'videoQueue.title' | transloco"
      [description]="'videoQueue.description' | transloco"
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
          [title]="'videoQueue.empty' | transloco"
          [description]="'videoQueue.emptyHint' | transloco"
        />
      }
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 1rem;
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
