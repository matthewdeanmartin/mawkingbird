import { Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';

// i18n lite.feed.newPosts: New posts: {{count}} ↑
// i18n lite.feed.gap: Some posts between here and below weren't loaded.

/**
 * "New posts: 3 ↑". Newer posts found by a refresh wait here instead of
 * pushing down the post being read; pressing it puts them on top and scrolls
 * there. Sticks just under Lite's top bar.
 */
@Component({
  selector: 'app-lite-new-pill',
  imports: [MbButton, TranslocoPipe],
  template: `
    @if (count() > 0) {
      <div class="pill-row">
        <button mbButton size="small" type="button" (click)="show.emit()">
          {{ 'lite.feed.newPosts' | transloco: { count: count() } }}
        </button>
      </div>
    }
  `,
  styles: `
    .pill-row {
      position: sticky;
      top: 52px;
      z-index: 5;
      display: flex;
      justify-content: center;
      padding: 6px 0;
      pointer-events: none;
    }
    .pill-row button {
      pointer-events: auto;
    }
  `,
})
export class LiteNewPill {
  readonly count = input(0);
  readonly show = output<void>();
}
