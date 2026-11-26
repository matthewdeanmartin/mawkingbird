import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';

// i18n blog.settingsLink: Blog settings
// Shared by the blog list, post page and Roll.
// i18n blog.meta.posts: {{count}} posts
// i18n blog.meta.minutes: {{count}} min read
// i18n blog.untitled: Untitled
// i18n blog.more: Look further back

/** The gear: Settings › Blog. */
@Component({
  selector: 'app-blog-settings-link',
  imports: [RouterLink, TranslocoPipe, MbButton],
  template: `
    <a
      mbButton
      variant="outline"
      size="small"
      routerLink="/settings/blog"
      [attr.aria-label]="'blog.settingsLink' | transloco"
      [title]="'blog.settingsLink' | transloco"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
        <path
          d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8"
        />
      </svg>
    </a>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    svg {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linejoin: round;
      display: block;
    }
  `,
})
export class BlogSettingsLink {}

/**
 * A Blog page's title row: the heading, the page's own actions, and the
 * settings shortcut every Blog page carries, as Radio's do. What counts as a
 * blog post is a setting, not something to explain on every page.
 */
@Component({
  selector: 'app-blog-header',
  imports: [BlogSettingsLink],
  template: `
    <header class="blog-header">
      <h1>{{ heading() }}</h1>
      <div class="blog-header-actions">
        <ng-content />
        <app-blog-settings-link />
      </div>
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    :host {
      display: block;
    }
    .blog-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 16px;
    }
    h1 {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .blog-header-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
  `,
})
export class BlogHeader {
  readonly heading = input.required<string>();
}
