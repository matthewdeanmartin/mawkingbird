import {
  Component,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FocusTrap } from '../../shell/a11y/focus-trap';
import { ImageDescriber } from '../../publishing/image-describer/image-describer';
import { SpeechReader } from '../../reading/speech/speech-reader';
import { MediaAttachment, Status } from '../../platform/api/models';
import { VideoPlayerHost as VideoPlayer } from '../../reading/video-player/video-player-host';
import { ImageActions, imageFileName } from '../media-download/image-actions';
import { TranslationRouter } from '../../translation/translation-router';
import { OpenRouterSession } from '../../connections/openrouter/openrouter-session';
import { AiAvailability } from '../../platform/build/ai-availability';
import {
  attachmentSource,
  mediaUrl,
  VideoSource,
  watchParams,
} from '../../reading/video-player/media-source';

// i18n lightbox.viewer: Image viewer
// i18n lightbox.close: Close
// i18n lightbox.previous: Previous image
// i18n lightbox.next: Next image
// i18n lightbox.describe: ✨ Describe with AI
// i18n lightbox.describing: Describing…
// i18n lightbox.aiCaption: AI description (may be wrong):
// i18n lightbox.readDescription: 🔊 Read description
// i18n lightbox.stopReading: ⏹ Stop reading
// i18n lightbox.translateDescription: 🌐 Translate description
// i18n lightbox.translatingDescription: Translating…
// i18n lightbox.hideTranslation: Show the original
// i18n lightbox.translationFailed: This description couldn't be translated.
// i18n lightbox.sameLanguage: This description is already in your language.

/**
 * How far a finger must travel to count as a swipe rather than a tap that
 * wandered. 40px is roughly a thumb's width — below it, taps to close the
 * viewer start registering as page turns.
 */
const SWIPE_MIN_PX = 40;

/**
 * A full-screen image viewer: centers the current image, dims the page behind
 * it, and lets the user page through a status's attachments like a slideshow.
 */
@Component({
  selector: 'app-lightbox',
  imports: [FocusTrap, TranslocoPipe, VideoPlayer],
  templateUrl: './lightbox.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './lightbox.css',
})
export class Lightbox {
  readonly context = input<{ status: Status; server: string } | null>(null);
  protected videoWatch(source: VideoSource, id: string): Record<string, string> | null {
    const context = this.context();
    return context ? watchParams(context.status, source, context.server, id) : null;
  }
  protected videoSource = attachmentSource;
  protected safeMediaUrl = mediaUrl;
  /** The images to page through. */
  readonly items = input.required<MediaAttachment[]>();
  /** Index of the image to show first. */
  readonly startIndex = input(0);
  /** Emitted when the viewer should close. */
  readonly closed = output<void>();

  protected index = signal(0);

  constructor() {
    // Seed the current index from the requested start once inputs are set.
    queueMicrotask(() => this.index.set(this.startIndex()));
  }

  protected current = computed(() => this.items()[this.index()] ?? null);

  protected readonly describer = inject(ImageDescriber);
  private readonly translator = inject(TranslationRouter);
  private readonly openrouter = inject(OpenRouterSession);
  private readonly ai = inject(AiAvailability);
  /** Translated descriptions by media id; asked for one image at a time. */
  protected translatedAlt = signal<Record<string, string>>({});
  protected translatingId = signal<string | null>(null);
  protected altTranslateNote = signal<{ id: string; key: string } | null>(null);

  /**
   * A post's image descriptions are translated here, one at a time and only
   * when asked, rather than sent with the post (owner, 2026-11-21). The
   * description goes alone, through the engines that translate text: never the
   * home server, which translates a whole post by its id.
   */
  protected async translateDescription(media: MediaAttachment, event: Event): Promise<void> {
    event.stopPropagation();
    const description = media.description?.trim();
    if (!description || this.translatingId()) return;
    if (this.translatedAlt()[media.id]) {
      const { [media.id]: _shown, ...rest } = this.translatedAlt();
      this.translatedAlt.set(rest);
      return;
    }
    const post = this.context()?.status;
    this.translatingId.set(media.id);
    this.altTranslateNote.set(null);
    try {
      const outcome = await this.translator.translate({
        status: altAsStatus(description, post?.language ?? null),
        mode: 'manual',
        serverCanTranslate: false,
        aiAvailable: this.ai.enabled() && this.openrouter.ready(),
      });
      if (outcome.kind === 'text') {
        this.translatedAlt.update((all) => ({ ...all, [media.id]: outcome.text }));
      } else {
        this.altTranslateNote.set({
          id: media.id,
          key: outcome.kind === 'same' ? 'lightbox.sameLanguage' : 'lightbox.translationFailed',
        });
      }
    } catch {
      this.altTranslateNote.set({ id: media.id, key: 'lightbox.translationFailed' });
    } finally {
      this.translatingId.set(null);
    }
  }
  protected readonly speech = inject(SpeechReader);
  /** AI descriptions by media id: shown for this viewing only, never saved. */
  protected aiDescriptions = signal<Record<string, string>>({});
  protected describingId = signal<string | null>(null);
  protected describeError = signal('');

  /** The author's description, or the one generated here. */
  protected spokenDescription(m: MediaAttachment): string {
    return m.description?.trim() || this.aiDescriptions()[m.id] || '';
  }

  protected async describe(m: MediaAttachment, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.describingId()) return;
    this.describingId.set(m.id);
    this.describeError.set('');
    try {
      const text = await this.describer.describe(m.url || m.preview_url);
      this.aiDescriptions.update((all) => ({ ...all, [m.id]: text }));
    } catch (error: unknown) {
      this.describeError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.describingId.set(null);
    }
  }

  protected toggleSpeech(m: MediaAttachment, event: Event): void {
    event.stopPropagation();
    const key = `media:${m.id}`;
    if (this.speech.speaking() === key) this.speech.stop();
    else this.speech.speak(key, this.spokenDescription(m));
  }

  protected isSpeaking(m: MediaAttachment): boolean {
    return this.speech.speaking() === `media:${m.id}`;
  }
  protected hasMultiple = computed(() => this.items().length > 1);

  // ---- Save / copy the image itself (parity items 6 and 10) ----
  protected readonly imageActions = inject(ImageActions);
  /** Short confirmation or failure under the image ("Image copied."). */
  protected imageNotice = signal('');
  protected imageBusy = signal(false);

  protected async copyImage(m: MediaAttachment, event: Event): Promise<void> {
    event.stopPropagation();
    await this.runImageAction(() => this.imageActions.copy(m.url || m.preview_url));
  }

  protected async saveImage(m: MediaAttachment, event: Event): Promise<void> {
    event.stopPropagation();
    const status = this.context()?.status ?? null;
    const index = Math.max(0, this.items().indexOf(m));
    await this.runImageAction(() =>
      this.imageActions.save(m.url || m.preview_url, imageFileName(status, index), m.description),
    );
  }

  private async runImageAction(action: () => Promise<string | null>): Promise<void> {
    if (this.imageBusy()) return;
    this.imageBusy.set(true);
    this.imageNotice.set('');
    try {
      this.imageNotice.set((await action()) ?? '');
    } catch (error: unknown) {
      this.imageNotice.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.imageBusy.set(false);
    }
  }

  prev(event: Event): void {
    event.stopPropagation();
    this.index.update((i) => (i - 1 + this.items().length) % this.items().length);
  }

  next(event: Event): void {
    event.stopPropagation();
    this.index.update((i) => (i + 1) % this.items().length);
  }

  close(): void {
    this.closed.emit();
  }

  /**
   * Horizontal swipe to page through images, because on a phone there was no
   * other way.
   *
   * The nav arrows are laid out in a row beside the image, and the image claims
   * `min(90vw, 1100px)`. On a narrow screen 90vw plus two 52px buttons overflows
   * the viewport, so the arrows were squeezed to nothing or pushed off-screen —
   * a reader on a phone could open a four-image post and never reach image two.
   * The CSS now overlays the arrows on small screens; this makes the gesture
   * they'd expect work regardless.
   *
   * Deliberately not a full drag-with-the-finger animation. That needs the image
   * to track the pointer and settle, which means owning transform state and
   * fighting the browser's own pan/zoom — pinch-to-zoom on a photo is worth more
   * than a rubber-band effect. This reads a completed gesture and pages.
   */
  private touchStartX: number | null = null;
  private touchStartY: number | null = null;

  onTouchStart(event: TouchEvent): void {
    if ((event.target as HTMLElement)?.closest('app-video-player, audio, video')) return;
    // Multi-touch is a pinch-zoom, not a swipe — leave it entirely alone.
    if (event.touches.length !== 1) {
      this.touchStartX = null;
      this.touchStartY = null;
      return;
    }
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
  }

  onTouchEnd(event: TouchEvent): void {
    const startX = this.touchStartX;
    const startY = this.touchStartY;
    this.touchStartX = null;
    this.touchStartY = null;
    if (startX === null || startY === null || !this.hasMultiple()) {
      return;
    }
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    // Far enough to be deliberate, and more horizontal than vertical so a scroll
    // or a downward dismiss-flick is never read as "next image".
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) {
      return;
    }
    if (dx < 0) {
      this.next(event);
    } else {
      this.prev(event);
    }
  }

  /** Close only when the backdrop itself is clicked, not the image/controls. */
  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    if (
      event.key !== 'Escape' &&
      target?.closest('app-video-player, video, audio, input, select, textarea, [contenteditable]')
    )
      return;
    if (event.key === 'Escape') {
      this.close();
    } else if (event.key === 'ArrowRight' && this.hasMultiple()) {
      this.next(event);
    } else if (event.key === 'ArrowLeft' && this.hasMultiple()) {
      this.prev(event);
    }
  }
}

/** One image description as a bare post, so the text engines can take it. */
function altAsStatus(description: string, language: string | null): Status {
  const escaped = description.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const status: Status = {
    id: 'alt',
    created_at: new Date(0).toISOString(),
    edited_at: null,
    quote: null,
    quote_approval_policy: null,
    content: `<p>${escaped}</p>`,
    spoiler_text: '',
    visibility: 'public',
    url: '',
    account: {
      id: 'alt',
      username: '',
      acct: '',
      display_name: '',
      note: '',
      url: '',
      avatar: '',
      avatar_static: '',
      header: '',
      followers_count: 0,
      following_count: 0,
      statuses_count: 0,
      bot: false,
      locked: false,
      fields: [],
    },
    reblog: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    media_attachments: [],
    language,
  };
  return status;
}
