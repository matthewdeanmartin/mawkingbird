import { AccountName } from '../accounts/account-name';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbRailCard } from '../design-system/identity/rail-card';
import { MbButton } from '../design-system/button/button';
import { CustomEmojiPipe } from '../publishing/custom-emoji.pipe';
import { accountRoutePath } from '../accounts/account-route';
import { BlogContext } from './blog-context';
import { BlogHistory } from './blog-history';
import { BlogSource } from './blog-source';
import { blogPostId, BlogPost } from './blog-classifier';

// i18n blog.rail.author: About the author
// i18n blog.rail.profile: Profile
// i18n blog.rail.allPosts: All posts
// i18n blog.rail.more: More from this blog
// i18n blog.rail.recent: Recently read blogs
// i18n blog.rail.clear: Clear
// i18n blog.rail.clear.aria: Clear the list of recently read blogs

/**
 * Blog mode's rail widgets (spec/blog-mode.md › Rail widgets). Each one only
 * shortcuts something on the page itself — rails vanish in zen mode and on
 * phones — and each renders nothing when it has nothing to say.
 */

const CARD_STYLES = `
  :host { display: block; }
  /* The rails' own spacing does not reach inside these components. */
  .card { margin-bottom: 12px; }
  .card-body { padding: 10px 14px 12px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
  .muted { color: var(--muted); }
  .row { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
  .row img { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; }
  .row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

/** Left: who wrote the blog or post being read. */
@Component({
  selector: 'app-blog-author-card',
  imports: [AccountName, RouterLink, TranslocoPipe, MbRailCard, CustomEmojiPipe],
  template: `
    @if (otherAuthor(); as author) {
      <section mbRailCard class="card">
        <h2 class="card-title">{{ 'blog.rail.author' | transloco }}</h2>
        <div class="card-body">
          <div class="row">
            @if (author.account.avatar) {
              <img [src]="author.account.avatar_static || author.account.avatar" alt="" />
            }
            <span>
              <strong><app-account-name [account]="author.account" /></strong>
              <br />
              <span class="muted">&#64;{{ author.handle }}</span>
            </span>
          </div>
          @if (author.account.note) {
            <div
              class="note"
              [innerHTML]="author.account.note | customEmoji: author.account.emojis"
            ></div>
          }
          <p class="links">
            <a [routerLink]="profileLink()">{{ 'blog.rail.profile' | transloco }}</a>
            @if (context.postId()) {
              ·
              <a [routerLink]="['/blog', '@' + author.handle]">{{
                'blog.rail.allPosts' | transloco
              }}</a>
            }
          </p>
        </div>
      </section>
    }
  `,
  styles:
    CARD_STYLES +
    `
    .note { margin-top: 0.5rem; font-size: 0.85rem; line-height: 1.4; overflow-wrap: anywhere; }
    .note :first-child { margin-top: 0; }
    .links { margin: 0.5rem 0 0; font-size: 0.85rem; }
  `,
})
export class BlogAuthorCard {
  protected readonly context = inject(BlogContext);
  private readonly source = inject(BlogSource);
  /** Nobody needs their own profile card beside their own profile card. */
  protected readonly otherAuthor = computed(() => {
    const author = this.context.author();
    const me = this.source.ownHandle()?.toLowerCase();
    return author && author.handle.toLowerCase() !== me ? author : null;
  });
  protected readonly profileLink = computed(() =>
    accountRoutePath({ handle: this.context.author()?.handle ?? '' }),
  );
}

/** Left, on a post page: the next few titles from the same blog. */
@Component({
  selector: 'app-blog-more-card',
  imports: [RouterLink, TranslocoPipe, MbRailCard],
  template: `
    @if (more().length) {
      <section mbRailCard class="card">
        <h2 class="card-title">{{ 'blog.rail.more' | transloco }}</h2>
        <div class="card-body">
          <ul>
            @for (post of more(); track post.id) {
              <li>
                <a [routerLink]="link(post)">{{ post.title || '…' }}</a>
              </li>
            }
          </ul>
        </div>
      </section>
    }
  `,
  styles: CARD_STYLES,
})
export class BlogMoreCard {
  private readonly context = inject(BlogContext);
  private readonly source = inject(BlogSource);

  private readonly host = computed(() => this.context.author()?.handle.split('@')[1] ?? '');

  /** Only on a post page: on the blog list these are the list itself. */
  protected readonly more = computed<BlogPost[]>(() => {
    const author = this.context.author();
    const current = this.context.postId();
    if (!author || !current) {
      return [];
    }
    const list = this.source.remembered(author.handle) ?? [];
    return list.filter((post) => blogPostId(post.root, this.host()) !== current).slice(0, 5);
  });

  protected link(post: BlogPost): (string | number)[] {
    const author = this.context.author();
    const id = blogPostId(post.root, this.host());
    return id && author ? ['/blog', `@${author.handle}`, id] : ['/blog', `@${author?.handle}`];
  }
}

/** Right, at the bottom: blogs this account opened lately. */
@Component({
  selector: 'app-blog-recent-card',
  imports: [RouterLink, TranslocoPipe, MbRailCard, MbButton],
  template: `
    @if (history.visits().length) {
      <section mbRailCard class="card">
        <h2 class="card-title">{{ 'blog.rail.recent' | transloco }}</h2>
        <div class="card-body">
          <ul>
            @for (visit of history.visits(); track visit.handle) {
              <li>
                <a class="row" [routerLink]="['/blog', '@' + visit.handle]">
                  @if (visit.avatar) {
                    <img [src]="visit.avatar" alt="" loading="lazy" />
                  }
                  <span>{{ visit.name || '@' + visit.handle }}</span>
                </a>
              </li>
            }
          </ul>
          <button
            mbButton
            variant="link"
            size="small"
            type="button"
            class="clear"
            [attr.aria-label]="'blog.rail.clear.aria' | transloco"
            (click)="history.clear()"
          >
            {{ 'blog.rail.clear' | transloco }}
          </button>
        </div>
      </section>
    }
  `,
  styles:
    CARD_STYLES +
    `
    .clear { margin-top: 0.5rem; }
  `,
})
export class BlogRecentCard {
  protected readonly history = inject(BlogHistory);
}
