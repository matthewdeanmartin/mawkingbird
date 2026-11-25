import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ScreenShare } from './screen-share';

// i18n screenShare.badge: Screen share
// i18n screenShare.badgeTitle: Private posts, messages and pseudonymous accounts are hidden. Click to stop.
// i18n screenShare.cover: Hidden while screen sharing
// i18n screenShare.coverBody: This page is private. Turn off screen share mode to see it.
// i18n screenShare.stop: Stop screen share mode
// i18n screenShare.post: Not shown while screen sharing

/**
 * The header's reminder that screen share mode is on, and its off switch. Always
 * in the header, never in a menu: on a stream, "is it on?" must be answerable at
 * a glance, and switching it off is the one thing done without looking.
 */
@Component({
  selector: 'app-screen-share-badge',
  imports: [TranslocoPipe],
  template: `
    @if (screenShare.enabled()) {
      <button
        type="button"
        class="badge"
        [title]="'screenShare.badgeTitle' | transloco"
        (click)="screenShare.set(false)"
      >
        <span class="dot" aria-hidden="true"></span>{{ 'screenShare.badge' | transloco }}
      </button>
    }
  `,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border: 1px solid var(--ds-danger-border, #c0392b);
      border-radius: 999px;
      background: var(--ds-danger-surface, transparent);
      color: var(--text);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--ds-danger-border, #c0392b);
    }
  `,
})
export class ScreenShareBadge {
  protected readonly screenShare = inject(ScreenShare);
}

/** What stands in for a private page while screen sharing. */
@Component({
  selector: 'app-screen-share-cover',
  imports: [TranslocoPipe],
  template: `
    <section class="cover">
      <h1>{{ 'screenShare.cover' | transloco }}</h1>
      <p class="muted">{{ 'screenShare.coverBody' | transloco }}</p>
      <button type="button" class="btn btn-outline" (click)="screenShare.set(false)">
        {{ 'screenShare.stop' | transloco }}
      </button>
    </section>
  `,
  styles: `
    .cover {
      padding: 48px 32px;
      text-align: center;
    }
  `,
})
export class ScreenShareCover {
  protected readonly screenShare = inject(ScreenShare);
}
