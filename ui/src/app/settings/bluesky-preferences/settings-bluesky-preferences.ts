import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { MbPageHeader, MbSection } from '../../design-system/page-header/page-header';
import { MbSaveFeedback } from '../../design-system/save-feedback/save-feedback';
import {
  BlueskyAccountPrefs,
  BSKY_INTERESTS,
} from '../../connections/bluesky/bluesky-account-prefs';
import { BlueskyModerationState } from '../../connections/bluesky/bluesky-moderation-state';
import type { BskyPostControlsValue } from '../../connections/bluesky/bluesky-post-controls';
import {
  BskyHomeFeedPrefs,
  BskyThreadSort,
  THREAD_SORTS,
} from '../../connections/bluesky/bluesky-reading-prefs';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { BlueskyPostControlsDialog } from '../../publishing/post-permissions/bluesky-post-controls-dialog';

// i18n settings.bskyPrefs.title: Bluesky preferences
// i18n settings.bskyPrefs.intro: How your Bluesky account reads and posts. Saved to Bluesky, so bsky.app and other Bluesky apps use the same settings.
// i18n settings.bskyPrefs.notLinked: No Bluesky account is linked
// i18n settings.bskyPrefs.notLinkedHint: Link Bluesky to change its preferences.
// i18n settings.bskyPrefs.linkBluesky: Link Bluesky
// i18n settings.bskyPrefs.loading: Loading your Bluesky preferences…
// i18n settings.bskyPrefs.failed: Couldn't load these settings from Bluesky.
// i18n settings.bskyPrefs.retry: Retry
// i18n settings.bskyPrefs.saved: Saved.
// i18n settings.bskyPrefs.feed.title: Following feed
// i18n settings.bskyPrefs.feed.hint: What your Bluesky Following feed shows in Home. A reply that continues its author's own thread always shows.
// i18n settings.bskyPrefs.feed.hideReplies: Hide replies
// i18n settings.bskyPrefs.feed.followedOnly: Only show replies to people I follow
// i18n settings.bskyPrefs.feed.likes: Hide replies with fewer likes than
// i18n settings.bskyPrefs.feed.anyLikes: Show all replies
// i18n settings.bskyPrefs.feed.hideReposts: Hide reposts
// i18n settings.bskyPrefs.feed.hideQuotes: Hide quote posts
// i18n settings.bskyPrefs.threads.title: Thread replies
// i18n settings.bskyPrefs.threads.label: Show replies in a thread
// i18n settings.bskyPrefs.threads.hotness: Top replies first (Bluesky's ranking)
// i18n settings.bskyPrefs.threads.oldest: Oldest first
// i18n settings.bskyPrefs.threads.newest: Newest first
// i18n settings.bskyPrefs.threads.mostLikes: Most liked first
// i18n settings.bskyPrefs.threads.random: In random order
// i18n settings.bskyPrefs.defaults.title: Who can reply and quote, by default
// i18n settings.bskyPrefs.defaults.hint: New Bluesky posts start with these controls. You can still change them on each post.
// i18n settings.bskyPrefs.defaults.everyone: Everyone can reply and quote.
// i18n settings.bskyPrefs.defaults.limited: Replies or quotes are limited.
// i18n settings.bskyPrefs.defaults.change: Change
// i18n settings.bskyPrefs.interests.title: Interests
// i18n settings.bskyPrefs.interests.hint: Bluesky uses these to suggest people and feeds.
// i18n settings.bskyPrefs.privacy.title: Privacy
// i18n settings.bskyPrefs.privacy.hideFromRecommendations: Ask apps not to recommend my posts
// i18n settings.bskyPrefs.privacy.hideFromRecommendationsHint: Discovery feeds and suggestions are asked to leave your posts out. People who follow you, search or open your profile still see them.
// i18n settings.bskyPrefs.privacy.bot: This account is automated
// i18n settings.bskyPrefs.privacy.botHint: Labels the account as a bot for everyone on Bluesky.

const LIKE_THRESHOLDS = [0, 2, 5, 10, 25] as const;

/**
 * Settings → Bluesky preferences (spec/bsky_parity.md, sprint 4): the
 * account-level reading and posting choices bsky.app keeps in the account.
 * Each control saves when changed and says so; a refused save puts the
 * control back to what Bluesky has.
 */
@Component({
  selector: 'app-settings-bluesky-preferences',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbPageHeader,
    MbSection,
    MbField,
    MbControl,
    MbCheckbox,
    MbButton,
    MbContentState,
    MbContentLink,
    MbSaveFeedback,
    BlueskyPostControlsDialog,
  ],
  templateUrl: './settings-bluesky-preferences.html',
  styleUrl: './settings-bluesky-preferences.css',
})
export class SettingsBlueskyPreferences implements OnInit {
  protected session = inject(BlueskySession);
  protected state = inject(BlueskyModerationState);
  private account = inject(BlueskyAccountPrefs);

  protected readonly interestsList = BSKY_INTERESTS;
  protected readonly likeThresholds = LIKE_THRESHOLDS;
  protected readonly sorts = THREAD_SORTS;

  protected loading = signal(false);
  protected failed = signal(false);
  protected busy = signal(false);
  /** Which section's save to report: one feedback line per section. */
  protected savedIn = signal<string | null>(null);
  protected errorIn = signal<{ section: string; message: string } | null>(null);
  protected interests = signal<string[]>([]);
  protected hiddenFromRecommendations = signal(false);
  protected bot = signal(false);
  protected controlsOpen = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    if (!this.session.linked()) return;
    this.loading.set(true);
    this.failed.set(false);
    try {
      const settings = await this.account.load();
      this.interests.set(settings.interests);
      this.hiddenFromRecommendations.set(settings.hiddenFromRecommendations);
      this.bot.set(settings.bot);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected setFeed(change: Partial<BskyHomeFeedPrefs>): void {
    const next = { ...this.state.homeFeedPrefs(), ...change };
    void this.save('feed', () => this.account.setHomeFeed(next));
  }

  protected setSort(sort: BskyThreadSort): void {
    void this.save('threads', () => this.account.setThreadSort(sort));
  }

  /** The copy key for a sort; keys are camelCase, sort values are not. */
  protected sortKey(sort: BskyThreadSort): string {
    return `settings.bskyPrefs.threads.${sort === 'most-likes' ? 'mostLikes' : sort}`;
  }

  protected defaultsLimited(value: BskyPostControlsValue): boolean {
    return value.replies !== 'everyone' || !value.quotes;
  }

  protected setDefaults(value: BskyPostControlsValue): void {
    this.controlsOpen.set(false);
    void this.save('defaults', () => this.account.setPostDefaults(value));
  }

  protected toggleInterest(tag: string, on: boolean): void {
    const previous = this.interests();
    const next = on
      ? [...previous.filter((t) => t !== tag), tag]
      : previous.filter((t) => t !== tag);
    this.interests.set(next);
    void this.save(
      'interests',
      () => this.account.setInterests(next),
      () => this.interests.set(previous),
    );
  }

  protected setHidden(hidden: boolean): void {
    this.hiddenFromRecommendations.set(hidden);
    void this.save(
      'privacy',
      () => this.account.setHiddenFromRecommendations(hidden),
      () => this.hiddenFromRecommendations.set(!hidden),
    );
  }

  protected setBot(bot: boolean): void {
    this.bot.set(bot);
    void this.save(
      'privacy',
      () => this.account.setBot(bot),
      () => this.bot.set(!bot),
    );
  }

  private async save(
    section: string,
    change: () => Promise<void>,
    undo?: () => void,
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.savedIn.set(null);
    this.errorIn.set(null);
    try {
      await change();
      this.savedIn.set(section);
    } catch (failure: unknown) {
      undo?.();
      this.errorIn.set({
        section,
        message: failure instanceof Error && failure.message ? failure.message : String(failure),
      });
    } finally {
      this.busy.set(false);
    }
  }

  protected feedback(section: string): 'idle' | 'saved' | 'error' {
    if (this.errorIn()?.section === section) return 'error';
    return this.savedIn() === section ? 'saved' : 'idle';
  }
}
