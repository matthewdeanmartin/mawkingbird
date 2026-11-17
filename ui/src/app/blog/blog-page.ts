import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Status } from '../platform/api/models';
import { MbButton } from '../design-system/button/button';
import { MbContentState } from '../design-system/content-state/content-state';
import { readerRouteId } from '../reading/read/reader-route-id';
import { accountRoutePath } from '../accounts/account-route';
import { BlogPost, collectBlogPosts, readingMinutes } from './blog-classifier';
import { BlogPrefs } from './blog-prefs';
import { BlogAuthor, BlogSource, pagingId } from './blog-source';

/** Pages of 40 read per step: two hundred posts, about five requests. */
export const BLOG_STEP_PAGES = 5;

// i18n blog.page.loading: Reading {{handle}}…
// i18n blog.page.reading: Reading posts…
// i18n blog.page.coverage.partial: Blog posts from the latest {{count}} posts.
// i18n blog.page.coverage.all: Blog posts from all {{count}} public posts.
// i18n blog.page.more: Look further back
// i18n blog.page.profile: Profile
// i18n blog.page.rules: What counts
// i18n blog.page.untitled: Untitled
// i18n blog.page.meta.posts: {{count}} posts
// i18n blog.page.meta.minutes: {{count}} min read
// i18n blog.page.meta.continued: continues an older post
// i18n blog.page.via.local: Read through your own server, which may not have every post. {{host}} does not share posts publicly.
// i18n blog.page.empty: No blog posts yet
// i18n blog.page.empty.partial: None of the latest {{count}} posts is a storm or a long post. Look further back, or change what counts.
// i18n blog.page.empty.all: None of this account's {{count}} public posts is a storm or a long post.
// i18n blog.page.error.handle: That is not a full handle
// i18n blog.page.error.handle.hint: A blog address needs the user and their server, like @alice@example.social.
// i18n blog.page.error.notFound: Couldn't open this blog
// i18n blog.page.error.notFound.hint: {{host}} didn't answer for {{handle}}, or doesn't share its posts with visitors who aren't signed in.
// i18n blog.page.error.mine: Sign in to see your own blog
// i18n blog.page.error.mine.hint: My blog is your Mastodon account read as a blog.
// i18n blog.page.error.more: Couldn't read further back. Try again in a moment.

type BlogError = 'handle' | 'notFound' | 'mine' | null;

/**
 * One person's Mastodon posts, read as a blog: their storms and long posts,
 * newest first (spec/sprint/blog-2026-11.md, sprint 2).
 *
 * `/blogs/@user@server` is the shareable address and works anonymously.
 * `/blogs/me` is the signed-in reader's own blog under a fixed address, so the
 * Mine tab can light up.
 */
@Component({
  selector: 'app-blog-page',
  imports: [DatePipe, RouterLink, TranslocoPipe, MbButton, MbContentState],
  templateUrl: './blog-page.html',
  styleUrl: './blog-page.css',
})
export class BlogPage {
  private readonly route = inject(ActivatedRoute);
  private readonly source = inject(BlogSource);
  private readonly prefs = inject(BlogPrefs);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly handle = signal('');
  protected readonly author = signal<BlogAuthor | null>(null);
  protected readonly error = signal<BlogError>(null);
  protected readonly moreFailed = signal(false);
  protected readonly loading = signal(false);
  protected readonly statuses = signal<Status[]>([]);
  protected readonly exhausted = signal(false);

  protected readonly scan = computed(() => {
    const author = this.author();
    return author
      ? collectBlogPosts(
          this.statuses(),
          author.account.id,
          this.prefs.thresholds(),
          this.exhausted(),
        )
      : { posts: [], pendingOlder: 0 };
  });
  protected readonly posts = computed(() => this.scan().posts);
  protected readonly host = computed(() => this.handle().split('@')[1] ?? '');
  protected readonly profileLink = computed(() => accountRoutePath({ handle: this.handle() }));

  /** Guards against a slow answer for the blog the reader already left. */
  private generation = 0;
  private nextMaxId: string | undefined;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const mine = this.route.snapshot.data?.['mine'] === true;
      const handle = mine ? this.source.ownHandle() : (params.get('handle') ?? '');
      void this.open(handle, mine);
    });
  }

  protected readerLink(post: BlogPost): (string | number)[] {
    return ['/read', readerRouteId(post.root)];
  }

  protected minutes(post: BlogPost): number {
    return readingMinutes(post.chars);
  }

  protected async more(): Promise<void> {
    const author = this.author();
    if (author) {
      await this.step(author, this.generation);
    }
  }

  private async open(handle: string | null, mine: boolean): Promise<void> {
    const generation = ++this.generation;
    this.author.set(null);
    this.statuses.set([]);
    this.exhausted.set(false);
    this.moreFailed.set(false);
    this.nextMaxId = undefined;
    this.handle.set((handle ?? '').replace(/^@/, ''));
    if (!handle) {
      this.error.set(mine ? 'mine' : 'handle');
      return;
    }
    this.error.set(null);
    this.loading.set(true);
    let author: BlogAuthor;
    try {
      author = await this.source.resolve(handle);
    } catch (error) {
      if (generation === this.generation) {
        this.loading.set(false);
        this.error.set((error as Error)?.message === 'not-a-handle' ? 'handle' : 'notFound');
      }
      return;
    }
    if (generation !== this.generation) {
      return;
    }
    this.handle.set(author.handle);
    this.author.set(author);
    await this.step(author, generation);
  }

  /** Read up to {@link BLOG_STEP_PAGES} more pages, showing posts as they come. */
  private async step(author: BlogAuthor, generation: number): Promise<void> {
    this.loading.set(true);
    this.moreFailed.set(false);
    try {
      for (let page = 0; page < BLOG_STEP_PAGES; page++) {
        const batch = await this.source.page(author, this.nextMaxId);
        if (generation !== this.generation) {
          return;
        }
        if (!batch.length) {
          this.exhausted.set(true);
          break;
        }
        this.statuses.update((list) => [...list, ...batch]);
        this.nextMaxId = pagingId(batch[batch.length - 1]);
      }
    } catch {
      if (generation === this.generation) {
        if (this.statuses().length) {
          this.moreFailed.set(true);
        } else {
          this.error.set('notFound');
        }
      }
    } finally {
      if (generation === this.generation) {
        this.loading.set(false);
      }
    }
  }
}
