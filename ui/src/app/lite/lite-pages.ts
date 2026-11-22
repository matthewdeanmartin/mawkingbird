import {
  Component,
  Signal,
  WritableSignal,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { parseAccountRoute } from '../accounts/account-route';
import { MbButton } from '../design-system/button/button';
import { Api } from '../platform/api/api';
import {
  Account,
  Context,
  MastodonNotification,
  SearchResults,
  Status,
  UserList,
} from '../platform/api/models';
import { StatusCard } from '../posts/status-card/status-card';
import { LiteFeed, LitePageLoader } from './lite-feed';
import { LiteStatus } from './lite-status';
import { LiteStore, PageLoader, ValueState, byLastId } from './lite-store';

// i18n lite.home: Home
// i18n lite.notifications: Notifications
// i18n lite.bookmarks: Bookmarks
// i18n lite.lists: Lists
// i18n lite.noLists: You have no lists.
// i18n lite.conversations: Direct messages
// i18n lite.search: Search
// i18n lite.searchLabel: Search posts, people and hashtags
// i18n lite.searchButton: Search
// i18n lite.people: People
// i18n lite.hashtags: Hashtags
// i18n lite.posts: Posts
// i18n lite.noResults: No results.
// i18n lite.thread: Thread
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

/**
 * Lite pages: one request per view, the shared status card, and everything
 * held in {@link LiteStore} for the visit — coming back to a screen is instant
 * and only the Refresh button reloads it.
 */
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

/** Run `reload` when the reader presses Refresh while this screen is showing. */
function onRefresh(reload: () => void): void {
  const store = inject(LiteStore);
  let seen = store.refreshTick();
  effect(() => {
    const tick = store.refreshTick();
    if (tick === seen) return;
    seen = tick;
    untracked(reload);
  });
}

/** A held single value for a key that can change in place (another thread, profile). */
function heldValue<T>(
  key: Signal<string>,
  fetch: (key: string) => Observable<T>,
): Signal<WritableSignal<ValueState<T>>> {
  const store = inject(LiteStore);
  const held = computed(() => {
    const k = key();
    return store.valueState(k, () => fetch(k));
  });
  onRefresh(() => {
    const k = key();
    store.fetchValue(held(), () => fetch(k));
  });
  return held;
}

@Component({
  selector: 'app-lite-home',
  imports: [LiteFeed, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.home' | transloco }}</h1>
    <app-lite-feed key="home" [load]="load" savedPath="/api/v1/timelines/home" />`,
})
export class LiteHome {
  private readonly api = inject(Api);
  protected readonly load: LitePageLoader = (maxId) => this.api.homeTimeline(maxId, PAGE);
}

@Component({
  selector: 'app-lite-bookmarks',
  imports: [LiteFeed, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.bookmarks' | transloco }}</h1>
    <app-lite-feed key="bookmarks" [load]="load" savedPath="/api/v1/bookmarks" />`,
})
export class LiteBookmarks {
  private readonly api = inject(Api);
  protected readonly load: LitePageLoader = (maxId) => this.api.bookmarks(maxId, PAGE);
}

@Component({
  selector: 'app-lite-tag',
  imports: [LiteFeed],
  template: `<h1 class="lite-title">#{{ tag() }}</h1>
    <app-lite-feed [key]="'tag:' + tag()" [load]="load()" filterContext="public" />`,
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
  template: `<h1 class="lite-title">{{ list()().value?.title ?? '' }}</h1>
    <app-lite-feed
      [key]="'list:' + id()"
      [load]="load()"
      [savedPath]="'/api/v1/timelines/list/' + id()"
    />`,
})
export class LiteListTimeline {
  protected readonly id = param('id');
  private readonly api = inject(Api);
  protected readonly list = heldValue(
    computed(() => `list-info:${this.id()}`),
    (key) => this.api.getList(key.slice('list-info:'.length)),
  );
  protected readonly load = computed<LitePageLoader>(() => {
    const id = this.id();
    return (maxId) => this.api.listTimeline(id, maxId, PAGE);
  });
}

@Component({
  selector: 'app-lite-lists',
  imports: [LiteStatus, RouterLink, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.lists' | transloco }}</h1>
    @let s = lists()();
    <app-lite-status
      [loading]="s.loading"
      [failed]="s.failed"
      [hasContent]="!!s.value"
      [loadedAt]="s.loadedAt"
      (retry)="retry()"
    />
    @if (s.value; as all) {
      <ul class="lite-rows">
        @for (list of all; track list.id) {
          <li>
            <a [routerLink]="['/m/lists', list.id]">{{ list.title }}</a>
          </li>
        } @empty {
          <li class="muted">{{ 'lite.noLists' | transloco }}</li>
        }
      </ul>
    }`,
})
export class LiteLists {
  private readonly api = inject(Api);
  private readonly store = inject(LiteStore);
  protected readonly lists = heldValue<UserList[]>(
    computed(() => 'lists'),
    () => this.api.lists(),
  );

  protected retry(): void {
    this.store.fetchValue(this.lists(), () => this.api.lists());
  }
}

/**
 * Notifications as one line each, with the post underneath when there is one.
 * No grouping, no relationship lookups, no extra requests per row.
 */
@Component({
  selector: 'app-lite-notifications',
  imports: [LiteStatus, MbButton, RouterLink, StatusCard, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.notifications' | transloco }}</h1>
    @let s = held();
    <app-lite-status
      [loading]="s.loading"
      [refreshing]="s.refreshing"
      [failed]="s.failed"
      [fromSaved]="s.fromSaved"
      [hasContent]="s.items.length > 0"
      [loadedAt]="s.loadedAt"
      (retry)="retry()"
    />
    @for (n of s.items; track n.id) {
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
    @if (s.items.length && !s.failed && !s.refreshing) {
      @if (s.loading) {
        <app-lite-status [loading]="true" />
      } @else if (!s.done) {
        <button mbButton variant="outline" type="button" class="lite-more" (click)="more()">
          {{ 'lite.feed.more' | transloco }}
        </button>
      }
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
  private readonly store = inject(LiteStore);
  private readonly loader: PageLoader<MastodonNotification> = (cursor) =>
    this.api.notifications(cursor, { limit: PAGE }).pipe(map(byLastId));
  private readonly state = this.store.pagedState(
    'notifications',
    this.loader,
    '/api/v1/notifications',
  );
  protected readonly held = computed(() => this.state());

  constructor() {
    onRefresh(() => this.store.reload(this.state, this.loader));
  }

  protected more(): void {
    this.store.more(this.state, this.loader);
  }

  protected retry(): void {
    if (this.state().items.length) this.store.reload(this.state, this.loader);
    else this.store.more(this.state, this.loader);
  }

  protected line(n: MastodonNotification): string {
    const known = ['favourite', 'reblog', 'follow', 'follow_request', 'poll', 'update'];
    return `lite.notification.${known.includes(n.type) ? n.type : 'other'}`;
  }

  protected name(account: Account): string {
    return account.display_name || account.username;
  }
}

interface ThreadView {
  focus: Status;
  context: Context;
}

/** A post with its conversation: two requests, no reply tree machinery. */
@Component({
  selector: 'app-lite-thread',
  imports: [LiteStatus, StatusCard, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.thread' | transloco }}</h1>
    @let s = thread()();
    <app-lite-status
      [loading]="s.loading"
      [refreshing]="s.loading && !!s.value"
      [failed]="s.failed"
      [hasContent]="!!s.value"
      [loadedAt]="s.loadedAt"
      (retry)="retry()"
    />
    @if (s.value; as view) {
      @for (p of view.context.ancestors; track p.id) {
        <app-status-card [status]="p" filterContext="thread" />
      }
      <div class="focus">
        <app-status-card [status]="view.focus" filterContext="thread" />
      </div>
      @for (p of view.context.descendants; track p.id) {
        <app-status-card [status]="p" filterContext="thread" />
      }
    } @else if (s.failed) {
      <p class="lite-intro muted">{{ 'lite.notFound' | transloco }}</p>
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
  private readonly store = inject(LiteStore);
  private readonly fetch = (key: string): Observable<ThreadView> => {
    const id = key.slice('thread:'.length);
    return forkJoin({
      focus: this.api.getStatus(id),
      // Without context the post alone still shows; that is the useful part.
      context: this.api
        .getContext(id)
        .pipe(catchError(() => of<Context>({ ancestors: [], descendants: [] }))),
    });
  };
  protected readonly thread = heldValue(
    computed(() => `thread:${this.id()}`),
    this.fetch,
  );

  protected retry(): void {
    const key = `thread:${this.id()}`;
    this.store.fetchValue(this.thread(), () => this.fetch(key));
  }
}

/** A profile: who it is, and their posts. Pinned posts, media walls and analytics stay in the full app. */
@Component({
  selector: 'app-lite-profile',
  imports: [LiteFeed, LiteStatus, TranslocoPipe],
  template: `@let s = profile()();
    <app-lite-status
      [loading]="s.loading && !s.value"
      [failed]="s.failed && !s.value"
      [hasContent]="!!s.value"
      [loadedAt]="s.loadedAt"
      (retry)="retry()"
    />
    @if (s.value; as a) {
      <header class="lite-profile">
        <h1 class="lite-title">{{ a.display_name || a.username }}</h1>
        <p class="muted">&#64;{{ a.acct }}</p>
        <p class="muted">
          {{ 'lite.posts.count' | transloco: { count: a.statuses_count } }} ·
          {{ 'lite.followers' | transloco: { count: a.followers_count } }}
        </p>
      </header>
      <app-lite-feed
        [key]="'profile-posts:' + a.id"
        [load]="postsOf(a.id)"
        [savedPath]="'/api/v1/accounts/' + a.id + '/statuses'"
        filterContext="account"
      />
    } @else if (s.failed) {
      <p class="lite-intro muted">{{ 'lite.notFound' | transloco }}</p>
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
  private readonly store = inject(LiteStore);
  private readonly fetch = (key: string): Observable<Account> => {
    const ref = parseAccountRoute(key.slice('profile:'.length).split(' '));
    return ref?.id
      ? this.api.getAccount(ref.id)
      : ref?.handle
        ? this.api.lookupAccount(ref.handle)
        : new Observable<Account>((sub) => sub.error(new Error('not a profile address')));
  };
  private readonly key = computed(() => `profile:${this.id()} ${this.handle()}`.trim());
  protected readonly profile = heldValue(this.key, this.fetch);
  private readonly loaders = new Map<string, LitePageLoader>();

  /** One stable loader per account, so the held list is reused. */
  protected postsOf(accountId: string): LitePageLoader {
    let loader = this.loaders.get(accountId);
    if (!loader) {
      loader = (maxId) => this.api.getAccountStatuses(accountId, { maxId, limit: PAGE });
      this.loaders.set(accountId, loader);
    }
    return loader;
  }

  protected retry(): void {
    const key = this.key();
    this.store.fetchValue(this.profile(), () => this.fetch(key));
  }
}

/** One search request; posts render as cards, people and tags as links. */
@Component({
  selector: 'app-lite-search',
  imports: [FormsModule, LiteStatus, MbButton, RouterLink, StatusCard, TranslocoPipe],
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
    @if (q()) {
      @let s = results()();
      <app-lite-status
        [loading]="s.loading"
        [refreshing]="s.loading && !!s.value"
        [failed]="s.failed"
        [hasContent]="!!s.value"
        [loadedAt]="s.loadedAt"
        (retry)="retry()"
      />
      @if (s.value; as r) {
        @if (!r.accounts.length && !r.hashtags.length && !r.statuses.length) {
          <p class="lite-intro muted">{{ 'lite.noResults' | transloco }}</p>
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
          @for (p of r.statuses; track p.id) {
            <app-status-card [status]="p" filterContext="public" />
          }
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
  protected readonly q = queryParam('q');
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly store = inject(LiteStore);
  protected query = this.q();
  private readonly fetch = (key: string): Observable<SearchResults> => {
    const q = key.slice('search:'.length);
    return q
      ? this.api.search(q, undefined, { resolve: true, limit: 10 })
      : of({ accounts: [], hashtags: [], statuses: [] });
  };
  protected readonly results = heldValue(
    computed(() => `search:${this.q().trim()}`),
    this.fetch,
  );

  /** The query lives in the address, so a search can be shared, reloaded and held. */
  protected submit(event: Event): void {
    event.preventDefault();
    const q = this.query.trim();
    if (q) void this.router.navigate(['/m/search'], { queryParams: { q } });
  }

  protected retry(): void {
    const key = `search:${this.q().trim()}`;
    this.store.fetchValue(this.results(), () => this.fetch(key));
  }
}

/** Direct messages: each conversation's latest post, newest first. Replies happen on the card. */
@Component({
  selector: 'app-lite-conversations',
  imports: [LiteStatus, MbButton, StatusCard, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.conversations' | transloco }}</h1>
    @let s = held();
    <app-lite-status
      [loading]="s.loading"
      [refreshing]="s.refreshing"
      [failed]="s.failed"
      [hasContent]="s.items.length > 0"
      [loadedAt]="s.loadedAt"
      (retry)="retry()"
    />
    @for (c of s.items; track c.id) {
      @if (c.last_status) {
        <app-status-card [status]="c.last_status" filterContext="thread" />
      }
    }
    @if (s.items.length && !s.failed && !s.refreshing) {
      @if (s.loading) {
        <app-lite-status [loading]="true" />
      } @else if (!s.done) {
        <button mbButton variant="outline" type="button" class="lite-more" (click)="more()">
          {{ 'lite.feed.more' | transloco }}
        </button>
      }
    }`,
})
export class LiteConversations {
  private readonly api = inject(Api);
  private readonly store = inject(LiteStore);
  private readonly loader: PageLoader<{ id: string; last_status: Status | null }> = (cursor) =>
    this.api.conversations(cursor, PAGE).pipe(map(byLastId));
  private readonly state = this.store.pagedState('conversations', this.loader);
  protected readonly held = computed(() => this.state());

  constructor() {
    onRefresh(() => this.store.reload(this.state, this.loader));
  }

  protected more(): void {
    this.store.more(this.state, this.loader);
  }

  protected retry(): void {
    if (this.state().items.length) this.store.reload(this.state, this.loader);
    else this.store.more(this.state, this.loader);
  }
}
