import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Status } from '../platform/api/models';
import { Auth } from '../platform/session/auth';
import { NATIVE_PROFILES } from '../platform/session/platform-login';
import { qualifiedHandle } from '../accounts/account-handle';
import { MbButton } from '../design-system/button/button';
import { MbContentState } from '../design-system/content-state/content-state';
import { BlogHeader } from './blog-header';
import { BlogPrefs } from './blog-prefs';
import { BlogPost, blogPostId, collectAcrossAuthors, readingMinutes } from './blog-classifier';

// i18n blog.roll.title: Roll
// i18n blog.roll.coverage: Storms and long posts from the latest {{count}} posts by people you follow.
// i18n blog.roll.coverage.all: Storms and long posts from all {{count}} archived posts by people you follow.
// i18n blog.roll.collecting: Mawkingbird is still collecting posts from the people you follow, so older posts may be missing.
// i18n blog.roll.reading: Reading the archive…
// i18n blog.roll.empty: No storms or long posts yet
// i18n blog.roll.empty.hint: As the desktop app collects posts from the people you follow, their storms and long posts show up here.
// i18n blog.roll.native: Roll needs the desktop app
// i18n blog.roll.native.hint: It reads the archive Mawkingbird Native keeps of everyone you follow. On the web, open a blog from Recently read or from someone's profile.
// i18n blog.roll.error: Couldn't read the archive.

/** Archive pages per step: 400 posts. The archive pages up to 5,000 deep. */
const ROLL_STEP_PAGES = 10;
const ROLL_PAGE = 40;
const ROLL_MAX_OFFSET = 5000;

/**
 * Roll: the storms and long posts of everyone you follow, newest first,
 * yours left out (spec/sprint/blog-2026-11.md, sprint 7). Native only: the
 * web cannot see enough of a follow list's history to make this worth having.
 */
@Component({
  selector: 'app-blog-roll-page',
  imports: [DatePipe, RouterLink, TranslocoPipe, MbButton, MbContentState, BlogHeader],
  templateUrl: './blog-roll-page.html',
  styleUrl: './blog-page.css',
})
export class BlogRollPage implements OnInit {
  private readonly auth = inject(Auth);
  private readonly profiles = inject(NATIVE_PROFILES);
  private readonly prefs = inject(BlogPrefs);

  protected readonly available = signal(false);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly exhausted = signal(false);
  protected readonly collecting = signal(false);
  private readonly statuses = signal<Status[]>([]);
  private offset = 0;

  protected readonly count = computed(() => this.statuses().length);
  protected readonly posts = computed<BlogPost[]>(() => {
    const me = this.auth.account()?.id;
    return collectAcrossAuthors(
      this.statuses(),
      this.prefs.thresholds(),
      new Set(me ? [me] : []),
      this.exhausted(),
    ).posts;
  });

  ngOnInit(): void {
    const handle = this.handle();
    this.available.set(!!handle);
    if (handle) {
      void this.more();
    }
  }

  protected authorHandle(post: BlogPost): string {
    return qualifiedHandle(post.root.account) ?? post.root.account.acct;
  }

  protected postLink(post: BlogPost): (string | number)[] {
    const handle = this.authorHandle(post);
    const id = blogPostId(post.root, handle.split('@')[1] ?? '');
    return id ? ['/blog', `@${handle}`, id] : ['/statuses', post.root.id];
  }

  protected minutes(post: BlogPost): number {
    return readingMinutes(post.chars);
  }

  protected async more(): Promise<void> {
    const handle = this.handle();
    if (!handle || !this.profiles || this.loading()) {
      return;
    }
    this.loading.set(true);
    this.failed.set(false);
    try {
      for (let page = 0; page < ROLL_STEP_PAGES; page++) {
        const result = await this.profiles.peoplePosts(handle, 'all', 'all', this.offset);
        this.collecting.set(!result.scanComplete);
        this.offset += result.posts.length;
        this.statuses.update((list) => [...list, ...result.posts.map((post) => post.status)]);
        if (result.posts.length < ROLL_PAGE || this.offset > ROLL_MAX_OFFSET) {
          this.exhausted.set(true);
          break;
        }
      }
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private handle(): string | null {
    const token = this.auth.token();
    return this.profiles && token?.startsWith('native-mastodon:') ? token : null;
  }
}
