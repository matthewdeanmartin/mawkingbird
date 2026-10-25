import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { Playback } from '../video-player/playback';
import { ExternalMedia } from './providers';
import { connectWidget, WidgetController, WidgetState } from './widget-api';

// i18n external.load: Load {{provider}} player
// i18n external.notice: Loading connects to {{provider}}. Press Play in the player to listen. Some services offer previews or require a subscription.
// i18n external.open: Open on {{provider}}
// i18n external.close: Close player
// i18n external.failed: This player could not be loaded or controlled. Close it and try again, or open the original link.
// i18n external.radio: Listen in Radio
// i18n external.unresolved: A player could not be resolved from this link. Open the original to listen.

@Component({
  selector: 'app-external-player-controls',
  imports: [TranslocoPipe, MbButton],
  template: `
    @if (!activated()) {
      <button mbButton variant="outline" type="button" (click)="activated.set(true)">
        {{ 'external.load' | transloco: { provider: source().label } }}
      </button>
    } @else {
      <iframe
        #frame
        [src]="safeSource()"
        [title]="source().label"
        [style.height.px]="source().height"
        allow="autoplay; encrypted-media; fullscreen"
        referrerpolicy="strict-origin-when-cross-origin"
        (error)="failed.set(true)"
      ></iframe>
      <button mbButton size="small" variant="outline" type="button" (click)="close()">
        {{ 'external.close' | transloco }}
      </button>
    }
    <p>{{ 'external.notice' | transloco: { provider: source().label } }}</p>
    @if (failed()) {
      <p role="alert">{{ 'external.failed' | transloco }}</p>
    }
    <a [href]="source().url" target="_blank" rel="noopener noreferrer">{{
      'external.open' | transloco: { provider: source().label }
    }}</a>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    iframe {
      display: block;
      border: 0;
      width: 100%;
    }
    p {
      margin-block: 8px;
    }
  `,
  host: { '(click)': '$event.stopPropagation()' },
})
export class ExternalPlayer {
  readonly source = input.required<ExternalMedia>();
  readonly activate = input(false);
  readonly managed = input(false);
  readonly ready = output<WidgetController>();
  readonly state = output<WidgetState>();
  readonly closed = output<void>();
  readonly activated = linkedSignal({
    source: () => ({ key: this.source().key, activate: this.activate() }),
    computation: ({ key, activate }, previous) =>
      previous?.source.key === key && previous.source.activate === activate
        ? previous.value
        : activate,
  });
  readonly failed = signal(false);
  private readonly sanitizer = inject(DomSanitizer);
  // Appending feed pages recreates equivalent descriptors. Keep the iframe URL
  // and its controller stable while the current recording remains unchanged.
  private readonly playbackSource = computed(() => this.source(), {
    equal: (a, b) =>
      a.key === b.key &&
      a.embed === b.embed &&
      a.provider === b.provider &&
      a.controllable === b.controllable,
  });
  readonly safeSource = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.playbackSource().embed!),
  );
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly playback = inject(Playback);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private controller?: WidgetController;
  private unregister?: () => void;
  private observer?: IntersectionObserver;
  constructor() {
    const nativeStarted = (event: Event) => {
      if (
        !this.managed() &&
        this.activated() &&
        (event.target as Element)?.matches?.('audio, video')
      ) {
        if (this.controller) this.controller.pause();
        else this.close();
      }
    };
    document.addEventListener('play', nativeStarted, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('play', nativeStarted, true));
    effect((onCleanup) => {
      const frame = this.frame()?.nativeElement;
      const source = this.playbackSource();
      const managed = this.managed();
      this.failed.set(false);
      if (!frame) return;
      let alive = true;
      const handle = {
        pause: () => {
          if (this.controller) this.controller.pause();
          else if (!managed) this.close();
        },
        position: () => ({ time: 0, volume: 1, muted: false, rate: 1 }),
      };
      if (!managed) {
        // Opaque widgets cannot report Play. Stop other players before loading,
        // and unload this frame when another registered player starts.
        this.playback.stopAll();
        document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => {
          if (!media.paused) media.pause();
        });
        this.unregister = this.playback.register(handle);
      }
      if (source.controllable)
        void connectWidget(source.provider, frame, (state) => {
          if (!alive) return;
          if (state.playing && !managed) {
            this.playback.started(handle);
            document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => {
              if (!media.paused) media.pause();
            });
          }
          if (state.error) this.failed.set(true);
          this.state.emit(state);
        })
          .then((controller) => {
            if (!alive) {
              controller.destroy();
              return;
            }
            this.controller = controller;
            this.ready.emit(controller);
          })
          .catch(() => {
            if (alive) {
              this.failed.set(true);
              this.state.emit({ error: true });
            }
          });
      onCleanup(() => {
        alive = false;
        this.unregister?.();
        this.unregister = undefined;
        this.controller?.destroy();
        this.controller = undefined;
      });
    });
    afterNextRender(() => {
      if (typeof IntersectionObserver !== 'undefined') {
        this.observer = new IntersectionObserver((entries) => {
          if (!this.managed() && entries.some((e) => !e.isIntersecting) && this.activated())
            this.close();
        });
        this.observer.observe(this.element.nativeElement);
      }
    });
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }
  close(): void {
    this.activated.set(false);
    this.closed.emit();
  }
}
