import { AccountName } from '../accounts/account-name';
import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Status } from '../platform/api/models';
import { MbButton } from '../design-system/button/button';
import { MbContentState } from '../design-system/content-state/content-state';
import { BlogSettingsLink } from './blog-header';
import { readerRouteId } from '../reading/read/reader-route-id';
import { accountRoutePath } from '../accounts/account-route';
import { qualifiedHandle } from '../accounts/account-handle';
import { BlogPost, blogPostId, collectBlogPosts, readingMinutes } from './blog-classifier';
import { BlogPrefs } from './blog-prefs';
import { BlogAuthor, BlogPager, BlogSource, parseBlogHandle } from './blog-source';
import { BlogCache } from './blog-cache';
import { BlogContext } from './blog-context';
import { BlogHistory } from './blog-history';

// i18n blog.page.loading: Reading {{handle}}…
// i18n blog.page.reading: Reading posts…
// i18n blog.page.coverage.partial: Blog posts from the latest {{count}} posts.
// i18n blog.page.coverage.all: Blog posts from all {{count}} public posts.
// i18n blog.page.coverage.archive: Blog posts from {{count}} archived posts.
// i18n blog.page.coverage.archiveAll: Blog posts from all {{count}} archived posts; the server has no older ones.
// i18n blog.page.profile: Profile
// i18n blog.page.moved: {{name}} has moved to a new account.
// i18n blog.page.moved.go: Open the new blog
// i18n blog.page.write: Write a post
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
 * `/blog/@user@server` is the shareable address and works anonymously.
 * `/blog/me` is the signed-in reader's own blog under a fixed address, so the
 * Mine tab can light up.
 */
@Component({
  selector: 'app-blog-page',
  imports: [
    AccountName,
    DatePipe,
    RouterLink,
    TranslocoPipe,
    MbButton,
    MbContentState,
    BlogSettingsLink,
  ],
  templateUrl: './blog-page.html',
  styleUrl: './blog-page.css',
})
export class BlogPage {
  private readonly route = inject(ActivatedRoute);
  private readonly source = inject(BlogSource);
  private readonly prefs = inject(BlogPrefs);
  private readonly destroyRef = inject(DestroyRef);
  private readonly context = inject(BlogContext);
  private readonly history = inject(BlogHistory);
  private readonly cache = inject(BlogCache);

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
  /** Your own blog gets a Write button; nobody else's does. */
  protected readonly isMine = computed(
    () => this.source.ownHandle()?.toLowerCase() === this.handle().toLowerCase(),
  );
  /** Where a moved account went, as a blog address. */
  protected readonly movedTo = computed(() => {
    const moved = this.author()?.account.moved;
    return moved ? qualifiedHandle(moved) : null;
  });

  /** Guards against a slow answer for the blog the reader already left. */
  private generation = 0;
  private pager: BlogPager | null = null;
  /** Where the posts came from: the coverage line says "archived" on Native. */
  protected readonly kind = signal<'live' | 'archive'>('live');

  constructor() {
    // The post page offers previous and next from the list read here.
    effect(() => {
      const author = this.author();
      if (author) {
        this.source.remember(author.handle, this.posts());
      }
    });
    this.destroyRef.onDestroy(() => this.context.clear());
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const mine = this.route.snapshot.data?.['mine'] === true;
      const handle = mine ? this.source.ownHandle() : (params.get('handle') ?? '');
      void this.open(handle, mine);
    });
  }

  /** The post's own blog page, or the reader when it has no portable id. */
  protected postLink(post: BlogPost): (string | number)[] {
    const id = blogPostId(post.root, this.host());
    return id ? ['/blog', `@${this.handle()}`, id] : ['/read', readerRouteId(post.root)];
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
    this.context.clear();
    this.statuses.set([]);
    this.exhausted.set(false);
    this.moreFailed.set(false);
    this.pager = null;
    this.handle.set((handle ?? '').replace(/^@/, ''));
    if (!handle) {
      this.error.set(mine ? 'mine' : 'handle');
      return;
    }
    this.error.set(null);
    this.loading.set(true);
    // A blog read in the last four hours opens without a request.
    const parsed = parseBlogHandle(handle);
    const cached = parsed ? await this.cache.get(`${parsed.user}@${parsed.host}`) : null;
    if (generation !== this.generation) {
      return;
    }
    if (cached) {
      this.show(cached.author);
      this.statuses.set(cached.statuses);
      this.exhausted.set(cached.exhausted);
      this.pager = this.source.pager(cached.author, cached.maxId);
      this.kind.set(this.pager.kind);
      this.loading.set(false);
      return;
    }
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
    this.show(author);
    await this.step(author, generation);
  }

  private show(author: BlogAuthor): void {
    this.handle.set(author.handle);
    this.author.set(author);
    this.context.show(author);
    this.history.record({
      handle: author.handle,
      name: author.account.display_name || author.account.username,
      avatar: author.account.avatar_static || author.account.avatar || '',
    });
  }

  /** Read one step's worth of pages, showing posts as they come. */
  private async step(author: BlogAuthor, generation: number): Promise<void> {
    this.loading.set(true);
    this.moreFailed.set(false);
    try {
      const pager = (this.pager ??= this.source.pager(author));
      this.kind.set(pager.kind);
      for (let page = 0; page < pager.stepPages; page++) {
        const batch = await pager.next();
        if (generation !== this.generation) {
          return;
        }
        if (!batch.length) {
          this.exhausted.set(true);
          break;
        }
        this.statuses.update((list) => [...list, ...batch]);
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
        this.save(author);
      }
    }
  }

  /** Remember what was read; the archive is local already, so only live reads. */
  private save(author: BlogAuthor): void {
    if (this.pager?.kind !== 'live' || !this.statuses().length) {
      return;
    }
    void this.cache.put(author.handle, {
      author,
      statuses: this.statuses(),
      exhausted: this.exhausted(),
      maxId: this.pager.cursor(),
    });
  }
}
