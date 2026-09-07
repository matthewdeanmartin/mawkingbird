import { Component, computed, input, output, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Account, Relationship, Status } from '../../models';
import { HumanCountPipe } from '../../human-count.pipe';
import { VerifiedBadge } from '../../verified-badge/verified-badge';
import { StatusCard } from '../../status-card/status-card';
import { AccountWithMatches } from './account-refine';
import { RenderedHtmlLinks } from '../../rendered-html-links';
import { Terminology } from '../../terminology';

/**
 * Clicks that belong to something on the card rather than to the card itself.
 *
 * Same approach as `StatusCard`'s `INTERACTIVE_SELECTOR`, and kept as one
 * reviewable list for the same reason: anything added to this card that responds
 * to a click has to be reachable from here.
 *
 * `.acct-matches` is the entry that is specific to this card. The posts that made
 * an account surface render as nested `app-status-card`s, and each of those has
 * its own navigation — a click there means "open that post", never "open this
 * profile", so the inner card must win.
 */
const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  'details',
  '[role="button"]',
  '[role="link"]',
  '.acct-matches',
].join(',');

// i18n pages.search.card.muteFor1Hour: 1 hour
// i18n pages.search.card.muteFor1Day: 1 day
// i18n pages.search.card.muteFor7Days: 7 days
// i18n pages.search.card.muteForever: forever
// i18n pages.search.card.neverPosted: never posted
// i18n pages.search.card.activeToday: active today
// i18n pages.search.card.activeYesterday: active yesterday
// i18n pages.search.card.activeDaysAgo: active {{days}} days ago
// i18n pages.search.card.activeMonthsAgo: active {{months}} mo ago
// i18n pages.search.card.activeYearsAgo: active {{years}}y ago
// i18n pages.search.card.requested: Requested
// i18n pages.search.card.mutuals: Mutuals
// i18n pages.search.card.following: Following
// i18n pages.search.card.request: Request
// i18n pages.search.card.follow: Follow
// i18n pages.search.card.automatedAccount: Automated account
// i18n pages.search.card.bot: BOT
// i18n pages.search.card.requiresFollowApproval: Requires follow approval
// i18n pages.search.card.followsYou: Follows you
// i18n pages.search.card.whySeeingThis: Why you’re seeing this:
// i18n pages.search.card.postsCount: <strong>{{count}}</strong> posts
// i18n pages.search.card.following: Following
// i18n pages.search.card.followingCount: <strong>{{count}}</strong> following
// i18n pages.search.card.followers: Followers
// i18n pages.search.card.followersCount: <strong>{{count}}</strong> followers
// i18n pages.search.card.lastPostedTitle: Last posted: {{date}}
// i18n pages.search.card.never: never
// i18n pages.search.card.arrivedWithoutDate: This result arrived without a last-{{post}} date
// i18n pages.search.card.activityUnknown: activity unknown
// i18n pages.search.card.moreAccountActions: More account actions
// i18n pages.search.card.muteFor: Mute for…
// i18n pages.search.card.blockAccount: Block account
// i18n pages.search.card.matchedOn: Matched on
// i18n pages.search.card.showFewerPosts: Show fewer posts
// i18n pages.search.card.moreMatchingPost.one: + {{count}} more matching post
// i18n pages.search.card.moreMatchingPost.other: + {{count}} more matching posts

/**
 * One account in the search results, built for discovery rather than lookup: the
 * user is hunting for "economists" or "people who post about pycharm", not for a
 * specific known person, so the collapsed card is deliberately information-dense.
 * Bio, the three counts, badges, follow/mutual state, and (in topic mode) the
 * posts that made this account surface all render immediately — none of that
 * costs an API call, since the search already returned it.
 *
 * The card is presentational: it owns no API state. The parent (search page)
 * batch-fetches relationships and performs follow/unfollow, passing the current
 * `relationship` down and receiving `follow`/`unfollow` intents back up. "Expand"
 * is reserved for anything that would cost a *per-account* call, surfaced by the
 * parent through the `expanded`/`toggleExpand` channel.
 */
@Component({
  selector: 'app-account-result-card',
  imports: [
    RouterLink,
    HumanCountPipe,
    VerifiedBadge,
    StatusCard,
    RenderedHtmlLinks,
    TranslocoPipe,
  ],
  templateUrl: './account-result-card.html',
  styleUrl: './account-result-card.css',
})
export class AccountResultCard {
  /** post/tweet/florp vocabulary, per the Blue setting. */
  protected words = inject(Terminology).words;

  /** The account plus any posts that made it surface (empty in bio-only mode). */
  readonly item = input.required<AccountWithMatches>();
  /** The viewer's relationship to this account, once the parent has fetched it. */
  readonly relationship = input<Relationship | null>(null);
  /** Router link to the full profile (parent builds it for the anon/auth split). */
  readonly profileLink = input.required<(string | number)[]>();
  /** True once the parent has opened this card's expand section. */
  readonly expanded = input(false);
  /** Whether a follow/unfollow request is in flight for this card. */
  readonly followBusy = input(false);
  /** True for anonymous viewers, so the card can soften relationship labels. */
  readonly anonymous = input(false);
  /** Optional explanation for contexts such as notification-driven discovery. */
  readonly reason = input<string | null>(null);
  /** Internal route to the post that caused the account to surface, when available. */
  readonly reasonLink = input<(string | number)[] | null>(null);
  /** Show the account mute/block overflow menu. Search results leave this off. */
  readonly showModerationMenu = input(false);

  readonly follow = output<Account>();
  readonly unfollow = output<Account>();
  readonly toggleExpand = output<void>();
  readonly muteAccount = output<{ account: Account; seconds: number | null }>();
  readonly blockAccount = output<Account>();

  protected account = computed(() => this.item().account);
  protected matchingPosts = computed<Status[]>(() => this.item().matchingPosts);

  /** How many matching posts to show inline before "and N more". */
  private static readonly INLINE_POST_CAP = 3;

  protected inlinePosts = computed(() =>
    this.matchingPosts().slice(0, AccountResultCard.INLINE_POST_CAP),
  );
  protected extraPostCount = computed(() =>
    Math.max(0, this.matchingPosts().length - AccountResultCard.INLINE_POST_CAP),
  );

  /**
   * "Last posted" for the stats row, in whole days.
   *
   * `last_status_at` is a plain date ("2026-08-07") rather than a timestamp, so
   * `humanTime` would invent a precision it doesn't have ("3 hours ago" from a
   * value that only names a day). Three states are worth distinguishing:
   * `null` = the account has never posted, `undefined` = nobody has told us yet
   * (the card offers to find out), and a date = an answer.
   */
  protected lastPosted = computed<{
    labelKey: string;
    labelParams?: Record<string, number>;
    stale: boolean;
  } | null>(() => {
    const raw = this.account().last_status_at;
    if (raw === undefined) {
      return null;
    }
    if (raw === null) {
      return { labelKey: 'pages.search.card.neverPosted', stale: true };
    }
    const when = Date.parse(raw);
    if (!Number.isFinite(when)) {
      return null;
    }
    const days = Math.floor((Date.now() - when) / 86_400_000);
    const labelKey =
      days <= 0
        ? 'pages.search.card.activeToday'
        : days === 1
          ? 'pages.search.card.activeYesterday'
          : days < 30
            ? 'pages.search.card.activeDaysAgo'
            : days < 365
              ? 'pages.search.card.activeMonthsAgo'
              : 'pages.search.card.activeYearsAgo';
    const labelParams: Record<string, number> | undefined =
      days <= 0 || days === 1
        ? undefined
        : days < 30
          ? { days }
          : days < 365
            ? { months: Math.floor(days / 30) }
            : { years: Math.floor(days / 365) };
    // Six months of silence is the line where "still around?" becomes the
    // question the reader is actually asking of a search result.
    return { labelKey, labelParams, stale: days >= 180 };
  });

  /** True when this card could show activity but nobody has fetched it yet. */
  protected activityUnknown = computed(() => this.account().last_status_at === undefined);

  protected following = computed(() => !!this.relationship()?.following);
  protected followedBy = computed(() => !!this.relationship()?.followed_by);
  protected mutual = computed(() => this.following() && this.followedBy());
  protected requested = computed(() => !!this.relationship()?.requested);

  protected readonly muteDurations: { label: string; seconds: number | null }[] = [
    { label: 'pages.search.card.muteFor1Hour', seconds: 3600 },
    { label: 'pages.search.card.muteFor1Day', seconds: 86400 },
    { label: 'pages.search.card.muteFor7Days', seconds: 604800 },
    { label: 'pages.search.card.muteForever', seconds: null },
  ];

  /** The label on the follow button, reflecting the current relationship. */
  protected followLabel = computed(() => {
    if (this.requested()) {
      return 'pages.search.card.requested';
    }
    if (this.mutual()) {
      return 'pages.search.card.mutuals';
    }
    if (this.following()) {
      return 'pages.search.card.following';
    }
    return this.account().locked ? 'pages.search.card.request' : 'pages.search.card.follow';
  });

  /** True when clicking the button unfollows (it currently shows a followed state). */
  protected isFollowingState = computed(() => this.following() || this.requested());

  private router = inject(Router);

  /** See {@link onCardClick} — snapshotted before the browser collapses it. */
  private selectionAtMouseDown = false;

  onCardMouseDown(): void {
    this.selectionAtMouseDown = (getSelection()?.toString() ?? '').length > 0;
  }

  /**
   * Open the profile when the click landed on the card rather than on a control.
   *
   * The bio was a plain `<div>` while the avatar and the display name above it
   * were links, so on a phone a ~40px face and a short name were the only ways
   * through, sitting under several lines of text that look exactly like a
   * tappable card body. Readers concluded the profile was unavailable; the truth
   * was that the target was small.
   *
   * A decline list rather than a target list, for the reason `StatusCard`
   * documents: there is no "whitespace" element to bind to, so the card listens
   * to everything and refuses what belongs to someone else — the Follow button,
   * the moderation menu, the real links inside the rendered bio, and the nested
   * post cards.
   */
  onCardClick(event: MouseEvent): void {
    const hadSelection = this.selectionAtMouseDown;
    this.selectionAtMouseDown = false;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (hadSelection) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(INTERACTIVE_SELECTOR)) {
      return;
    }
    void this.router.navigate(this.profileLink());
  }

  /**
   * Keyboard equivalent of {@link onCardClick}.
   *
   * Present because the card takes a click, and a pointer-only affordance is
   * one keyboard users cannot reach. It is deliberately narrow: Enter, and only
   * when the focus is on the card itself rather than on one of the controls
   * inside it — the display-name link already offers the same destination to
   * anyone tabbing through, so this must not steal Enter from the Follow button.
   */
  onCardKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(INTERACTIVE_SELECTOR)) {
      return;
    }
    event.preventDefault();
    void this.router.navigate(this.profileLink());
  }

  onFollowClick(): void {
    if (this.followBusy()) {
      return;
    }
    if (this.isFollowingState()) {
      this.unfollow.emit(this.account());
    } else {
      this.follow.emit(this.account());
    }
  }
}
