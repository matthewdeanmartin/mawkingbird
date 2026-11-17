import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { MbField, MbControl } from '../design-system/field/field';
import { MbPageHeader } from '../design-system/page-header/page-header';
import { BlogPrefs } from './blog-prefs';
import { BlogSource, parseBlogHandle } from './blog-source';

// i18n blog.landing.title: Blog
// i18n blog.landing.description: Mastodon, read as blogs. Storms and long posts are the blog posts; replies are the comments.
// i18n blog.landing.mine: My blog
// i18n blog.landing.write: Write a post
// i18n blog.landing.open: Open a blog
// i18n blog.landing.handle: Handle
// i18n blog.landing.handle.hint: The full handle, like @alice@example.social.
// i18n blog.landing.go: Open
// i18n blog.landing.invalid: Use the full handle, with the server: @alice@example.social.
// i18n blog.landing.rule: A blog post is a storm of {{posts}} or more posts, a post of {{chars}} or more characters, or any post starting with BLOG:
// i18n blog.landing.change: Change what counts

/**
 * Blog mode's front door: what it is, your own blog, and opening anyone's.
 * The mode switcher lands here, so it must make sense to someone who has never
 * heard of the idea and has no account.
 */
@Component({
  selector: 'app-blog-landing',
  imports: [RouterLink, TranslocoPipe, MbButton, MbField, MbControl, MbPageHeader],
  template: `
    <mb-page-header
      [title]="'blog.landing.title' | transloco"
      [description]="'blog.landing.description' | transloco"
    />

    @if (mine()) {
      <p class="actions">
        <a mbButton routerLink="/blog/me">{{ 'blog.landing.mine' | transloco }}</a>
        <a mbButton variant="outline" routerLink="/write">{{ 'blog.landing.write' | transloco }}</a>
      </p>
    }

    <form class="open" (submit)="open($event)">
      <h2>{{ 'blog.landing.open' | transloco }}</h2>
      <mb-field
        [label]="'blog.landing.handle' | transloco"
        [hint]="'blog.landing.handle.hint' | transloco"
        [error]="invalid() ? ('blog.landing.invalid' | transloco) : ''"
      >
        <input
          mbControl
          type="text"
          name="blog_handle"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="@alice@example.social"
          [value]="handle()"
          (input)="edit($any($event.target).value)"
        />
      </mb-field>
      <button mbButton type="submit">{{ 'blog.landing.go' | transloco }}</button>
    </form>

    <p class="rule">
      {{
        'blog.landing.rule'
          | transloco: { posts: prefs.thresholds().minPosts, chars: prefs.thresholds().minChars }
      }}
      <a routerLink="/settings/blog">{{ 'blog.landing.change' | transloco }}</a>
    </p>
  `,
  styles: `
    :host {
      display: block;
      max-width: 44rem;
      margin: 0 auto;
      padding: 1rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .open {
      display: grid;
      gap: 0.5rem;
      justify-items: start;
      margin: 1.5rem 0;
    }
    .open h2 {
      margin: 0;
      font-size: 1.1rem;
    }
    .open mb-field {
      width: 100%;
    }
    .rule {
      color: var(--muted);
    }
  `,
})
export class BlogLanding {
  private readonly router = inject(Router);
  private readonly source = inject(BlogSource);
  protected readonly prefs = inject(BlogPrefs);

  protected readonly handle = signal('');
  protected readonly invalid = signal(false);
  protected readonly mine = computed(() => this.source.ownHandle() !== null);

  protected edit(value: string): void {
    this.handle.set(value);
    this.invalid.set(false);
  }

  protected open(event: Event): void {
    event.preventDefault();
    const parsed = parseBlogHandle(this.handle());
    if (!parsed) {
      this.invalid.set(true);
      return;
    }
    void this.router.navigate(['/blog', `@${parsed.user}@${parsed.host}`]);
  }
}
