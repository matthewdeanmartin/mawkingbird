import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ACCENT_PRESETS,
  ClientPrefs,
  CustomTerminologyKey,
  READER_FONT_OPTIONS,
} from '../../../client-prefs';
import { Terminology } from '../../../terminology';
import { FALLBACK_LOCALE, UiLocale } from '../../../i18n/locale';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The Mockingbird Blue control cluster: theme, accent, undo-send and reader
 * typography. All settings live in localStorage (ClientPrefs) and apply
 * instantly. Shared by the "Mockingbird Blue" settings page and Appearance,
 * so the same controls are findable in both places.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n settings.blue.ai: AI features
// i18n settings.blue.ai.show: Show them
// i18n settings.blue.ai.hide: Hide them all
// i18n settings.blue.ai.hint: Hides Eliza, the OpenRouter chat, AI translation and the search and hashtag suggestions. Nothing is deleted — your OpenRouter key and your conversations stay where they are, and turning this back on restores them.
// i18n settings.blue.art: Illustrations
// i18n settings.blue.art.hand: Hand-drawn
// i18n settings.blue.art.ai: Generated
// i18n settings.blue.art.hint: Which bird and which fail whale the app draws. The hand-drawn set is the default — they were drawn for this app, by hand, on paper. The generated ones are the originals, kept for anyone who prefers them.
// i18n settings.blue.theme: Theme
// i18n settings.blue.theme.auto: Automatic
// i18n settings.blue.theme.light: Light
// i18n settings.blue.theme.dark: Dark
// i18n settings.blue.theme.hint: Automatic follows your system preference. Everything on this page applies immediately and saved in this browser.
// i18n settings.blue.accent: Accent color
// i18n settings.blue.accent.aria: Accent color: {{color}}
// i18n settings.blue.custom: Custom colors
// i18n settings.blue.custom.bg: Background
// i18n settings.blue.reset: reset
// i18n settings.blue.custom.links: Links &amp; buttons
// i18n settings.blue.custom.sidebar: Sidebar cards
// i18n settings.blue.custom.hint: Overrides ride on top of the theme; reset any of them to fall back to the theme's own color. A custom link color replaces the accent preset above.
// i18n settings.blue.favStyle: Favourites look like
// i18n settings.blue.favStyle.stars: ⭐ Stars (classic Mastodon)
// i18n settings.blue.favStyle.hearts: ❤️ Hearts (like the bird site)
// i18n settings.blue.zen: Zen mode
// i18n settings.blue.zen.label: Hide both sidebars — just you and the feed
// i18n settings.blue.posting: Posting
// i18n settings.blue.confirmPost: Ask "do you really want to post that?" before posting
// i18n settings.blue.delayedSend: Wait 30 seconds before posting, so you can cancel (or publish early)
// i18n settings.blue.thoughtful.hint: Home drops the Quick post button, leaving only Write, and that editor only saves. You post later, from Drafts. Replies, chats and paste shares are never held back — they're urgent, or already deliberate.
// i18n settings.blue.miniComposer: Open the mini composer on Home automatically
// i18n settings.blue.miniComposer.hint: Off by default: Home offers Write and Quick post, and the small box appears when you ask for it. Turn this on to have it open on arrival. Thoughtful posting, above, overrides this. These also live on
// i18n settings.writing.title.plain: Writing
// i18n settings.blue.checks: Blue checks
// i18n settings.blue.checks.top: Top accounts only (a fixed follower bar)
// i18n settings.blue.checks.relative: More followers than me — compared to me, they're famous
// i18n settings.blue.checks.everyone: Everyone, because everyone deserves a blue check mark
// i18n settings.blue.timeline: Timeline
// i18n settings.blue.autoRefresh: Auto-refresh timeline — new posts arrive continually, without you asking
// i18n settings.blue.autoRefresh.hint: Off by default, and worth leaving off: a feed that rewrites itself moves the post you were halfway through reading. Mastodon only — Twitter, Bluesky and RSS are polled and are not affected.
// i18n settings.blue.typography: Reader typography
// i18n settings.blue.fontFamily: Font family
// i18n settings.blue.fontWeight: Font weight
// i18n settings.blue.weight.normal: Normal
// i18n settings.blue.weight.semibold: Semi-bold
// i18n settings.blue.weight.bold: Bold
// i18n settings.blue.textAlign: Text alignment
// i18n settings.blue.align.left: Left
// i18n settings.blue.align.justify: Justified
// i18n settings.blue.typography.hint: Applies to reader mode on threads and, when feed reader is on, to every timeline.
// i18n settings.blue.feed: Feed
// i18n settings.blue.feedReader: Reader mode for feeds (reader typography, no pictures)
// i18n settings.blue.reader.fontSize: Font size ({{size}}px)
// i18n settings.blue.reader.lineHeight: Line spacing ({{value}})
// i18n settings.blue.reader.letterSpacing: Letter spacing ({{size}}px)
// i18n settings.blue.reader.wordSpacing: Word spacing ({{size}}px)
// i18n settings.blue.feedMin: Minimum feed size ({{count}} {{posts}})
// i18n settings.blue.feedMax: Maximum feed size ({{count}} {{posts}})
// i18n settings.blue.showImages: Show images in feeds (off replaces pictures with a 🖼️ chip)
// i18n settings.blue.minPosts.hint: Auto-loads more until the feed holds at least this many posts (or the timeline runs out).
// i18n settings.blue.maxPosts.hint: “You’ve had enough for now.” Load more is disabled once the feed reaches this size; it lifts after about an hour or when you reload.
// i18n settings.blue.ignoreCooldown: Ignore the reading break
// i18n settings.blue.ignoreCooldown.hint: Keeps “Load more” working past the maximum, with no cooldown. The break is a health guard, not a technical limit — this is here because it is your call, and it lives in Settings rather than at the end of the feed so that turning it off is a decision rather than a reflex.
// i18n settings.blue.analytics.hint: Anonymous page counts only — which kinds of page get used, never which account, post or tag you looked at, and never a query string. Turn this off and the analytics script is never loaded at all: nothing is fetched, counted or sent. The script is served from this site, not from a third party.
@Component({
  selector: 'app-blue-controls',
  imports: [FormsModule, RouterLink, TranslocoPipe],
  templateUrl: './blue-controls.html',
  styleUrl: './blue-controls.css',
})
export class BlueControls {
  /**
   * Whether the post-noun vocabulary block is offered at all.
   *
   * English only — see the comment in the template, and
   * sprint/ui-i18n-0-overview.md for the decree.
   */
  private uiLocale = inject(UiLocale);

  protected readonly terminologyAvailable = computed(
    () => this.uiLocale.active() === FALLBACK_LOCALE,
  );

  protected readonly prefs = inject(ClientPrefs);
  protected readonly accents = ACCENT_PRESETS;
  protected readonly readerFonts = READER_FONT_OPTIONS;

  /**
   * The selected post/re-share vocabulary, per the setting this page sets.
   *
   * The feed-size labels follow it live, so choosing "florps" a few rows above
   * renames "Minimum feed size (20 posts)" while you are looking at it. The
   * radio labels themselves deliberately do not — they name the options.
   */
  protected readonly words = inject(Terminology).words;

  protected setCustomWord(key: CustomTerminologyKey, value: string): void {
    this.prefs.setCustomTerminologyField(key, value);
  }
}
