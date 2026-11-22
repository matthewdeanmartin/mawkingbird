import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { ConnectionState } from '../../platform/network/connection-state';

// i18n offlineBanner.offline: You're offline. What's already on screen stays readable.
// i18n offlineBanner.checking: Checking your connection…
// i18n offlineBanner.tryNow: Try now
// i18n offlineBanner.trying: Trying…
// i18n offlineBanner.details: Details

/**
 * The calm replacement for the fail whale when the problem is the reader's
 * own connection. It sits at the bottom of the window and covers nothing:
 * posts already loaded can still be read, drafts still typed. The whale is
 * kept for the case it was built for — a server that is down while the
 * network works.
 */
@Component({
  selector: 'app-offline-banner',
  imports: [MbButton, RouterLink, TranslocoPipe],
  template: `
    @if (surface(); as s) {
      @if (s === 'offline' || s === 'checking') {
        <div class="banner" role="status" [attr.data-surface]="s">
          <span>{{ 'offlineBanner.' + s | transloco }}</span>
          @if (s === 'offline') {
            <button
              mbButton
              variant="outline"
              size="small"
              type="button"
              [disabled]="trying()"
              (click)="tryNow()"
            >
              {{ (trying() ? 'offlineBanner.trying' : 'offlineBanner.tryNow') | transloco }}
            </button>
          }
          <a mbButton variant="link" size="small" routerLink="/connection">{{
            'offlineBanner.details' | transloco
          }}</a>
        </div>
      }
    }
  `,
  styles: `
    .banner {
      position: fixed;
      inset-inline: 16px;
      inset-block-end: calc(16px + env(safe-area-inset-bottom, 0px));
      z-index: 900;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 8px 12px;
      max-inline-size: 560px;
      margin-inline: auto;
      padding: 10px 16px;
      border: 1px solid var(--border);
      border-inline-start: 4px solid var(--ds-error-text);
      border-radius: 14px;
      background: var(--col-bg);
      color: var(--text);
      box-shadow: 0 8px 28px rgb(15 20 25 / 16%);
      font-size: 14px;
    }
    .banner[data-surface='checking'] {
      border-inline-start-color: var(--ds-warning-text);
    }
  `,
})
export class OfflineBanner {
  private readonly state = inject(ConnectionState);
  protected readonly surface = this.state.surface;
  protected readonly trying = signal(false);

  protected async tryNow(): Promise<void> {
    this.trying.set(true);
    try {
      await this.state.retryNow();
    } finally {
      this.trying.set(false);
    }
  }
}
