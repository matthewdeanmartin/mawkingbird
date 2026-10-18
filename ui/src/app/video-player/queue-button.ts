import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { QueuedVideo, WatchQueue } from '../providers/videos/watch-queue';

// i18n videoQueue.add: Queue
// i18n videoQueue.queued: Queued
// i18n videoQueue.full: Queue full
// i18n videoQueue.addAria: Add {{title}} to your watch queue
// i18n videoQueue.removeAria: Remove {{title}} from your watch queue
// i18n videoQueue.untitled: this video

/** Adds a video to the watch queue, or takes it back out. */
@Component({
  selector: 'app-queue-button',
  imports: [MbButton, TranslocoPipe],
  template: `
    @if (entry(); as video) {
      <button
        mbButton
        variant="outline"
        size="small"
        type="button"
        [attr.aria-pressed]="queued()"
        [disabled]="!queued() && queue.full()"
        [attr.aria-label]="
          (queued() ? 'videoQueue.removeAria' : 'videoQueue.addAria')
            | transloco: { title: video.title || ('videoQueue.untitled' | transloco) }
        "
        (click)="toggle(video)"
      >
        {{
          (queued() ? 'videoQueue.queued' : queue.full() ? 'videoQueue.full' : 'videoQueue.add')
            | transloco
        }}
      </button>
    }
  `,
})
export class QueueButton {
  readonly entry = input.required<Omit<QueuedVideo, 'addedAt'> | null>();
  protected readonly queue = inject(WatchQueue);
  protected readonly queued = computed(() => {
    const entry = this.entry();
    return !!entry && this.queue.has(entry.key);
  });

  protected toggle(entry: Omit<QueuedVideo, 'addedAt'>): void {
    if (this.queue.has(entry.key)) this.queue.remove(entry.key);
    else this.queue.add(entry);
  }
}
