import { Component, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { parseAccountRoute } from '../accounts/account-route';
import { MbButton } from '../design-system/button/button';
import { MbNotice } from '../design-system/notice/notice';
import { Api } from '../platform/api/api';
import {
  Account,
  Context,
  Conversation,
  MastodonNotification,
  SearchResults,
  Status,
  UserList,
} from '../platform/api/models';
import { StatusCard } from '../posts/status-card/status-card';
import { LiteFeed, LitePageLoader } from './lite-feed';

// i18n lite.home: Home
// i18n lite.notifications: Notifications
// i18n lite.bookmarks: Bookmarks
// i18n lite.lists: Lists
// i18n lite.noLists: You have no lists.
// i18n lite.conversations: Direct messages
// i18n lite.noConversations: No direct messages.
// i18n lite.search: Search
// i18n lite.searchLabel: Search posts, people and hashtags
// i18n lite.searchButton: Search
// i18n lite.people: People
// i18n lite.hashtags: Hashtags
// i18n lite.posts: Posts
// i18n lite.noResults: No results.
// i18n lite.thread: Thread
// i18n lite.loading: Loading…
// i18n lite.failed: Couldn't load this. Check your connection and try again.
// i18n lite.retry: Try again
// i18n lite.notFound: This post or profile isn't available.
// i18n lite.posts.count: {{count}} posts
// i18n lite.followers: {{count}} followers
// i18n lite.notification.favourite: {{name}} favourited your post
// i18n lite.notification.reblog: {{name}} boosted your post
// i18n lite.notification.follow: {{name}} followed you
// i18n lite.notification.follow_request: {{name}} asked to follow you
// i18n lite.notification.poll: A poll you took part in has ended
// i18n lite.notification.update: {{name}} edited a post you interacted with
// i18n lite.notification.other: {{name}}: {{type}}

/** Lite pages are deliberately small: one request per view, the shared status card. */
const PAGE = 20;

/** A route parameter as a signal; the page reacts when it changes in place. */
function param(name: string): Signal<string> {
  const route = inject(ActivatedRoute);
  const params = toSignal(route.paramMap, { initialValue: route.snapshot.paramMap });
  return computed(() => params().get(name) ?? '');
}

function queryParam(name: string): Signal<string> {
  const route = inject(ActivatedRoute);
  const params = toSignal(route.queryParamMap, { initialValue: route.snapshot.queryParamMap });
  return computed(() => params().get(name) ?? '');
}

@Component({
  selector: 'app-lite-home',
  imports: [LiteFeed, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.home' | transloco }}</h1>
    <app-lite-feed [load]="load" filterContext="home" />`,
})
export class LiteHome {
  private readonly api = inject(Api);
  protected readonly load: LitePageLoader = (maxId) => this.api.homeTimeline(maxId, PAGE);
}

@Component({
  selector: 'app-lite-bookmarks',
  imports: [LiteFeed, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.bookmarks' | transloco }}</h1>
    <app-lite-feed [load]="load" filterContext="home" />`,
})
export class LiteBookmarks {
  private readonly api = inject(Api);
  protected readonly load: LitePageLoader = (maxId) => this.api.bookmarks(maxId, PAGE);
}

@Component({
  selector: 'app-lite-tag',
  imports: [LiteFeed],
  template: `<h1 class="lite-title">#{{ tag() }}</h1>
    <app-lite-feed [load]="load()" filterContext="public" />`,
})
export class LiteTag {
  protected readonly tag = param('tag');
  private readonly api = inject(Api);
  protected readonly load = computed<LitePageLoader>(() => {
    const tag = this.tag();
    return (maxId) => this.api.tagTimeline(tag, maxId, PAGE);
  });
}

@Component({
  selector: 'app-lite-list',
  imports: [LiteFeed],
  template: `<h1 class="lite-title">{{ title() }}</h1>
    <app-lite-feed [load]="load()" filterContext="home" />`,
})
export class LiteListTimeline {
  private readonly id = param('id');
  private readonly api = inject(Api);
  protected readonly title = signal('');
  protected readonly load = computed<LitePageLoader>(() => {
    const id = this.id();
    return (maxId) => this.api.listTimeline(id, maxId, PAGE);
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() =>
        this.api.getList(id).subscribe({
          next: (list) => this.title.set(list.title),
          error: () => this.title.set(''),
        }),
      );
    });
  }
}

@Component({
  selector: 'app-lite-lists',
  imports: [MbNotice, RouterLink, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.lists' | transloco }}</h1>
    @if (failed()) {
      <mb-notice tone="error" announcement="alert">{{ 'lite.failed' | transloco }}</mb-notice>
    } @else if (lists(); as all) {
      <ul class="lite-rows">
        @for (list of all; track list.id) {
          <li>
            <a [routerLink]="['/m/lists', list.id]">{{ list.title }}</a>
          </li>
        } @empty {
          <li class="muted">{{ 'lite.noLists' | transloco }}</li>
        }
      </ul>
    } @else {
      <p class="muted" role="status">{{ 'lite.loading' | transloco }}</p>
    }`,
})
export class LiteLists {
  protected readonly lists = signal<UserList[] | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    inject(Api)
      .lists()
      .subscribe({ next: (lists) => this.lists.set(lists), error: () => this.failed.set(true) });
  }
}

/**
 * Notifications as one line each, with the post underneath when there is one.
 * No grouping, no relationship lookups, no extra requests per row.
 */
@Component({
  selector: 'app-lite-notifications',
  imports: [MbButton, MbNotice, RouterLink, StatusCard, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.notifications' | transloco }}</h1>
    @for (n of items(); track n.id) {
      <section class="lite-notification">
        @if (n.type !== 'mention' && n.type !== 'status') {
          <p class="line">
            <a [routerLink]="['/m/accounts', n.account.id]">{{
              line(n) | transloco: { name: name(n.account), type: n.type }
            }}</a>
          </p>
        }
        @if (n.status) {
          <app-status-card [status]="n.status" filterContext="notifications" />
        }
      </section>
    }
    @if (failed()) {
      <mb-notice tone="error" announcement="alert">
        {{ 'lite.failed' | transloco }}
        <button mbButton variant="link" type="button" (click)="more()">
          {{ 'lite.retry' | transloco }}
        </button>
      </mb-notice>
    } @else if (loading()) {
      <p class="muted" role="status">{{ 'lite.loading' | transloco }}</p>
    } @else if (!done()) {
      <button mbButton variant="outline" type="button" class="lite-more" (click)="more()">
        {{ 'lite.feed.more' | transloco }}
      </button>
    }`,
  styles: `
    .line {
      margin: 0;
      padding: 10px 16px 4px;
      font-size: 14px;
    }
    .lite-notification {
      border-block-end: 1px solid var(--border);
    }
  `,
})
export class LiteNotifications {
  private readonly api = inject(Api);
  protected readonly items = signal<MastodonNotification[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly done = signal(false);

  constructor() {
    this.more();
  }

  protected more(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.failed.set(false);
    this.api.notifications(this.items().at(-1)?.id, { limit: PAGE }).subscribe({
      next: (page) => {
        this.items.update((list) => [...list, ...page]);
        this.done.set(page.length === 0);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected line(n: MastodonNotification): string {
    const known = ['favourite', 'reblog', 'follow', 'follow_request', 'poll', 'update'];
    return `lite.notification.${known.includes(n.type) ? n.type : 'other'}`;
  }

  protected name(account: Account): string {
    return account.display_name || account.username;
  }
}

/** A post with its conversation: two requests, no reply tree machinery. */
@Component({
  selector: 'app-lite-thread',
  imports: [MbNotice, StatusCard, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.thread' | transloco }}</h1>
    @if (failed()) {
      <mb-notice tone="error" announcement="alert">{{ 'lite.notFound' | transloco }}</mb-notice>
    } @else if (focus(); as post) {
      @for (s of context()?.ancestors ?? []; track s.id) {
        <app-status-card [status]="s" filterContext="thread" />
      }
      <div class="focus">
        <app-status-card [status]="post" filterContext="thread" />
      </div>
      @for (s of context()?.descendants ?? []; track s.id) {
        <app-status-card [status]="s" filterContext="thread" />
      }
    } @else {
      <p class="muted" role="status">{{ 'lite.loading' | transloco }}</p>
    }`,
  styles: `
    .focus {
      border-inline-start: 3px solid var(--accent);
    }
  `,
})
export class LiteThread {
  private readonly id = param('id');
  private readonly api = inject(Api);
  protected readonly focus = signal<Status | null>(null);
  protected readonly context = signal<Context | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.fetch(id));
    });
  }

  private fetch(id: string): void {
    this.focus.set(null);
    this.context.set(null);
    this.failed.set(false);
    this.api.getStatus(id).subscribe({
      next: (status) => this.focus.set(status),
      error: () => this.failed.set(true),
    });
    this.api.getContext(id).subscribe({
      next: (c) => this.context.set(c),
      // Without context the post alone still shows; that is the useful part.
      error: () => this.context.set({ ancestors: [], descendants: [] }),
    });
  }
}

/** A profile: who it is, and their posts. Pinned posts, media walls and analytics stay in the full app. */
@Component({
  selector: 'app-lite-profile',
  imports: [LiteFeed, MbNotice, TranslocoPipe],
  template: `@if (failed()) {
      <mb-notice tone="error" announcement="alert">{{ 'lite.notFound' | transloco }}</mb-notice>
    } @else if (account(); as a) {
      <header class="lite-profile">
        <h1 class="lite-title">{{ a.display_name || a.username }}</h1>
        <p class="muted">&#64;{{ a.acct }}</p>
        <p class="muted">
          {{ 'lite.posts.count' | transloco: { count: a.statuses_count } }} ·
          {{ 'lite.followers' | transloco: { count: a.followers_count } }}
        </p>
      </header>
      <app-lite-feed [load]="load()!" filterContext="account" />
    } @else {
      <p class="muted" role="status">{{ 'lite.loading' | transloco }}</p>
    }`,
  styles: `
    .lite-profile p {
      margin: 0 16px 6px;
    }
  `,
})
export class LiteProfile {
  private readonly id = param('id');
  private readonly handle = param('handle');
  private readonly api = inject(Api);
  protected readonly account = signal<Account | null>(null);
  protected readonly failed = signal(false);
  protected readonly load = computed<LitePageLoader | null>(() => {
    const account = this.account();
    return account
      ? (maxId) => this.api.getAccountStatuses(account.id, { maxId, limit: PAGE })
      : null;
  });

  constructor() {
    effect(() => {
      const segments = [this.id(), this.handle()];
      untracked(() => this.fetch(segments));
    });
  }

  private fetch(segments: string[]): void {
    this.account.set(null);
    this.failed.set(false);
    const ref = parseAccountRoute(segments);
    const request = ref?.id
      ? this.api.getAccount(ref.id)
      : ref?.handle
        ? this.api.lookupAccount(ref.handle)
        : null;
    if (!request) {
      this.failed.set(true);
      return;
    }
    request.subscribe({
      next: (account) => this.account.set(account),
      error: () => this.failed.set(true),
    });
  }
}

/** One search request; posts render as cards, people and tags as links. */
@Component({
  selector: 'app-lite-search',
  imports: [FormsModule, MbButton, MbNotice, RouterLink, StatusCard, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.search' | transloco }}</h1>
    <form class="lite-search" (submit)="submit($event)">
      <input
        type="search"
        name="q"
        [attr.aria-label]="'lite.searchLabel' | transloco"
        [placeholder]="'lite.searchLabel' | transloco"
        [(ngModel)]="query"
      />
      <button mbButton type="submit">{{ 'lite.searchButton' | transloco }}</button>
    </form>
    @if (failed()) {
      <mb-notice tone="error" announcement="alert">{{ 'lite.failed' | transloco }}</mb-notice>
    } @else if (loading()) {
      <p class="muted" role="status">{{ 'lite.loading' | transloco }}</p>
    } @else if (results(); as r) {
      @if (!r.accounts.length && !r.hashtags.length && !r.statuses.length) {
        <p class="muted">{{ 'lite.noResults' | transloco }}</p>
      }
      @if (r.accounts.length) {
        <h2 class="lite-subtitle">{{ 'lite.people' | transloco }}</h2>
        <ul class="lite-rows">
          @for (a of r.accounts; track a.id) {
            <li>
              <a [routerLink]="['/m/accounts', a.id]">{{ a.display_name || a.username }}</a>
              <span class="muted"> &#64;{{ a.acct }}</span>
            </li>
          }
        </ul>
      }
      @if (r.hashtags.length) {
        <h2 class="lite-subtitle">{{ 'lite.hashtags' | transloco }}</h2>
        <ul class="lite-rows">
          @for (t of r.hashtags; track t.name) {
            <li>
              <a [routerLink]="['/m/tags', t.name]">#{{ t.name }}</a>
            </li>
          }
        </ul>
      }
      @if (r.statuses.length) {
        <h2 class="lite-subtitle">{{ 'lite.posts' | transloco }}</h2>
        @for (s of r.statuses; track s.id) {
          <app-status-card [status]="s" filterContext="public" />
        }
      }
    }`,
  styles: `
    .lite-search {
      display: flex;
      gap: 8px;
      padding: 0 16px 12px;
    }
    .lite-search input {
      flex: 1;
      min-width: 0;
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--col-bg);
      color: var(--text);
      font: inherit;
    }
  `,
})
export class LiteSearch {
  private readonly q = queryParam('q');
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected query = '';
  protected readonly results = signal<SearchResults | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      const q = this.q().trim();
      untracked(() => {
        if (!q) return;
        this.query = q;
        this.run(q);
      });
    });
  }

  /** The query lives in the address, so a search can be shared or reloaded. */
  protected submit(event: Event): void {
    event.preventDefault();
    const q = this.query.trim();
    if (q) void this.router.navigate(['/m/search'], { queryParams: { q } });
  }

  private run(q: string): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.search(q, undefined, { resolve: true, limit: 10 }).subscribe({
      next: (results) => {
        this.results.set(results);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }
}

/** Direct messages: each conversation's latest post, newest first. Replies happen on the card. */
@Component({
  selector: 'app-lite-conversations',
  imports: [LiteFeed, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.conversations' | transloco }}</h1>
    <app-lite-feed [load]="load" filterContext="thread" />`,
})
export class LiteConversations {
  private readonly api = inject(Api);
  private lastConversation: string | undefined;
  protected readonly load: LitePageLoader = (maxId) =>
    this.api.conversations(maxId ? this.lastConversation : undefined, PAGE).pipe(
      map((page: Conversation[]) => {
        this.lastConversation = page.at(-1)?.id;
        return page.flatMap((c) => (c.last_status ? [c.last_status] : []));
      }),
    );
}
