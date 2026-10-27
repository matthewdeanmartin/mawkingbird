import type { ExternalPlayer } from '../../audio-embeds/external-player';
import { MbToolbar, MbToolbarButton } from '../../design-system/toolbar/toolbar';
import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, inject, OnDestroy, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { ReadingZen } from '../../reading-zen';
import { RadioPlayer } from './radio-player';
import { RadioIcon } from './radio-icon';

// i18n radio.play: Play
// i18n radio.pause: Pause
// i18n radio.previous: Previous track
// i18n radio.next: Next track
// i18n radio.stop: Stop Radio
// i18n radio.position: Track {{current}} of {{total}}
// i18n radio.seek: Playback position
// i18n radio.volume: Volume
// i18n radio.reveal: Reveal and play
// i18n radio.hidden: This post has a content warning or sensitive audio.
// i18n radio.blocked: Playback stopped. Press Play to retry, or choose Next to skip this track.
// i18n radio.skipped: Unavailable tracks skipped: {{count}}
// i18n radio.waiting: Waiting for audio…
// i18n radio.openPlayer: Open Radio player
// i18n radio.post: Open post
// i18n radio.fullscreen: Full screen
// i18n radio.exitFullscreen: Exit full screen
// i18n radio.queue: Audio queue
// i18n radio.playTrack: Play track {{number}}, {{title}}, by {{author}}
// i18n radio.playPost: Play audio by {{author}}

@Component({
  selector: 'app-radio-controls',
  imports: [
    MbToolbar,
    MbToolbarButton,
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbField,
    MbControl,
    RadioIcon,
  ],
  templateUrl: './radio-controls.html',
  styleUrl: './radio-controls.css',
  host: { '[class.fullscreen]': 'fullscreen()', '(document:fullscreenchange)': 'syncFullscreen()' },
})
export class RadioControls implements OnDestroy {
  readonly player = inject(RadioPlayer);
  readonly externalPlayer = input<ExternalPlayer>();
  /** Reopens a closed frame for an allowed provider. */
  loadExternal(): void {
    this.externalPlayer()?.activated.set(true);
  }
  readonly fullscreen = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly zen = inject(ReadingZen);
  private release?: () => void;

  clock(seconds: number): string {
    const value = Math.max(0, Math.floor(seconds));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  }
  async toggleFullscreen(): Promise<void> {
    if (this.fullscreen()) {
      if (this.document.fullscreenElement === this.host.nativeElement)
        await this.document.exitFullscreen();
      this.setFullscreen(false);
    } else {
      this.setFullscreen(true);
      try {
        await this.host.nativeElement.requestFullscreen?.();
      } catch {
        /* Viewport fallback. */
      }
    }
  }
  syncFullscreen(): void {
    this.setFullscreen(this.document.fullscreenElement === this.host.nativeElement);
  }
  private setFullscreen(value: boolean): void {
    this.fullscreen.set(value);
    if (value) this.release ??= this.zen.hold('full');
    else {
      this.release?.();
      this.release = undefined;
    }
  }
  key(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.fullscreen()) {
      void this.toggleFullscreen();
      event.preventDefault();
      return;
    }
    if ((event.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    if (event.key === ' ') this.player.toggle();
    else if (event.key === 'ArrowLeft') this.player.previous();
    else if (event.key === 'ArrowRight') this.player.next();
    else if (event.key === 'Home') this.player.select(0);
    else if (event.key === 'End') this.player.select(this.player.queue().length - 1);
    else return;
    event.preventDefault();
  }
  ngOnDestroy(): void {
    this.release?.();
    if (this.document.fullscreenElement === this.host.nativeElement)
      void this.document.exitFullscreen().catch(() => undefined);
  }
}
