import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DiscoveryWindow } from './discovery-window';
import { isDiscoveryPath, minutesLeft } from './discovery-window-model';

// i18n wellness.discovery.banner.left: Discovery open · {{count}} min left
// i18n wellness.discovery.banner.today: Discovery open until 4am
// i18n wellness.discovery.banner.closed: Your discovery window has closed. Finish what you're reading; it stays closed from your next page.
// i18n wellness.discovery.banner.close: Close now

/**
 * A quiet line above a discovery page while windows are in use: how long is
 * left, or that the window has ended. Ending never removes the page you are
 * on: the guard applies from your next navigation.
 */
@Component({
  selector: 'app-discovery-banner',
  imports: [TranslocoPipe],
  template: `
    @if (shown()) {
      <div class="banner" role="status">
        @if (window.running()) {
          <span>
            @if (left() > 60) {
              {{ 'wellness.discovery.banner.today' | transloco }}
            } @else {
              {{ 'wellness.discovery.banner.left' | transloco: { count: left() } }}
            }
          </span>
          <button type="button" class="link" (click)="window.close()">
            {{ 'wellness.discovery.banner.close' | transloco }}
          </button>
        } @else {
          <span>{{ 'wellness.discovery.banner.closed' | transloco }}</span>
        }
      </div>
    }
  `,
  styles: `
    .banner {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      align-items: center;
      justify-content: space-between;
      padding: 6px 14px;
      border-bottom: 1px solid var(--border);
      background: var(--accent-soft);
      color: var(--text);
      font-size: 0.9rem;
    }
    .link {
      padding: 0;
      border: 0;
      background: none;
      color: var(--ds-action-text);
      font: inherit;
      text-decoration: underline;
      cursor: pointer;
    }
  `,
})
export class DiscoveryBanner {
  protected window = inject(DiscoveryWindow);
  /** The current router URL, from the shell. */
  readonly url = input.required<string>();

  protected readonly shown = computed(() => this.window.enforced() && isDiscoveryPath(this.url()));
  protected readonly left = computed(() => {
    const end = this.window.endsAt();
    return end === null ? 0 : minutesLeft(end, this.window.clock());
  });
}
