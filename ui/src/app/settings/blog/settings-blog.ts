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
// i18n settings.blog.rule.long: A post, or a chain of the author's own posts, with at least {{words}} words.
// i18n settings.blog.rule.storm: Or a storm: at least {{posts}} posts, each replying to the author's previous one, with at least {{stormWords}} words in all.
// i18n settings.blog.rule.words: Mentions, links and hashtags don't count as words, so a thread of captioned photos is not a blog post.
// i18n settings.blog.rule.marked: Or any post whose first line starts with BLOG:
// i18n settings.blog.rule.title: The title is the first line of the first post. A content warning is never used as a title.
// i18n settings.blog.rule.conversation: Chains that start as a reply to someone else are conversations, not blog posts, unless they start with BLOG:
// i18n settings.blog.minPosts: Posts in a storm
// i18n settings.blog.minPosts.hint: Between {{min}} and {{max}}.
// i18n settings.blog.minStormWords: Words a storm needs
// i18n settings.blog.minStormWords.hint: Between {{min}} and {{max}}, across all of the storm's posts.
// i18n settings.blog.minWords: Words that make any post a blog post
// i18n settings.blog.minWords.hint: Between {{min}} and {{max}}, for one post or a chain of any length.
// i18n settings.blog.reset: Reset to the defaults
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

  protected setMinWords(value: string): void {
    if (value.trim() !== '') {
      this.prefs.set({ minWords: Number(value) });
    }
  }

  protected setMinStormWords(value: string): void {
    if (value.trim() !== '') {
      this.prefs.set({ minStormWords: Number(value) });
    }
  }
}
