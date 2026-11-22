import { Component, effect, input, signal, untracked } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { MbButton } from '../design-system/button/button';
import { MbNotice } from '../design-system/notice/notice';
import { Status } from '../platform/api/models';
import { StatusCard } from '../posts/status-card/status-card';

// i18n lite.feed.loading: Loading…
// i18n lite.feed.more: Load more
// i18n lite.feed.end: That's everything.
// i18n lite.feed.empty: Nothing here yet.
// i18n lite.feed.failed: Couldn't load this. Check your connection and try again.
// i18n lite.feed.retry: Try again

/** Loads one page; `maxId` is the last post already shown, or undefined for the newest. */
export type LitePageLoader = (maxId?: string) => Observable<Status[]>;

/**
 * The one list Lite uses for every timeline: one request per page, no
 * prefetching, no infinite scroll (a "Load more" button is a request the reader
 * chose to pay for), and the shared status card, so posts look and behave the
 * same as in the full app and improve with it.
 */
@Component({
  selector: 'app-lite-feed',
  imports: [MbButton, MbNotice, StatusCard, TranslocoPipe],
  template: `
    @for (status of statuses(); track status.id) {
      <app-status-card
        [status]="status"
        [filterContext]="filterContext()"
        (deleted)="drop($event)"
        (changed)="replace($event)"
      />
    } @empty {
      @if (!loading() && !failed()) {
        <p class="muted">{{ 'lite.feed.empty' | transloco }}</p>
      }
    }
    @if (failed()) {
      <mb-notice tone="error" announcement="alert">
        {{ 'lite.feed.failed' | transloco }}
        <button mbButton variant="link" type="button" (click)="more()">
          {{ 'lite.feed.retry' | transloco }}
        </button>
      </mb-notice>
    } @else if (loading()) {
      <p class="muted" role="status">{{ 'lite.feed.loading' | transloco }}</p>
    } @else if (done()) {
      @if (statuses().length) {
        <p class="muted">{{ 'lite.feed.end' | transloco }}</p>
      }
    } @else {
      <button mbButton variant="outline" type="button" class="more" (click)="more()">
        {{ 'lite.feed.more' | transloco }}
      </button>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .muted {
      color: var(--muted);
      padding: 12px 16px;
      margin: 0;
    }
    .more {
      display: block;
      margin: 12px auto 24px;
    }
  `,
})
export class LiteFeed {
  readonly load = input.required<LitePageLoader>();
  readonly filterContext = input<'home' | 'notifications' | 'public' | 'thread' | 'account'>(
    'home',
  );

  protected readonly statuses = signal<Status[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly done = signal(false);

  constructor() {
    // A new loader (another list, another profile) starts over.
    effect(() => {
      this.load();
      untracked(() => {
        this.statuses.set([]);
        this.done.set(false);
        this.more();
      });
    });
  }

  protected more(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.failed.set(false);
    const last = this.statuses().at(-1)?.id;
    this.load()(last).subscribe({
      next: (page) => {
        const seen = new Set(this.statuses().map((s) => s.id));
        const fresh = page.filter((s) => !seen.has(s.id));
        this.statuses.update((list) => [...list, ...fresh]);
        this.done.set(fresh.length === 0);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected drop(status: Status): void {
    this.statuses.update((list) => list.filter((s) => s.id !== status.id));
  }

  protected replace(status: Status): void {
    this.statuses.update((list) => list.map((s) => (s.id === status.id ? status : s)));
  }
}
