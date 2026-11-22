import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';

// i18n lite.status.loading: Loading…
// i18n lite.status.refreshing: Getting the newest…
// i18n lite.status.savedCopy: Showing a copy saved {{minutes}} min ago. Getting the newest…
// i18n lite.status.failed: Couldn't load this. Check your connection and try again.
// i18n lite.status.failedKept: Couldn't get anything newer. This is what was loaded {{minutes}} min ago.
// i18n lite.status.retry: Try again

/**
 * The one status line every Lite screen shows above its content: loading,
 * refreshing in the background, showing a saved copy, or a failure that kept
 * what was already on screen. Padded like the rest of Lite.
 */
@Component({
  selector: 'app-lite-status',
  imports: [MbButton, TranslocoPipe],
  template: `
    @if (failed()) {
      <p class="lite-status" role="alert">
        @if (hasContent()) {
          {{ 'lite.status.failedKept' | transloco: { minutes: minutes() } }}
        } @else {
          {{ 'lite.status.failed' | transloco }}
        }
        <button mbButton variant="link" size="small" type="button" (click)="retry.emit()">
          {{ 'lite.status.retry' | transloco }}
        </button>
      </p>
    } @else if (refreshing() && fromSaved()) {
      <p class="lite-status" role="status">
        {{ 'lite.status.savedCopy' | transloco: { minutes: minutes() } }}
      </p>
    } @else if (refreshing()) {
      <p class="lite-status" role="status">{{ 'lite.status.refreshing' | transloco }}</p>
    } @else if (loading() && !hasContent()) {
      <p class="lite-status" role="status">{{ 'lite.status.loading' | transloco }}</p>
    }
  `,
  styles: `
    .lite-status {
      margin: 0;
      padding: 8px 16px;
      color: var(--muted);
      font-size: 14px;
    }
  `,
})
export class LiteStatus {
  readonly loading = input(false);
  readonly refreshing = input(false);
  readonly failed = input(false);
  readonly fromSaved = input(false);
  readonly hasContent = input(false);
  readonly loadedAt = input<number | null>(null);
  readonly retry = output<void>();

  protected readonly minutes = computed(() => {
    const at = this.loadedAt();
    return at === null ? 0 : Math.max(0, Math.round((Date.now() - at) / 60_000));
  });
}
