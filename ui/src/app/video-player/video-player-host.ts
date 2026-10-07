import { Component, computed, inject, input, signal, DestroyRef } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { VideoSource } from './media-source';
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

  protected load(): void {
    this.failed.set(false);
    void import('./video-player')
      .then((module) => {
        if (!this.destroyed) this.player.set(module.VideoPlayer);
      })
      .catch(() => {
        if (!this.destroyed) this.failed.set(true);
      });
  }
}
