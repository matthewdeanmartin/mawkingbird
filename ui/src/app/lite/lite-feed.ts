import {
  Component,
  WritableSignal,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, map } from 'rxjs';
import { MbButton } from '../design-system/button/button';
import { FilterContext, Status } from '../platform/api/models';
import { StatusCard } from '../posts/status-card/status-card';
import { LiteStatus } from './lite-status';
import { LiteStore, PageLoader, PagedState, byLastId } from './lite-store';

// i18n lite.feed.more: Load more
// i18n lite.feed.end: That's everything.
// i18n lite.feed.empty: Nothing here yet.

/** Loads one page of posts; `maxId` is the last post already shown. */
export type LitePageLoader = (maxId?: string) => Observable<Status[]>;

/** Adapt a plain posts loader to the store's paged loader. */
export function statusPages(load: LitePageLoader): PageLoader<Status> {
  return (cursor) => load(cursor).pipe(map(byLastId));
}

/**
 * The one list Lite uses for every timeline. What it has loaded is held in
 * {@link LiteStore} for the whole visit, so coming back is instant and nothing
 * reloads until the reader presses Refresh. One request per page, no
 * prefetching, no infinite scroll, and the shared status card.
 */
@Component({
  selector: 'app-lite-feed',
  imports: [LiteStatus, MbButton, StatusCard, TranslocoPipe],
  template: `
    @let s = state();
    <app-lite-status
      [loading]="s.loading"
      [refreshing]="s.refreshing"
      [failed]="s.failed"
      [fromSaved]="s.fromSaved"
      [hasContent]="s.items.length > 0"
      [loadedAt]="s.loadedAt"
      (retry)="retry()"
    />
    @for (status of s.items; track status.id) {
      <app-status-card
        [status]="status"
        [filterContext]="filterContext()"
        (deleted)="drop($event)"
        (changed)="replace($event)"
      />
    } @empty {
      @if (!s.loading && !s.refreshing && !s.failed) {
        <p class="lite-pad">{{ 'lite.feed.empty' | transloco }}</p>
      }
    }
    @if (s.items.length && !s.failed) {
      @if (s.loading) {
        <app-lite-status [loading]="true" />
      } @else if (s.done) {
        <p class="lite-pad">{{ 'lite.feed.end' | transloco }}</p>
      } @else if (!s.refreshing) {
        <button mbButton variant="outline" type="button" class="more" (click)="more()">
          {{ 'lite.feed.more' | transloco }}
        </button>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .lite-pad {
      margin: 0;
      padding: 12px 16px;
      color: var(--muted);
    }
    .more {
      display: block;
      margin: 12px auto 24px;
    }
  `,
})
export class LiteFeed {
  /** What this list is, for holding it: 'home', 'list:7', 'profile-posts:42'. */
  readonly key = input.required<string>();
  readonly load = input.required<LitePageLoader>();
  /** The endpoint path whose saved first page can be shown at once, if any. */
  readonly savedPath = input<string>();
  readonly filterContext = input<FilterContext>('home');

  private readonly store = inject(LiteStore);
  private readonly pages = computed(() => statusPages(this.load()));
  /** The held list's signal; a new key (another list or profile) picks another. */
  private readonly held = computed<WritableSignal<PagedState<Status>>>(() =>
    this.store.pagedState(this.key(), this.pages(), this.savedPath()),
  );
  protected readonly state = computed(() => this.held()());

  constructor() {
    // Refresh reloads only the list on screen.
    let seen = this.store.refreshTick();
    effect(() => {
      const tick = this.store.refreshTick();
      if (tick === seen) return;
      seen = tick;
      untracked(() => this.store.reload(this.held(), this.pages()));
    });
  }

  protected more(): void {
    this.store.more(this.held(), this.pages());
  }

  protected retry(): void {
    const s = this.held()();
    if (s.items.length) this.store.reload(this.held(), this.pages());
    else this.store.more(this.held(), this.pages());
  }

  protected drop(status: Status): void {
    this.held().update((s) => ({ ...s, items: s.items.filter((x) => x.id !== status.id) }));
  }

  protected replace(status: Status): void {
    this.held().update((s) => ({
      ...s,
      items: s.items.map((x) => (x.id === status.id ? status : x)),
    }));
  }
}
