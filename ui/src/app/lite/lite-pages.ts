import {
  Component,
  Signal,
  WritableSignal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, catchError, map, of } from 'rxjs';
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
import { Compose } from '../publishing/compose/compose';
import { LiteFeed, LitePageLoader, statusPages } from './lite-feed';
import { LiteNewPill } from './lite-new-pill';
import { keepPlace } from './lite-place';
import { LiteStatus } from './lite-status';
import { LiteStore, PageLoader, STALE_MS, ValueOptions, ValueState, byLastId } from './lite-store';

// i18n lite.noLists: You have no lists.
// i18n lite.searchLabel: Search posts, people and hashtags
// i18n lite.searchButton: Search
// i18n lite.people: People
// i18n lite.hashtags: Hashtags
// i18n lite.home.posted: Posted.
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
 * Page titles reuse the full app's short names (shell.nav.*, listDialog.lists,
 * pages.bookmarks.tab.bookmarks) so a screen is called the same thing in its
 * Lite nav link, its heading and the full app, in every language.
 *
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
  options: (key: string) => ValueOptions<T> = () => ({}),
): Signal<WritableSignal<ValueState<T>>> {
  const store = inject(LiteStore);
  const held = computed(() => {
    const k = key();
    return store.valueState(
      k,
      () => fetch(k),
      untracked(() => options(k)),
    );
  });
  // Coming back to a held screen: check it once if it is out of date.
  effect(() => {
    const k = key();
    const state = held();
    untracked(() =>
      store.checkValueIfStale(state, () => fetch(k), options(k).staleMs ?? STALE_MS.feed),
    );
  });
  onRefresh(() => {
    const k = key();
    store.fetchValue(held(), () => fetch(k));
  });
  return held;
}

@Component({
  selector: 'app-lite-home',
  imports: [Compose, LiteFeed, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'shell.nav.home' | transloco }}</h1>
    <!-- The quick composer, as on the full app's Home; Write is the full writer. -->
    <div class="lite-quick-compose">
      <app-compose [compact]="true" draftContext="lite-home" (posted)="posted($event)" />
      <!-- Sent, queued or still a draft must be obvious after a shaky send:
           queued posts get compose's own Outbox message and the nav count. -->
      @if (justPosted()) {
        <p class="lite-posted" role="status">{{ 'lite.home.posted' | transloco }}</p>
      }
    </div>
    <app-lite-feed key="home" [load]="load" savedPath="/api/v1/timelines/home" />`,
  styles: `
    .lite-quick-compose {
      padding: 0 16px 12px;
      border-block-end: 1px solid var(--border);
    }
    .lite-posted {
      margin: 6px 0 0;
      font-size: 14px;
      color: var(--muted);
    }
  `,
})
export class LiteHome {
  private readonly api = inject(Api);
  private readonly store = inject(LiteStore);
  protected readonly load: LitePageLoader = (maxId) => this.api.homeTimeline(maxId, PAGE);

  protected readonly justPosted = signal(false);
  private postedTimer: ReturnType<typeof setTimeout> | null = null;

  /** Show the reader's own post at the top of the held Home at once, and say it went out. */
  protected posted(status: Status): void {
    this.justPosted.set(true);
    if (this.postedTimer) clearTimeout(this.postedTimer);
    this.postedTimer = setTimeout(() => this.justPosted.set(false), 6_000);
    this.store
      .pagedState('home', statusPages(this.load), '/api/v1/timelines/home')
      .update((s) => ({ ...s, items: [status, ...s.items.filter((x) => x.id !== status.id)] }));
  }
}

@Component({
  selector: 'app-lite-bookmarks',
  imports: [LiteFeed, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'pages.bookmarks.tab.bookmarks' | transloco }}</h1>
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
  template: `<h1 class="lite-title">{{ 'listDialog.lists' | transloco }}</h1>
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
  imports: [LiteNewPill, LiteStatus, MbButton, RouterLink, StatusCard, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'shell.nav.inbox' | transloco }}</h1>
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
    <app-lite-new-pill [count]="s.incoming.length" (show)="place.showIncoming()" />
    @for (n of s.items; track n.id) {
      <section class="lite-notification" [attr.data-lite-item]="n.id">
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
  protected readonly place = keepPlace(computed(() => this.state));

  constructor() {
    onRefresh(() => this.store.reload(this.state, this.loader));
    // Coming back: check once if it is out of date.
    queueMicrotask(() => this.store.checkIfStale(this.state, this.loader, STALE_MS.feed));
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

/**
 * A post with its conversation. The post itself shows at once when the phone
 * has it (from the feed it was tapped in, or saved on disk); the replies load
 * separately, so a slow context request never hides text already on screen.
 */
@Component({
  selector: 'app-lite-thread',
  imports: [LiteStatus, StatusCard, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'lite.thread' | transloco }}</h1>
    @let f = focus()();
    @let c = context()();
    <app-lite-status
      [loading]="f.loading && !f.value"
      [refreshing]="(f.loading || c.loading) && !!f.value"
      [failed]="f.failed && !f.value"
      [fromSaved]="f.fromSaved"
      [hasContent]="!!f.value"
      [loadedAt]="f.loadedAt"
      (retry)="retry()"
    />
    @if (f.value; as post) {
      @for (p of c.value?.ancestors ?? []; track p.id) {
        <app-status-card [status]="p" filterContext="thread" />
      }
      <div class="focus">
        <app-status-card [status]="post" filterContext="thread" />
      </div>
      @for (p of c.value?.descendants ?? []; track p.id) {
        <app-status-card [status]="p" filterContext="thread" />
      }
    } @else if (f.failed) {
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
  private readonly fetchFocus = (key: string) => this.api.getStatus(key.slice('status:'.length));
  private readonly fetchContext = (key: string) =>
    this.api
      .getContext(key.slice('context:'.length))
      // Without replies the post alone still shows; that is the useful part.
      .pipe(catchError(() => of<Context>({ ancestors: [], descendants: [] })));
  protected readonly focus = heldValue<Status>(
    computed(() => `status:${this.id()}`),
    this.fetchFocus,
    (key) => {
      const id = key.slice('status:'.length);
      return { seed: this.store.knownStatus(id), savedPath: `/api/v1/statuses/${id}` };
    },
  );
  protected readonly context = heldValue<Context>(
    computed(() => `context:${this.id()}`),
    this.fetchContext,
    (key) => ({ savedPath: `/api/v1/statuses/${key.slice('context:'.length)}/context` }),
  );

  protected retry(): void {
    const id = this.id();
    this.store.fetchValue(this.focus(), () => this.fetchFocus(`status:${id}`));
    this.store.fetchValue(this.context(), () => this.fetchContext(`context:${id}`));
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
  /** The author shows at once from the post that was tapped, or from disk; details refresh when stale. */
  protected readonly profile = heldValue<Account>(this.key, this.fetch, (key) => {
    const id = key.slice('profile:'.length).split(' ')[0];
    const numeric = /^\d+$/.test(id);
    return {
      seed: numeric ? this.store.knownAccount(id) : null,
      savedPath: numeric ? `/api/v1/accounts/${id}` : undefined,
      staleMs: STALE_MS.profile,
    };
  });
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
  template: `<h1 class="lite-title">{{ 'shell.nav.search' | transloco }}</h1>
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
  imports: [LiteNewPill, LiteStatus, MbButton, StatusCard, TranslocoPipe],
  template: `<h1 class="lite-title">{{ 'shell.nav.chat' | transloco }}</h1>
    @let s = held();
    <app-lite-status
      [loading]="s.loading"
      [refreshing]="s.refreshing"
      [failed]="s.failed"
      [hasContent]="s.items.length > 0"
      [loadedAt]="s.loadedAt"
      (retry)="retry()"
    />
    <app-lite-new-pill [count]="s.incoming.length" (show)="place.showIncoming()" />
    @for (c of s.items; track c.id) {
      @if (c.last_status) {
        <app-status-card
          [attr.data-lite-item]="c.id"
          [status]="c.last_status"
          filterContext="thread"
        />
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
  protected readonly place = keepPlace(computed(() => this.state));

  constructor() {
    onRefresh(() => this.store.reload(this.state, this.loader));
    // Coming back: check once if it is out of date.
    queueMicrotask(() => this.store.checkIfStale(this.state, this.loader, STALE_MS.feed));
  }

  protected more(): void {
    this.store.more(this.state, this.loader);
  }

  protected retry(): void {
    if (this.state().items.length) this.store.reload(this.state, this.loader);
    else this.store.more(this.state, this.loader);
  }
}
