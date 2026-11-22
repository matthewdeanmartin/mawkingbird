import { Component, computed, inject, input, signal, DestroyRef } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { VideoSource } from './media-source';
import { UpdateRecovery } from '../../platform/build/update-recovery';
import type { VideoPlayer } from './video-player';
import type { Type } from '@angular/core';

/** Keep optional controls out of timeline/root chunks; load only for visible media. */
@Component({
  selector: 'app-video-player',
  imports: [NgComponentOutlet, TranslocoPipe, MbButton],
  template: `
    @if (player(); as component) {
      <ng-container [ngComponentOutlet]="component" [ngComponentOutletInputs]="inputs()" />
    } @else if (failed()) {
      <p role="alert">{{ 'videoPlayer.failed' | transloco }}</p>
      <button type="button" mbButton (click)="load()">{{ 'videoPlayer.retry' | transloco }}</button>
    } @else {
      <p role="status">{{ 'videoPlayer.loading' | transloco }}</p>
    }
  `,
  host: { '(click)': '$event.stopPropagation()' },
})
export class VideoPlayerHost {
  readonly source = input.required<VideoSource>();
  readonly watch = input<Record<string, string> | null>(null);
  readonly inline = input(false);
  readonly compact = input(false);
  protected player = signal<Type<VideoPlayer> | null>(null);
  protected failed = signal(false);
  private destroyed = false;
  private readonly recovery = inject(UpdateRecovery);
  protected inputs = computed(() => ({
    source: this.source(),
    watch: this.watch(),
    inline: this.inline(),
    compact: this.compact(),
  }));

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
    });
    this.load();
  }

  /** The player chunk. A method so a test can stand in a failed import. */
  protected importPlayer(): Promise<typeof import('./video-player')> {
    return import('./video-player');
  }

  protected load(): void {
    this.failed.set(false);
    void this.importPlayer()
      .then((module) => {
        if (!this.destroyed) this.player.set(module.VideoPlayer);
      })
      .catch((error: unknown) => {
        if (this.destroyed) return;
        // After a deploy, an open tab asks for a player chunk that no longer
        // exists, and the browser then remembers that failed import for the
        // rest of the tab: every later video failed the same way, and Retry
        // could never help. Let the app-wide recovery reload onto the new build.
        if (this.recovery.recover(error)) return;
        this.failed.set(true);
      });
  }
}
