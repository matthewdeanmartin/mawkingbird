import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { BlogPrefs } from '../../blog/blog-prefs';
import { BLOG_THRESHOLD_LIMITS } from '../../blog/blog-classifier';
import { MbField, MbControl } from '../../design-system/field/field';
import { MbButton } from '../../design-system/button/button';

/**
 * Settings › Blog: what counts as a blog post when a profile is read as a blog.
 *
 * Client-side only, so it works for Anonymous. The page states the whole rule
 * in plain words, because the numbers alone do not say that a `BLOG:` first
 * line always counts, or that a content warning is never the title.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.nav.blog: Blog
// i18n settings.blog.title: 📝 Blog
// i18n settings.blog.intro: Blog mode reads Mastodon posts as blog posts. Here you decide which posts count.
// i18n settings.blog.rule: What counts as a blog post
// i18n settings.blog.rule.storm: A storm: at least {{posts}} posts, each one replying to the author's own previous post.
// i18n settings.blog.rule.long: Or a post (or chain of posts) with at least {{chars}} characters of text.
// i18n settings.blog.rule.marked: Or any post whose first line starts with BLOG:
// i18n settings.blog.rule.title: The title is the first line of the first post. A content warning is never used as a title.
// i18n settings.blog.rule.conversation: Chains that start as a reply to someone else are conversations, not blog posts, unless they start with BLOG:
// i18n settings.blog.minPosts: Posts in a storm
// i18n settings.blog.minPosts.hint: Between {{min}} and {{max}}. Shorter chains count only if they are long enough.
// i18n settings.blog.minChars: Characters in a long post
// i18n settings.blog.minChars.hint: Between {{min}} and {{max}}. Counts the text only, not links' hidden addresses or formatting.
// i18n settings.blog.reset: Reset to 3 posts and 1250 characters
// i18n settings.blog.open: Open Blog
@Component({
  selector: 'app-settings-blog',
  imports: [RouterLink, TranslocoPipe, MbField, MbControl, MbButton],
  templateUrl: './settings-blog.html',
})
export class SettingsBlog {
  protected readonly prefs = inject(BlogPrefs);
  protected readonly limits = BLOG_THRESHOLD_LIMITS;

  protected setMinPosts(value: string): void {
    if (value.trim() !== '') {
      this.prefs.set({ minPosts: Number(value) });
    }
  }

  protected setMinChars(value: string): void {
    if (value.trim() !== '') {
      this.prefs.set({ minChars: Number(value) });
    }
  }
}
