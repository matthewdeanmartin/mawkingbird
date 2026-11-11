import { DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { CustomEmojiPipe } from '../../publishing/custom-emoji.pipe';
import { Status } from '../../platform/api/models';
import { ReadingZen } from '../../reading/reading-zen';
import { TrustedAccounts } from '../trusted-accounts';
import { FollowTrust } from '../follow-trust';

// i18n pages.profile.bot: Bot
// i18n pages.profile.slideshow.open: View as Slide Show
// i18n pages.profile.slideshow.start: Start
// i18n pages.profile.slideshow.prev: Previous
// i18n pages.profile.slideshow.stop: Stop
// i18n pages.profile.slideshow.next: Next
// i18n pages.profile.slideshow.last: Last
// i18n pages.profile.slideshow.slower: Slower
// i18n pages.profile.slideshow.faster: Faster
// i18n pages.profile.slideshow.speed: Speed: {{seconds}} seconds
// i18n pages.profile.slideshow.fullscreen: Full screen
// i18n pages.profile.slideshow.exitFullscreen: Exit full screen
// i18n pages.profile.slideshow.close: Back to profile
// i18n pages.profile.slideshow.older: Load older posts
// i18n pages.profile.slideshow.loading: Loading posts…
// i18n pages.profile.slideshow.empty: No posts to show.
// i18n pages.profile.slideshow.position: {{current}} / {{total}} loaded posts · oldest to newest · loops
// i18n pages.profile.slideshow.reveal: Show content
// i18n pages.profile.slideshow.copyLink: Copy link
// i18n pages.profile.slideshow.copied: Link copied
// i18n pages.profile.slideshow.latest: {{current}} / {{total}} latest posts · oldest to newest · loops

/** Bounds for a slide's duration, in seconds, from the buttons or a deep link. */
export const SLIDESHOW_MIN_SECONDS = 0.5;
export const SLIDESHOW_MAX_SECONDS = 30;
/** Most posts a `?posts=` deep link may ask for; each 40 costs one timeline page. */
export const SLIDESHOW_MAX_POSTS = 200;

/** What a slide-show deep link asks for. Null fields keep the defaults. */
export interface SlideshowOptions {
  /** Show only the newest N posts, oldest to newest, looping. */
  posts: number | null;
  /** Seconds per slide. */
  seconds: number | null;
}

/**
 * Read `?slideshow=1&posts=10&speed=3` from a profile URL. Null when the link
 * does not ask for a slide show. Out-of-range numbers are clamped and
 * nonsense ones ignored, so a hand-edited link still opens something sensible.
 */
export function slideshowOptionsFrom(params: {
  get(name: string): string | null;
}): SlideshowOptions | null {
  const flag = params.get('slideshow');
  if (flag === null || flag === '0' || flag === 'false') return null;
  const posts = Number.parseInt(params.get('posts') ?? '', 10);
  const seconds = Number.parseFloat(params.get('speed') ?? '');
  return {
    posts: posts > 0 ? Math.min(posts, SLIDESHOW_MAX_POSTS) : null,
    seconds:
      seconds > 0
        ? Math.min(SLIDESHOW_MAX_SECONDS, Math.max(SLIDESHOW_MIN_SECONDS, seconds))
        : null,
  };
}

/** The query string that reopens a slide show as it is now set up. */
export function slideshowQuery(options: SlideshowOptions): string {
  const query = new URLSearchParams({ slideshow: '1' });
  if (options.posts) query.set('posts', String(options.posts));
  if (options.seconds) query.set('speed', String(options.seconds));
  return query.toString();
}

@Component({
  selector: 'app-profile-slideshow',
  imports: [TranslocoPipe, MbButton, CustomEmojiPipe],
  templateUrl: './profile-slideshow.html',
  styleUrl: './profile-slideshow.css',
  host: {
    '[class.fullscreen]': 'fullscreen()',
    '(document:fullscreenchange)': 'syncFullscreen()',
    '(document:keydown)': 'key($event)',
  },
})
export class ProfileSlideshow implements OnDestroy {
  readonly statuses = input.required<Status[]>();
  readonly loading = input(false);
  readonly exhausted = input(false);
  /** From a deep link: only the newest N posts, and a starting speed. */
  readonly options = input<SlideshowOptions | null>(null);
  readonly loadOlder = output<void>();
  readonly closed = output<void>();
  /** Every loaded original post, oldest first. */
  private readonly loaded = computed(() =>
    [
      ...new Map(
        this.statuses()
          .filter((s) => !s.reblog)
          .map((s) => [s.id, s]),
      ).values(),
    ].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
  );
  readonly limit = computed(() => this.options()?.posts ?? null);
  /** What is shown: all loaded posts, or the newest `limit` of them. */
  readonly slides = computed(() => {
    const limit = this.limit();
    return limit ? this.loaded().slice(-limit) : this.loaded();
  });
  readonly selected = signal<string | null>(null);
  readonly index = computed(() =>
    Math.max(
      0,
      this.slides().findIndex((s) => s.id === this.selected()),
    ),
  );
  readonly current = computed(() => this.slides()[this.index()]);
  // Emoji scenes use explicit rows; wrapping a row would scramble the animation.
  readonly emojiArt = computed(() => {
    const html = this.current()?.content ?? '';
    return (
      /<br\s*\/?\s*>/i.test(html) && (html.match(/\p{Extended_Pictographic}/gu)?.length ?? 0) >= 12
    );
  });
  readonly playing = signal(true);
  readonly seconds = linkedSignal(() => this.options()?.seconds ?? 2.5);
  readonly copied = signal(false);
  readonly fullscreen = signal(false);
  readonly revealed = signal<string | null>(null);
  private readonly trusted = inject(TrustedAccounts);
  private readonly followTrust = inject(FollowTrust);
  readonly contentHidden = computed(() => {
    const post = this.current();
    if (!post || this.revealed() === post.id) return false;
    this.followTrust.revision();
    // Match StatusCard: an expanded CW already reveals the whole post;
    // the separate sensitive-media preference applies when there is no CW.
    return post.spoiler_text
      ? !this.trusted.cwExpanded(post.account)
      : !!post.sensitive && !this.trusted.sensitiveShown(post.account);
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly zen = inject(ReadingZen);
  private readonly release = this.zen.hold();
  private releaseFull?: () => void;
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private resize?: ResizeObserver;
  private frame = 0;

  constructor() {
    // A deep link for the newest N posts must not loop over fewer just because
    // the first timeline page was short: page back until there are N, or none left.
    effect(() => {
      const limit = this.limit();
      if (limit && this.loaded().length < limit && !this.exhausted() && !this.loading()) {
        this.loadOlder.emit();
      }
    });
    effect((cleanup) => {
      const delay = this.seconds() * 1000;
      if (!this.playing() || this.loading() || this.slides().length < 2) return;
      const timer = setInterval(() => this.move(1), delay);
      cleanup(() => clearInterval(timer));
    });
    effect(() => {
      this.current();
      this.revealed();
      this.contentHidden();
      this.fullscreen();
      const viewport = this.viewport()?.nativeElement;
      this.resize?.disconnect();
      if (viewport && typeof ResizeObserver !== 'undefined') {
        this.resize = new ResizeObserver(() => this.fit());
        this.resize.observe(viewport);
      }
      this.fit();
    });
  }

  start(): void {
    this.selected.set(this.slides()[0]?.id ?? null);
    this.playing.set(true);
  }
  move(delta: number): void {
    const slides = this.slides();
    if (slides.length)
      this.selected.set(slides[(this.index() + delta + slides.length) % slides.length].id);
  }
  step(delta: number): void {
    this.playing.set(false);
    this.move(delta);
  }
  last(): void {
    this.playing.set(false);
    this.selected.set(this.slides().at(-1)?.id ?? null);
  }
  speed(delta: number): void {
    this.seconds.update((s) =>
      Math.max(SLIDESHOW_MIN_SECONDS, Math.min(SLIDESHOW_MAX_SECONDS, s + delta)),
    );
  }
  /** This profile's URL, set to reopen the slide show with the current post count and speed. */
  deepLink(): string {
    const url = new URL(this.document.location.href);
    url.search = slideshowQuery({ posts: this.limit(), seconds: this.seconds() });
    url.hash = '';
    return url.toString();
  }
  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.deepLink());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      /* Clipboard refused (insecure context, permissions): nothing to recover. */
    }
  }
  older(): void {
    this.playing.set(false);
    this.loadOlder.emit();
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
        /* Keep the viewport-filling Zen fallback. */
      }
    }
  }
  syncFullscreen(): void {
    this.setFullscreen(this.document.fullscreenElement === this.host.nativeElement);
  }
  private setFullscreen(value: boolean): void {
    this.fullscreen.set(value);
    if (value) this.releaseFull ??= this.zen.hold('full');
    else {
      this.releaseFull?.();
      this.releaseFull = undefined;
    }
  }
  key(event: KeyboardEvent): void {
    if (
      (event.target as HTMLElement)?.closest('button, a, input, textarea, select') &&
      event.key !== 'Escape'
    )
      return;
    if (event.key === 'ArrowRight') this.step(1);
    else if (event.key === 'ArrowLeft') this.step(-1);
    else if (event.key === 'Home') this.start();
    else if (event.key === 'End') this.last();
    else if (event.key === ' ') this.playing.update((value) => !value);
    else if (event.key === 'Escape') {
      if (this.fullscreen()) void this.toggleFullscreen();
      else this.closed.emit();
    } else return;
    event.preventDefault();
  }
  fit(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const viewport = this.viewport()?.nativeElement;
      const content = this.content()?.nativeElement;
      if (!viewport || !content) return;
      let size = this.fullscreen() ? 96 : 56;
      content.style.fontSize = `${size}px`;
      while (
        size > 16 &&
        (content.scrollWidth > viewport.clientWidth || content.scrollHeight > viewport.clientHeight)
      ) {
        size -= 2;
        content.style.fontSize = `${size}px`;
      }
    });
  }
  ngOnDestroy(): void {
    this.resize?.disconnect();
    cancelAnimationFrame(this.frame);
    this.release();
    this.releaseFull?.();
    if (this.document.fullscreenElement === this.host.nativeElement)
      void this.document.exitFullscreen().catch(() => undefined);
  }
}
