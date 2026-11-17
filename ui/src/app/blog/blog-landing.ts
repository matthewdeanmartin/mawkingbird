import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Status } from '../platform/api/models';
import { Drafts } from '../publishing/drafts';
import { MbButton } from '../design-system/button/button';
import { BlogHeader } from './blog-header';
import { MbRadioGroup } from '../design-system/radio-group/radio-group';
import { BlogPrefs } from './blog-prefs';
import { BlogHistory } from './blog-history';
import { BlogSource } from './blog-source';
import { BlogCache } from './blog-cache';
import { BlogPost, blogPostId, collectBlogPosts, commentEstimate } from './blog-classifier';
import { blogVerdict, bodyTitle } from './blog-write';

// i18n blog.landing.title: Blog
// i18n blog.landing.write: Write a post
// i18n blog.landing.intro: Mastodon, read as blogs: storms and long posts are the posts, replies are the comments.
// i18n blog.landing.glance: At a glance
// i18n blog.landing.glance.posts: {{count}} blog posts in your latest {{scanned}} posts
// i18n blog.landing.glance.latest: Latest: {{date}}
// i18n blog.landing.glance.comments: {{count}} comments on them
// i18n blog.landing.glance.loading: Reading your posts…
// i18n blog.landing.glance.failed: Couldn't read your posts just now.
// i18n blog.landing.mine: View your blog
// i18n blog.landing.recent: Your recent posts
// i18n blog.landing.recent.none: Nothing yet. A storm or a long post will show up here.
// i18n blog.landing.comments: {{count}} comments
// i18n blog.landing.drafts: Drafts
// i18n blog.landing.drafts.ready: ready to post as a blog post
// i18n blog.landing.drafts.notYet: not a blog post yet
// i18n blog.landing.drafts.untitled: Untitled draft
// i18n blog.landing.drafts.all: All drafts
// i18n blog.landing.drafts.show: Show
// i18n blog.landing.drafts.long: Long
// i18n blog.landing.drafts.short: Short
// i18n blog.landing.drafts.every: All
// i18n blog.landing.drafts.noneLong: No long drafts. Short ones are under Short.
// i18n blog.landing.drafts.noneShort: No short drafts.
// i18n blog.landing.read: Recently read
// i18n blog.landing.read.none: Blogs you open show up here.

/** How many of your blog posts and drafts the dashboard lists. */
const LIST = 5;

/**
 * Blog mode's front room: a dashboard, like WordPress's. Your blog at a glance,
 * your recent posts with their comments, drafts that are close, and the blogs
 * you read. Typing a handle is a back-shed feature (owner, 2026-11-17): it
 * lives on Search.
 */
@Component({
  selector: 'app-blog-landing',
  imports: [DatePipe, RouterLink, TranslocoPipe, MbButton, MbRadioGroup, BlogHeader],
  templateUrl: './blog-landing.html',
  styleUrl: './blog-landing.css',
})
export class BlogLanding implements OnInit {
  private readonly source = inject(BlogSource);
  private readonly prefs = inject(BlogPrefs);
  private readonly drafts = inject(Drafts);
  private readonly cache = inject(BlogCache);
  protected readonly history = inject(BlogHistory);

  protected readonly mine = computed(() => this.source.ownHandle());

  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  private readonly statuses = signal<Status[]>([]);
  private readonly authorId = signal<string | null>(null);

  protected readonly posts = computed<BlogPost[]>(() => {
    const id = this.authorId();
    return id ? collectBlogPosts(this.statuses(), id, this.prefs.thresholds()).posts : [];
  });
  protected readonly scanned = computed(() => this.statuses().length);
  protected readonly comments = computed(() =>
    this.posts().reduce((sum, post) => sum + commentEstimate(post.chain), 0),
  );

  /**
   * Long, short or all. Drafts hold microblog posts too, so the dashboard
   * starts on the ones that would count as blog posts (owner, 2026-11-17).
   */
  protected readonly draftFilter = signal<'long' | 'short' | 'all'>('long');
  private readonly allDrafts = computed(() =>
    [...this.drafts.drafts()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((draft) => ({
        id: draft.id,
        title: bodyTitle(draft.segments[0] ?? ''),
        ready: blogVerdict(draft.segments, this.prefs.thresholds()).reason !== null,
      })),
  );
  protected readonly hasDrafts = computed(() => this.allDrafts().length > 0);
  /** Drafts, newest first, with whether each would count as a blog post. */
  protected readonly draftRows = computed(() => {
    const filter = this.draftFilter();
    return this.allDrafts()
      .filter((draft) => filter === 'all' || draft.ready === (filter === 'long'))
      .slice(0, LIST);
  });

  protected setDraftFilter(value: string): void {
    if (value === 'long' || value === 'short' || value === 'all') {
      this.draftFilter.set(value);
    }
  }

  ngOnInit(): void {
    const handle = this.mine();
    if (handle) {
      void this.loadOwn(handle);
    }
  }

  protected recent(): BlogPost[] {
    return this.posts().slice(0, LIST);
  }

  protected commentsOf(post: BlogPost): number {
    return commentEstimate(post.chain);
  }

  protected postLink(post: BlogPost): (string | number)[] {
    const handle = this.mine() ?? '';
    const id = blogPostId(post.root, handle.split('@')[1] ?? '');
    return id ? ['/blog', `@${handle}`, id] : ['/blog/me'];
  }

  /** One step of your own posts: enough for a glance, not a full read. */
  private async loadOwn(handle: string): Promise<void> {
    this.loading.set(true);
    try {
      // Shared with your blog page, so Desk and Mine read your posts once.
      const cached = await this.cache.get(handle);
      if (cached) {
        this.authorId.set(cached.author.account.id);
        this.statuses.set(cached.statuses);
        this.source.remember(cached.author.handle, this.posts());
        return;
      }
      const author = await this.source.resolve(handle);
      this.authorId.set(author.account.id);
      const pager = this.source.pager(author);
      let exhausted = false;
      for (let page = 0; page < pager.stepPages; page++) {
        const batch = await pager.next();
        if (!batch.length) {
          exhausted = true;
          break;
        }
        this.statuses.update((list) => [...list, ...batch]);
      }
      this.source.remember(author.handle, this.posts());
      if (pager.kind === 'live' && this.statuses().length) {
        void this.cache.put(author.handle, {
          author,
          statuses: this.statuses(),
          exhausted,
          maxId: pager.cursor(),
        });
      }
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
