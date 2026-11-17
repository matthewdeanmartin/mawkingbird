import { Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbField, MbControl } from '../design-system/field/field';
import { BlogPrefs } from './blog-prefs';
import { blogVerdict, bodyMarked, bodyTitle, withBodyTitle } from './blog-write';
import { CrossTarget } from './blog-cross-post';

/** Service names, not translated. */
export const CROSS_TARGET_LABELS: Record<CrossTarget, string> = {
  mataroa: 'Mataroa',
  hugo: 'Hugo',
  bsky: 'Bluesky',
};

// i18n blog.write.heading: Blog post
// i18n blog.write.title: Title
// i18n blog.write.title.hint: Becomes the first line of your first post, which is how blogs read it back. Not a content warning.
// i18n blog.write.marked: Mark it with BLOG: so it counts however short it is
// i18n blog.write.verdict.marked: Counts as a blog post: it starts with BLOG:
// i18n blog.write.verdict.storm: Counts as a blog post: a storm of {{count}} posts.
// i18n blog.write.verdict.long: Counts as a blog post: {{count}} characters.
// i18n blog.write.verdict.no: Not a blog post yet. It needs {{posts}} posts, or {{chars}} characters (now {{count}}), or the BLOG: mark.
// i18n blog.write.verdict.empty: Write something to see whether it counts as a blog post.
// i18n blog.write.view: View on your blog
// i18n blog.write.also: Also publish to
// i18n blog.write.also.hint: Copies go out once, after the Mastodon post is live, with a link back to it. They are not retried or updated later.
// i18n blog.write.cross.running: Copying to your other blogs…
// i18n blog.write.cross.ok: Copied to {{target}}.
// i18n blog.write.cross.failed: Couldn't copy to {{target}}: {{error}}

/**
 * Write's blog strip, shown in Blog mode: a title field that edits the first
 * line, the `BLOG:` marker, and a live verdict from the same classifier the
 * blog pages use. It owns no state; the body is Write's.
 */
@Component({
  selector: 'app-blog-write-panel',
  imports: [TranslocoPipe, MbField, MbControl],
  template: `
    <section class="blog-write" [attr.aria-label]="'blog.write.heading' | transloco">
      <mb-field
        [label]="'blog.write.title' | transloco"
        [hint]="'blog.write.title.hint' | transloco"
      >
        <input
          mbControl
          type="text"
          name="blog_title"
          [value]="title()"
          (input)="setTitle($any($event.target).value)"
        />
      </mb-field>
      <label class="checkline">
        <input
          type="checkbox"
          name="blog_marked"
          [checked]="marked()"
          (change)="setMarked($any($event.target).checked)"
        />
        {{ 'blog.write.marked' | transloco }}
      </label>
      <p class="verdict" [class.yes]="verdict().reason" role="status">
        @switch (verdict().reason) {
          @case ('marked') {
            {{ 'blog.write.verdict.marked' | transloco }}
          }
          @case ('storm') {
            {{ 'blog.write.verdict.storm' | transloco: { count: verdict().posts } }}
          }
          @case ('long') {
            {{ 'blog.write.verdict.long' | transloco: { count: verdict().chars } }}
          }
          @default {
            @if (verdict().posts) {
              {{
                'blog.write.verdict.no'
                  | transloco
                    : {
                        posts: prefs.thresholds().minPosts,
                        chars: prefs.thresholds().minChars,
                        count: verdict().chars,
                      }
              }}
            } @else {
              {{ 'blog.write.verdict.empty' | transloco }}
            }
          }
        }
      </p>
      @if (crossAvailable().length) {
        <fieldset class="also">
          <legend>{{ 'blog.write.also' | transloco }}</legend>
          @for (target of crossAvailable(); track target) {
            <label class="checkline">
              <input
                type="checkbox"
                [name]="'blog_cross_' + target"
                [checked]="crossChosen().includes(target)"
                (change)="toggleCross(target, $any($event.target).checked)"
              />
              {{ labels[target] }}
            </label>
          }
          <p class="hint">{{ 'blog.write.also.hint' | transloco }}</p>
        </fieldset>
      }
    </section>
  `,
  styles: `
    .blog-write {
      display: grid;
      gap: 0.5rem;
      margin: 0 0 0.75rem;
      padding: 0.75rem;
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .checkline {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    .verdict {
      margin: 0;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .also {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 1rem;
      margin: 0;
      padding: 0;
      border: none;
    }
    .also legend {
      padding: 0;
      font-weight: 600;
    }
    .hint {
      flex-basis: 100%;
      margin: 0;
      color: var(--muted);
      font-size: 0.85rem;
    }
  `,
})
export class BlogWritePanel {
  protected readonly prefs = inject(BlogPrefs);

  readonly body = input.required<string>();
  /** The body as Write will split it into posts. */
  readonly parts = input.required<string[]>();
  readonly bodyChange = output<string>();
  /** Connected blogs a copy can go to; none hides the choice. */
  readonly crossAvailable = input<readonly CrossTarget[]>([]);
  readonly crossChosen = input<readonly CrossTarget[]>([]);
  readonly crossChosenChange = output<CrossTarget[]>();
  protected readonly labels = CROSS_TARGET_LABELS;

  protected readonly title = computed(() => bodyTitle(this.body()));
  protected readonly marked = computed(() => bodyMarked(this.body()));
  protected readonly verdict = computed(() => blogVerdict(this.parts(), this.prefs.thresholds()));

  protected setTitle(value: string): void {
    this.bodyChange.emit(withBodyTitle(this.body(), value, this.marked()));
  }

  protected toggleCross(target: CrossTarget, on: boolean): void {
    const rest = this.crossChosen().filter((item) => item !== target);
    this.crossChosenChange.emit(on ? [...rest, target] : rest);
  }

  protected setMarked(on: boolean): void {
    this.bodyChange.emit(withBodyTitle(this.body(), this.title(), on));
  }
}
