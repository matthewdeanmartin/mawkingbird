import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

// i18n pages.algo.views.label: Algo views
// i18n pages.algo.views.goodStuff: Good Stuff
// i18n pages.algo.views.relationships: Relationships

/** Route tabs use the same compact treatment as the shared tab widget. */
@Component({
  selector: 'app-algo-view-tabs',
  imports: [RouterLink, TranslocoPipe],
  template: `
    <nav class="tabs" [attr.aria-label]="'pages.algo.views.label' | transloco">
      <a routerLink="/algo" [attr.aria-current]="view() === 'goodStuff' ? 'page' : null">
        {{ 'pages.algo.views.goodStuff' | transloco }}
      </a>
      <a routerLink="/algo/people" [attr.aria-current]="view() === 'relationships' ? 'page' : null">
        {{ 'pages.algo.views.relationships' | transloco }}
      </a>
    </nav>
  `,
  styles: `
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
    }
    a {
      flex: 1 1 auto;
      padding: 10px 14px;
      border-bottom: 3px solid transparent;
      color: var(--text);
      font: 600 14px / 1.4 var(--app-font-family);
      text-align: center;
      text-decoration: none;
    }
    a:hover {
      background: var(--hover);
    }
    a[aria-current='page'] {
      border-bottom-color: var(--text);
      background: var(--accent-soft);
    }
    a:focus-visible {
      outline: 2px solid var(--text);
      outline-offset: -3px;
    }
  `,
})
export class AlgoViewTabs {
  readonly view = input.required<'goodStuff' | 'relationships'>();
}
