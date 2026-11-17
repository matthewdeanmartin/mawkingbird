import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbField, MbControl } from '../design-system/field/field';
import { BlogPrefs } from './blog-prefs';
import { blogVerdict, bodyMarked, bodyTitle, withBodyTitle } from './blog-write';

// i18n blog.write.heading: Blog post
// i18n blog.write.title: Title
// i18n blog.write.title.hint: Becomes the first line of your first post, which is how blogs read it back. Not a content warning.
// i18n blog.write.marked: Mark it with BLOG: so it counts however short it is
// i18n blog.write.verdict.marked: Counts as a blog post: it starts with BLOG:
// i18n blog.write.verdict.storm: Counts as a blog post: a storm of {{count}} posts.
// i18n blog.write.verdict.long: Counts as a blog post: {{count}} characters.
// i18n blog.write.verdict.no: Not a blog post yet. It needs {{posts}} posts, or {{chars}} characters (now {{count}}), or the BLOG: mark.
// i18n blog.write.verdict.empty: Write something to see whether it counts as a blog post.
// i18n blog.write.rules: What counts
// i18n blog.write.view: View on your blog

/**
 * Write's blog strip, shown in Blog mode: a title field that edits the first
 * line, the `BLOG:` marker, and a live verdict from the same classifier the
 * blog pages use. It owns no state; the body is Write's.
 */
@Component({
  selector: 'app-blog-write-panel',
  imports: [RouterLink, TranslocoPipe, MbField, MbControl],
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
        <a routerLink="/settings/blog">{{ 'blog.write.rules' | transloco }}</a>
      </p>
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
    .verdict a {
      margin-left: 0.35rem;
    }
  `,
})
export class BlogWritePanel {
  protected readonly prefs = inject(BlogPrefs);

  readonly body = input.required<string>();
  /** The body as Write will split it into posts. */
  readonly parts = input.required<string[]>();
  readonly bodyChange = output<string>();

  protected readonly title = computed(() => bodyTitle(this.body()));
  protected readonly marked = computed(() => bodyMarked(this.body()));
  protected readonly verdict = computed(() => blogVerdict(this.parts(), this.prefs.thresholds()));

  protected setTitle(value: string): void {
    this.bodyChange.emit(withBodyTitle(this.body(), value, this.marked()));
  }

  protected setMarked(on: boolean): void {
    this.bodyChange.emit(withBodyTitle(this.body(), this.title(), on));
  }
}
