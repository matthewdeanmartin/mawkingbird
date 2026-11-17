import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Status } from '../platform/api/models';
import { qualifiedHandle } from '../accounts/account-handle';
import { readerRouteId } from '../reading/read/reader-route-id';
import { MbButton } from '../design-system/button/button';
import { MbField, MbControl } from '../design-system/field/field';
import { BlogHeader } from './blog-header';
import { BlogPrefs } from './blog-prefs';
import { BlogPost, blogPostId } from './blog-classifier';
import { BlogHit, BlogSearch } from './blog-search';
import { parseBlogHandle } from './blog-source';

// i18n blog.search.title: Search
// i18n blog.search.label: Search long posts
// i18n blog.search.go: Search
// i18n blog.search.opened: In blogs you've opened
// i18n blog.search.mastodon: On Mastodon
// i18n blog.search.mastodon.text: From what your server lets you search: usually your own posts, posts you've interacted with, and people who allow search.
// i18n blog.search.mastodon.tags: Without an account this searches hashtags, so use words people tag with.
// i18n blog.search.searching: Searching…
// i18n blog.search.none: No storms or long posts found.
// i18n blog.search.failed: The search didn't go through. Try again in a moment.
// i18n blog.search.kind.storm: storm
// i18n blog.search.kind.long: long post
// i18n blog.search.kind.marked: blog post
// i18n blog.search.kind.part: part of a storm
// i18n blog.search.open: Open a blog by its handle
// i18n blog.search.handle: Handle
// i18n blog.search.handle.hint: The full handle, like @alice@example.social.
// i18n blog.search.handle.go: Open
// i18n blog.search.handle.invalid: Use the full handle, with the server: @alice@example.social.

/**
 * Search for long-form posts: storms, long posts and `BLOG:` posts
 * (spec/sprint/blog-2026-11.md, sprint 8). The query lives in `?q=`, so a
 * search can be shared and Back works.
 */
@Component({
  selector: 'app-blog-search-page',
  imports: [DatePipe, RouterLink, TranslocoPipe, MbButton, MbField, MbControl, BlogHeader],
  templateUrl: './blog-search-page.html',
  styleUrl: './blog-page.css',
})
export class BlogSearchPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly prefs = inject(BlogPrefs);
  protected readonly search = inject(BlogSearch);

  protected readonly draft = signal('');
  protected readonly query = signal('');
  protected readonly hits = signal<BlogHit[]>([]);
  protected readonly searching = signal(false);
  protected readonly failed = signal(false);
  protected readonly searched = signal(false);
  protected readonly opened = computed(() => this.search.remembered(this.query()));
  private seq = 0;

  protected readonly handle = signal('');
  protected readonly invalid = signal(false);

  protected editHandle(value: string): void {
    this.handle.set(value);
    this.invalid.set(false);
  }

  /** The back shed: open a blog by typing its handle. */
  protected openHandle(event: Event): void {
    event.preventDefault();
    const parsed = parseBlogHandle(this.handle());
    if (!parsed) {
      this.invalid.set(true);
      return;
    }
    void this.router.navigate(['/blog', `@${parsed.user}@${parsed.host}`]);
  }

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((params) => {
      const q = params.get('q') ?? '';
      this.draft.set(q);
      this.query.set(q);
      void this.run(q);
    });
  }

  protected submit(event: Event): void {
    event.preventDefault();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: this.draft().trim() || null },
    });
  }

  protected handleOf(status: Status): string {
    return qualifiedHandle(status.account) ?? status.account.acct;
  }

  protected hitLink(status: Status): (string | number)[] {
    const handle = this.handleOf(status);
    const id = blogPostId(status, handle.split('@')[1] ?? '');
    return id ? ['/blog', `@${handle}`, id] : ['/statuses', readerRouteId(status)];
  }

  protected openedLink(handle: string, post: BlogPost): (string | number)[] {
    const id = blogPostId(post.root, handle.split('@')[1] ?? '');
    return id ? ['/blog', `@${handle}`, id] : ['/blog', `@${handle}`];
  }

  private async run(q: string): Promise<void> {
    const seq = ++this.seq;
    this.hits.set([]);
    this.failed.set(false);
    this.searched.set(false);
    if (!q.trim()) {
      return;
    }
    this.searching.set(true);
    try {
      const hits = await this.search.search(q, this.prefs.thresholds());
      if (seq === this.seq) {
        this.hits.set(hits);
      }
    } catch {
      if (seq === this.seq) {
        this.failed.set(true);
      }
    } finally {
      if (seq === this.seq) {
        this.searching.set(false);
        this.searched.set(true);
      }
    }
  }
}
