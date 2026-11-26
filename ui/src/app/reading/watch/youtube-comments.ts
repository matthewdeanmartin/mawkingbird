import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { MbButton } from '../../design-system/button/button';
import { YoutubeFeeds } from '../videos/youtube-feeds';
import {
  KeywordFilter,
  keywordFilterAction,
  YoutubeComment,
  YoutubeCommentPage,
} from '../videos/youtube-details';

// i18n watch.youtube.note: Comments from YouTube, read-only. Replying and liking happen on YouTube.
// i18n watch.youtube.loading: Loading YouTube comments…
// i18n watch.youtube.failed: YouTube didn't return comments for this video.
// i18n watch.youtube.retry: Try again
// i18n watch.youtube.empty: No comments on YouTube.
// i18n watch.youtube.more: More comments
// i18n watch.youtube.creator: Creator
// i18n watch.youtube.likes: 👍 {{count}}
// i18n watch.youtube.replies: {{count}} replies on YouTube
// i18n watch.youtube.filtered: Hidden by one of your filters.
// i18n watch.youtube.show: Show
// i18n watch.youtube.quote: Quote in a post

/**
 * Top YouTube comments for one video, read-only (spec/youtube-client.md, S2).
 * Anonymous reads through Native's YouTube transport; text is plain and
 * interpolated, never HTML. The reader's Mastodon keyword filters (thread
 * context) still apply: `hide` drops a comment, `warn` folds it.
 */
@Component({
  selector: 'app-youtube-comments',
  imports: [TranslocoPipe, MbButton],
  template: `
    <p class="note muted">{{ 'watch.youtube.note' | transloco }}</p>
    @if (loading() && !comments().length) {
      <p role="status" class="muted">{{ 'watch.youtube.loading' | transloco }}</p>
    } @else if (failed()) {
      <p role="alert">
        {{ 'watch.youtube.failed' | transloco }}
        <button mbButton type="button" size="small" variant="outline" (click)="load()">
          {{ 'watch.youtube.retry' | transloco }}
        </button>
      </p>
    } @else if (!shown().length) {
      <p class="muted">{{ 'watch.youtube.empty' | transloco }}</p>
    }
    <ol class="comments" aria-live="polite">
      @for (item of shown(); track item.comment.id) {
        <li>
          <p class="byline">
            <strong>{{ item.comment.author }}</strong>
            @if (item.comment.byCreator) {
              <span class="badge">{{ 'watch.youtube.creator' | transloco }}</span>
            }
            <span class="muted">{{ item.comment.published }}</span>
          </p>
          @if (item.folded && !revealed().has(item.comment.id)) {
            <p class="muted">
              {{ 'watch.youtube.filtered' | transloco }}
              <button
                mbButton
                type="button"
                size="small"
                variant="link"
                (click)="reveal(item.comment.id)"
              >
                {{ 'watch.youtube.show' | transloco }}
              </button>
            </p>
          } @else {
            <p class="text">{{ item.comment.text }}</p>
            <p class="meta muted">
              @if (item.comment.likes) {
                <span>{{ 'watch.youtube.likes' | transloco: { count: item.comment.likes } }}</span>
              }
              @if (item.comment.replies) {
                <span>{{
                  'watch.youtube.replies' | transloco: { count: item.comment.replies }
                }}</span>
              }
              <button
                mbButton
                type="button"
                size="small"
                variant="link"
                (click)="quoted.emit(item.comment)"
              >
                {{ 'watch.youtube.quote' | transloco }}
              </button>
            </p>
          }
        </li>
      }
    </ol>
    @if (next() && !failed()) {
      <button
        mbButton
        type="button"
        size="small"
        variant="outline"
        [disabled]="loading()"
        (click)="more()"
      >
        {{ 'watch.youtube.more' | transloco }}
      </button>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: block;
    }
    .note {
      margin: 0 0 8px;
    }
    .comments {
      list-style: none;
      margin: 0 0 8px;
      padding: 0;
    }
    li {
      border-top: 1px solid var(--border);
      padding: 8px 0;
    }
    .byline,
    .meta {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0;
    }
    .text {
      margin: 4px 0;
      overflow-wrap: anywhere;
      white-space: pre-line;
    }
    .badge {
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 0.8em;
      padding: 0 4px;
    }
    .muted {
      color: var(--muted);
    }
  `,
})
export class YoutubeComments {
  readonly videoId = input.required<string>();
  /** A comment the reader wants to quote in a post of their own. */
  readonly quoted = output<YoutubeComment>();

  private readonly youtube = inject(YoutubeFeeds);
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);

  protected readonly comments = signal<YoutubeComment[]>([]);
  protected readonly next = signal<YoutubeCommentPage['more']>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly revealed = signal<ReadonlySet<string>>(new Set());
  private readonly filters = signal<readonly KeywordFilter[]>([]);
  private generation = 0;

  protected readonly shown = computed(() =>
    this.comments().flatMap((comment) => {
      const action = keywordFilterAction(comment.text, this.filters());
      return action === 'hide' ? [] : [{ comment, folded: action === 'warn' }];
    }),
  );

  constructor() {
    effect(() => {
      this.videoId();
      untracked(() => this.load());
    });
    if (this.auth.kind() === 'mastodon' && !this.auth.isAnonymous) {
      // Filters are a nicety here: without them the comments still show.
      firstValueFrom(this.api.filters())
        .then((filters) => this.filters.set(filters))
        .catch(() => undefined);
    }
  }

  protected async load(): Promise<void> {
    const generation = ++this.generation;
    this.comments.set([]);
    this.next.set(null);
    this.revealed.set(new Set());
    await this.take(generation, () => this.youtube.comments(this.videoId()));
  }

  protected async more(): Promise<void> {
    const next = this.next();
    if (next) await this.take(this.generation, next);
  }

  protected reveal(id: string): void {
    this.revealed.update((ids) => new Set([...ids, id]));
  }

  private async take(generation: number, page: () => Promise<YoutubeCommentPage>): Promise<void> {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const result = await page();
      if (generation !== this.generation) return;
      const seen = new Set(this.comments().map((comment) => comment.id));
      this.comments.update((held) => [
        ...held,
        ...result.comments.filter((comment) => !seen.has(comment.id)),
      ]);
      this.next.set(result.more);
    } catch {
      if (generation === this.generation) this.failed.set(true);
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
}
