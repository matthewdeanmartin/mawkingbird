import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { Status } from '../../models';
import { AnonymousBookmarks } from '../../providers/anonymous/anonymous-bookmarks';
import {
  RaindropBookmark,
  RaindropCollection,
  RaindropSession,
} from '../../providers/raindrop/raindrop-session';
import { StatusCard } from '../../status-card/status-card';
import { BookmarkGroup, groupByAuthor, groupByHashtag, withMedia } from './bookmark-groups';
import { PageDiagnostics } from '../../page-diagnostics';
import { BlueskyApi } from '../../providers/bluesky/bluesky-api';
import { adaptPost } from '../../providers/bluesky/bluesky-adapter';
import { BskyRef, isBskyPostView } from '../../providers/bluesky/bluesky-types';

type BookmarkProvider = 'native' | 'raindrop';
type LibraryView = 'all' | 'authors' | 'hashtags' | 'media';

const PAGE_SIZE = 20;

// i18n pages.bookmarks.provider: Bookmark provider
// i18n pages.bookmarks.native: Native
// i18n pages.bookmarks.raindrop: Raindrop
// i18n pages.bookmarks.filterLabel: Filter bookmarks
// i18n pages.bookmarks.filter: Filter
// i18n pages.bookmarks.clear: Clear
// i18n pages.bookmarks.loading: Loading…
// i18n pages.bookmarks.nativeFolders: Native synthetic folders
// i18n pages.bookmarks.emptyNative: You haven't bookmarked anything here.
// i18n pages.bookmarks.noFilterMatch: No bookmarks on this page match that filter.
// i18n pages.bookmarks.emptyGroup: Nothing here.
// i18n pages.bookmarks.raindropFolders: Raindrop folders
// i18n pages.bookmarks.all: All
// i18n pages.bookmarks.emptyRaindrop: No Raindrop bookmarks in this folder.
// i18n pages.bookmarks.pagesNav: Bookmark pages
// i18n pages.bookmarks.first: First
// i18n pages.bookmarks.previous: Previous
// i18n pages.bookmarks.next: Next
// i18n pages.bookmarks.filterHint.native: Filters only the {{count}} Native bookmarks on this page.
// i18n pages.bookmarks.filterHint.raindrop: Sent to Raindrop.io; text and Raindrop search operators are supported.
// i18n pages.bookmarks.groupHeading: {{label}} ({{count}})
// i18n pages.bookmarks.moving: Moving…
// i18n pages.bookmarks.moveToRaindrop: Move to Raindrop
// i18n pages.bookmarks.moveToNative: Move to Native
// i18n pages.bookmarks.pageNumber: Page {{page}}
// i18n pages.bookmarks.placeholder.native: Words or author on this page
// i18n pages.bookmarks.placeholder.raindrop: Search Raindrop
/** A bounded, two-provider bookmark library with client-side shelves for Native. */
@Component({
  selector: 'app-bookmarks',
  imports: [StatusCard, TranslocoPipe],
  templateUrl: './bookmarks.html',
  styleUrl: './bookmarks.css',
})
export class Bookmarks implements OnInit {
  private api = inject(Api);
  protected auth = inject(Auth);
  private anonymousBookmarks = inject(AnonymousBookmarks);
  protected raindrop = inject(RaindropSession);
  private diagnostics = inject(PageDiagnostics);
  private blueskyApi = inject(BlueskyApi);

  protected provider = signal<BookmarkProvider>('native');
  protected statuses = signal<Status[]>([]);
  protected loading = signal(true);
  protected loadingMore = signal(false);
  protected exhausted = signal(false);
  protected view = signal<LibraryView>('all');
  protected message = signal<string | null>(null);
  protected error = signal<string | null>(null);
  protected busy = signal<string | null>(null);
  protected filterDraft = signal('');
  protected nativeFilter = signal('');
  protected raindropFilter = signal('');

  private nativePages = signal<Status[][]>([]);
  private blueskyPageCursors = signal<(string | null)[]>([]);
  protected nativePage = signal(0);

  protected collections = signal<RaindropCollection[]>([]);
  protected raindropBookmarks = signal<RaindropBookmark[]>([]);
  protected raindropCollection = signal(0);
  protected raindropPage = signal(0);
  protected raindropLoading = signal(false);
  protected raindropHasNext = signal(false);

  protected readonly views: { id: LibraryView; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'authors', label: 'By author' },
    { id: 'hashtags', label: 'By hashtag' },
    { id: 'media', label: 'With media' },
  ];

  protected filteredStatuses = computed(() => {
    const query = this.nativeFilter().toLocaleLowerCase();
    return query
      ? this.statuses().filter((status) => searchableStatus(status).includes(query))
      : this.statuses();
  });

  protected groups = computed<BookmarkGroup[]>(() => {
    switch (this.view()) {
      case 'authors':
        return groupByAuthor(this.filteredStatuses());
      case 'hashtags':
        return groupByHashtag(this.filteredStatuses());
      case 'media':
        return [{ label: 'With media', statuses: withMedia(this.filteredStatuses()) }];
      default:
        return [{ label: '', statuses: this.filteredStatuses() }];
    }
  });

  ngOnInit(): void {
    if (this.auth.isAnonymous) {
      const bookmarks = this.anonymousBookmarks.bookmarks().slice(0, PAGE_SIZE);
      this.nativePages.set([bookmarks]);
      this.statuses.set(bookmarks);
      this.loading.set(false);
      this.exhausted.set(true);
    } else {
      this.loadNativePage(0);
    }
    if (this.raindrop.connected()) {
      void this.loadRaindropCollections();
    }
  }

  protected selectProvider(provider: BookmarkProvider): void {
    this.provider.set(provider);
    this.filterDraft.set(provider === 'native' ? this.nativeFilter() : this.raindropFilter());
    this.message.set(null);
    this.error.set(null);
    if (provider === 'raindrop' && !this.raindropBookmarks().length) {
      void this.loadRaindropPage(0);
    }
  }

  protected applyFilter(event?: Event): void {
    event?.preventDefault();
    const query = this.filterDraft().trim();
    if (this.provider() === 'native') {
      this.nativeFilter.set(query);
      return;
    }
    this.raindropFilter.set(query);
    void this.loadRaindropPage(0);
  }

  protected clearFilter(): void {
    this.filterDraft.set('');
    if (this.provider() === 'native') {
      this.nativeFilter.set('');
      return;
    }
    this.raindropFilter.set('');
    void this.loadRaindropPage(0);
  }

  protected selectRaindropCollection(id: number): void {
    if (id === this.raindropCollection()) return;
    this.raindropCollection.set(id);
    this.raindropBookmarks.set([]);
    void this.loadRaindropPage(0);
  }

  protected firstPage(): void {
    if (this.provider() === 'raindrop') {
      void this.loadRaindropPage(0);
      return;
    }
    this.showNativePage(0);
  }

  protected previousPage(): void {
    if (this.provider() === 'raindrop') {
      void this.loadRaindropPage(Math.max(0, this.raindropPage() - 1));
      return;
    }
    this.showNativePage(Math.max(0, this.nativePage() - 1));
  }

  protected nextPage(): void {
    if (this.provider() === 'raindrop') {
      if (this.raindropHasNext()) void this.loadRaindropPage(this.raindropPage() + 1);
      return;
    }
    const next = this.nativePage() + 1;
    if (this.nativePages()[next]) {
      this.showNativePage(next);
    } else if (!this.exhausted()) {
      this.loadNativePage(next);
    }
  }

  /** Backward-compatible alias for callers from the old load-more footer. */
  loadMore(): void {
    this.nextPage();
  }

  protected async moveNativeToRaindrop(status: Status): Promise<void> {
    const key = `native:${status.id}`;
    if (this.busy()) return;
    this.busy.set(key);
    this.clearNotice();
    try {
      await this.raindrop.addBookmark(status, 'post');
      if (this.auth.isAnonymous) {
        this.anonymousBookmarks.toggle(status);
      } else if (status.provider === 'bluesky') {
        await firstValueFrom(this.blueskyApi.deleteBookmark((status.providerRef as BskyRef).uri));
      } else {
        await firstValueFrom(this.api.unbookmark(status.id));
      }
      this.removeNative(status.id);
      this.message.set('Moved to Raindrop.io.');
    } catch (error) {
      this.diagnostics.error('Bookmarks', 'move-to-raindrop:error', error);
      this.error.set(describeError(error, "Couldn't move that bookmark to Raindrop.io."));
    } finally {
      this.busy.set(null);
    }
  }

  protected async moveRaindropToNative(bookmark: RaindropBookmark): Promise<void> {
    const key = `raindrop:${bookmark._id}`;
    if (this.busy()) return;
    this.busy.set(key);
    this.clearNotice();
    try {
      if (this.auth.isAnonymous) {
        throw new Error('Sign in to Mastodon to turn a Raindrop link into a native bookmark.');
      }
      if (this.auth.isBlueskyPrimary) {
        const native = await this.bookmarkBlueskyUrl(bookmark.link);
        await this.raindrop.removeBookmark(bookmark._id);
        this.raindropBookmarks.update((items) => items.filter((item) => item._id !== bookmark._id));
        this.prependNative(native);
        this.message.set('Moved to Bluesky bookmarks.');
        return;
      }
      const result = await firstValueFrom(
        this.api.search(bookmark.link, 'statuses', { resolve: true, limit: 5 }),
      );
      const status = result.statuses.find((candidate) => sameUrl(candidate.url, bookmark.link));
      if (!status) {
        throw new Error('That Raindrop is not a Mastodon post this server can resolve.');
      }
      const native = status.bookmarked
        ? status
        : await firstValueFrom(this.api.bookmark(status.id));
      await this.raindrop.removeBookmark(bookmark._id);
      this.raindropBookmarks.update((items) => items.filter((item) => item._id !== bookmark._id));
      this.prependNative(native);
      this.message.set('Moved to Native bookmarks.');
    } catch (error) {
      this.diagnostics.error('Bookmarks', 'move-to-native:error', error);
      this.error.set(describeError(error, "Couldn't move that bookmark to Native."));
    } finally {
      this.busy.set(null);
    }
  }

  onChanged(updated: Status): void {
    if (!updated.bookmarked) {
      this.removeNative(updated.id);
      return;
    }
    this.statuses.update((list) =>
      list.map((status) => (status.id === updated.id ? updated : status)),
    );
    this.nativePages.update((pages) =>
      pages.map((page) => page.map((status) => (status.id === updated.id ? updated : status))),
    );
  }

  onDeleted(removed: Status): void {
    this.removeNative(removed.id);
  }

  private loadNativePage(index: number): void {
    if (this.auth.isBlueskyPrimary) {
      this.loadBlueskyPage(index);
      return;
    }
    const previous = index === 0 ? undefined : this.nativePages()[index - 1]?.at(-1)?.id;
    if (index > 0 && !previous) return;
    this.loadingMore.set(index > 0);
    if (index === 0) this.loading.set(true);
    this.api.bookmarks(previous, PAGE_SIZE).subscribe({
      next: (bookmarks) => {
        this.nativePages.update((pages) => {
          const next = pages.slice(0, index);
          next[index] = bookmarks;
          return next;
        });
        this.nativePage.set(index);
        this.statuses.set(bookmarks);
        this.exhausted.set(bookmarks.length < PAGE_SIZE);
        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadingMore.set(false);
        this.error.set("Couldn't load Native bookmarks.");
      },
    });
  }

  private loadBlueskyPage(index: number): void {
    const cursor = index === 0 ? null : this.blueskyPageCursors()[index - 1];
    if (index > 0 && !cursor) return;
    this.loadingMore.set(index > 0);
    if (index === 0) this.loading.set(true);
    this.blueskyApi.getBookmarks(cursor, PAGE_SIZE).subscribe({
      next: (page) => {
        const bookmarks = page.bookmarks
          .map((bookmark) => bookmark.item)
          .filter(isBskyPostView)
          .map((post) => ({ ...adaptPost(post), bookmarked: true }));
        this.nativePages.update((pages) => {
          const next = pages.slice(0, index);
          next[index] = bookmarks;
          return next;
        });
        this.blueskyPageCursors.update((cursors) => {
          const next = cursors.slice(0, index);
          next[index] = page.cursor ?? null;
          return next;
        });
        this.nativePage.set(index);
        this.statuses.set(bookmarks);
        this.exhausted.set(!page.cursor);
        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadingMore.set(false);
        this.error.set("Couldn't load Bluesky bookmarks.");
      },
    });
  }

  private async bookmarkBlueskyUrl(url: string): Promise<Status> {
    const match = /^https:\/\/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/.exec(url);
    if (!match) throw new Error('That Raindrop is not a Bluesky post.');
    const actor = decodeURIComponent(match[1]);
    const rkey = match[2];
    const did = actor.startsWith('did:')
      ? actor
      : (await firstValueFrom(this.blueskyApi.resolveHandle(actor))).did;
    const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
    const result = await firstValueFrom(this.blueskyApi.getPosts([uri]));
    const post = result.posts[0];
    if (!post) throw new Error('That Bluesky post is unavailable.');
    await firstValueFrom(this.blueskyApi.createBookmark(post.uri, post.cid));
    return { ...adaptPost(post), bookmarked: true };
  }

  private showNativePage(index: number): void {
    const page = this.nativePages()[index];
    if (!page) return;
    this.nativePage.set(index);
    this.statuses.set(page);
    this.exhausted.set(page.length < PAGE_SIZE);
  }

  private async loadRaindropCollections(): Promise<void> {
    try {
      this.collections.set(await this.raindrop.collections(3));
    } catch (error) {
      this.diagnostics.error('Bookmarks', 'load:raindrop-collections-error', error);
      this.error.set(describeError(error, "Couldn't load Raindrop.io folders."));
    }
  }

  private async loadRaindropPage(page: number): Promise<void> {
    if (this.raindropLoading()) return;
    this.raindropLoading.set(true);
    this.clearNotice();
    try {
      const bookmarks = await this.raindrop.bookmarks(
        this.raindropCollection(),
        page,
        PAGE_SIZE,
        this.raindropFilter(),
      );
      this.raindropBookmarks.set(bookmarks);
      this.raindropPage.set(page);
      this.raindropHasNext.set(bookmarks.length === PAGE_SIZE);
    } catch (error) {
      this.diagnostics.error('Bookmarks', 'load:raindrop-page-error', error, { page });
      this.error.set(describeError(error, "Couldn't load Raindrop.io bookmarks."));
    } finally {
      this.raindropLoading.set(false);
    }
  }

  private removeNative(id: string): void {
    this.statuses.update((list) => list.filter((status) => status.id !== id));
    this.nativePages.update((pages) =>
      pages.map((page) => page.filter((status) => status.id !== id)),
    );
  }

  private prependNative(status: Status): void {
    this.nativePages.update((pages) => {
      const first = [status, ...(pages[0] ?? []).filter((item) => item.id !== status.id)].slice(
        0,
        PAGE_SIZE,
      );
      return [first, ...pages.slice(1)];
    });
    if (this.nativePage() === 0) this.statuses.set(this.nativePages()[0]);
  }

  private clearNotice(): void {
    this.message.set(null);
    this.error.set(null);
  }
}

function sameUrl(left: string | null, right: string): boolean {
  return left?.replace(/\/$/, '') === right.replace(/\/$/, '');
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function searchableStatus(status: Status): string {
  const target = status.reblog ?? status;
  return [
    target.account.acct,
    target.account.username,
    target.account.display_name,
    target.spoiler_text,
    target.content.replace(/<[^>]*>/g, ' '),
  ]
    .join(' ')
    .toLocaleLowerCase();
}
