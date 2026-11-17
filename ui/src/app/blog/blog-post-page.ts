import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Status } from '../platform/api/models';
import { CustomEmojiPipe } from '../publishing/custom-emoji.pipe';
import { HumanTimePipe } from '../i18n/human-time.pipe';
import { MbButton } from '../design-system/button/button';
import { MbContentState } from '../design-system/content-state/content-state';
import { Compose } from '../publishing/compose/compose';
import { Auth } from '../platform/session/auth';
import { readerChain } from '../reading/read/reader-document';
import { readerRouteId } from '../reading/read/reader-route-id';
import {
  BlogPost,
  blogPostId,
  blogTitle,
  proseLength,
  readingMinutes,
  withoutTitleLine,
} from './blog-classifier';
import { BlogAuthor, BlogSource } from './blog-source';
import { BlogContext } from './blog-context';

// i18n blog.post.loading: Opening the post…
// i18n blog.post.back: All posts by {{name}}
// i18n blog.post.reader: Open in the reader
// i18n blog.post.original: Original post
// i18n blog.post.comments: Comments
// i18n blog.post.reply: Reply
// i18n blog.post.join: Reply on Mastodon
// i18n blog.post.placeholder: Write a reply…
// i18n blog.post.placeholderFirst: Be the first to reply…
// i18n blog.post.replyingTo.composer: Replying to {{name}}
// i18n blog.post.cancelReply: Cancel
// i18n blog.post.preparing: Getting the reply box ready…
// i18n blog.post.partReply: Reply to this part in the thread
// i18n blog.post.author: Author
// i18n blog.post.replyingTo: replying to {{name}}
// i18n blog.post.newer: Newer: {{title}}
// i18n blog.post.older: Older: {{title}}
// i18n blog.post.error: Couldn't open this post
// i18n blog.post.error.hint: It may have been deleted, or {{host}} doesn't share it with visitors who aren't signed in.

interface Comment {
  status: Status;
  byAuthor: boolean;
  /** Whom it answers, when that is not the post itself. */
  replyingTo: string | null;
}

/**
 * One blog post: a storm or long post read as an article, with the replies
 * below as comments (spec/sprint/blog-2026-11.md, sprint 3).
 *
 * Deliberately not the reader. The reader pages a document like a book; a
 * blog post scrolls, and its comments belong underneath it. The reader stays
 * one link away for anyone who wants its tools.
 *
 * Comments are flat and oldest first — there is no tree view yet (owner,
 * 2026-11-17). Only public and unlisted replies are shown.
 */
@Component({
  selector: 'app-blog-post-page',
  imports: [
    DatePipe,
    RouterLink,
    TranslocoPipe,
    CustomEmojiPipe,
    HumanTimePipe,
    MbButton,
    MbContentState,
    Compose,
  ],
  templateUrl: './blog-post-page.html',
  styleUrl: './blog-post-page.css',
})
export class BlogPostPage {
  private readonly route = inject(ActivatedRoute);
  private readonly source = inject(BlogSource);
  private readonly destroyRef = inject(DestroyRef);
  private readonly context = inject(BlogContext);
  private readonly auth = inject(Auth);

  /** Replying needs a Mastodon account; everyone else gets a link out. */
  protected readonly canComment = !this.auth.lacksMastodonToken;
  /** A comment being answered; null means the post itself (its last part). */
  protected readonly replyTo = signal<Status | null>(null);
  protected readonly target = computed(() => this.replyTo() ?? this.chain().at(-1) ?? null);
  /** The target's id on the reader's server, which the composer replies to. */
  protected readonly replyId = signal<string | null>(null);
  protected readonly preparing = signal(false);
  private replySeq = 0;

  protected readonly handle = signal('');
  protected readonly author = signal<BlogAuthor | null>(null);
  protected readonly chain = signal<Status[]>([]);
  protected readonly comments = signal<Comment[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  protected readonly root = computed(() => this.chain()[0] ?? null);
  protected readonly host = computed(() => this.handle().split('@')[1] ?? '');
  protected readonly title = computed(() => {
    const root = this.root();
    return root ? blogTitle(root) : '';
  });
  protected readonly minutes = computed(() => readingMinutes(proseLength(this.chain())));
  protected readonly authorName = computed(() => {
    const account = this.author()?.account;
    return account?.display_name || account?.username || `@${this.handle()}`;
  });

  /** Newer and older posts from the blog list this reader just came from. */
  protected readonly neighbours = computed(() => {
    const root = this.root();
    const list = this.source.remembered(this.handle());
    if (!root || !list) {
      return { newer: null, older: null };
    }
    const id = blogPostId(root, this.host());
    const at = list.findIndex((post) => blogPostId(post.root, this.host()) === id);
    return at < 0
      ? { newer: null, older: null }
      : { newer: list[at - 1] ?? null, older: list[at + 1] ?? null };
  });

  private generation = 0;

  constructor() {
    effect(() => {
      const target = this.target();
      const author = this.author();
      void this.prepareReply(author, target);
    });
    this.destroyRef.onDestroy(() => this.context.clear());
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      void this.open((params.get('handle') ?? '').replace(/^@/, ''), params.get('id') ?? '');
    });
  }

  /** The title line is the page's heading; the first post loses it below. */
  protected body(post: Status, index: number): string {
    return index === 0 ? withoutTitleLine(post.content ?? '') : (post.content ?? '');
  }

  protected postLink(post: BlogPost): (string | number)[] {
    const id = blogPostId(post.root, this.host());
    return id ? ['/blog', `@${this.handle()}`, id] : ['/read', readerRouteId(post.root)];
  }

  protected titleOf(post: BlogPost): string {
    return post.title || '…';
  }

  protected threadLink(status: Status): (string | number)[] {
    return ['/statuses', readerRouteId(status)];
  }

  protected answer(comment: Comment): void {
    this.replyTo.set(comment.status);
    setTimeout(() =>
      document.getElementById('blog-composer')?.scrollIntoView?.({ block: 'center' }),
    );
  }

  protected onPosted(status: Status): void {
    const answering = this.replyTo();
    const author = this.author();
    this.comments.update((list) => [
      ...list,
      {
        status,
        byAuthor:
          !!author && this.source.ownHandle()?.toLowerCase() === author.handle.toLowerCase(),
        replyingTo: answering ? answering.account.display_name || answering.account.username : null,
      },
    ]);
    this.replyTo.set(null);
  }

  private async prepareReply(author: BlogAuthor | null, target: Status | null): Promise<void> {
    const seq = ++this.replySeq;
    this.replyId.set(null);
    if (!this.canComment || !author || !target) {
      return;
    }
    this.preparing.set(true);
    try {
      const id = await this.source.localStatusId(author, target);
      if (seq === this.replySeq) {
        this.replyId.set(id);
      }
    } catch {
      // The reader keeps the link to the thread.
    } finally {
      if (seq === this.replySeq) {
        this.preparing.set(false);
      }
    }
  }

  protected readerLink(status: Status): (string | number)[] {
    return ['/read', readerRouteId(status)];
  }

  private async open(handle: string, id: string): Promise<void> {
    const generation = ++this.generation;
    this.handle.set(handle);
    this.author.set(null);
    this.chain.set([]);
    this.comments.set([]);
    this.replyTo.set(null);
    this.failed.set(false);
    this.loading.set(true);
    try {
      const author = await this.source.resolve(handle);
      const { status, thread } = await this.source.thread(author, id);
      if (generation !== this.generation) {
        return;
      }
      const chain = readerChain(thread, status.id);
      this.handle.set(author.handle);
      this.author.set(author);
      this.context.show(author, id);
      this.chain.set(chain);
      this.comments.set(commentsOf(thread, chain, author.account.id));
    } catch {
      if (generation === this.generation) {
        this.failed.set(true);
      }
    } finally {
      if (generation === this.generation) {
        this.loading.set(false);
      }
    }
  }
}

/** Every public reply after the post's start that is not part of the post, oldest first. */
export function commentsOf(thread: Status[], chain: Status[], authorId: string): Comment[] {
  if (!chain.length) {
    return [];
  }
  const inChain = new Set(chain.map((post) => post.id));
  const byId = new Map(thread.map((post) => [post.id, post]));
  const start = thread.indexOf(chain[0]);
  return thread
    .slice(start + 1)
    .filter(
      (post) =>
        !inChain.has(post.id) &&
        !post.reblog &&
        (post.visibility === 'public' || post.visibility === 'unlisted'),
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((post) => {
      const parent = post.in_reply_to_id ? byId.get(post.in_reply_to_id) : undefined;
      return {
        status: post,
        byAuthor: post.account.id === authorId,
        replyingTo:
          parent && !inChain.has(parent.id)
            ? parent.account.display_name || parent.account.username
            : null,
      };
    });
}
