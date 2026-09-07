import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { NgOptimizedImage } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AccountHoverCard } from '../account-hover-card/account-hover-card';
import { PreviewCardComponent } from '../preview-card/preview-card';
import { AccountListDialog, AccountListMode } from '../account-list-dialog/account-list-dialog';
import { SaveToLibrary } from '../pages/read/save-to-library/save-to-library';
import { Api } from '../api';
import { Auth } from '../auth';
import { hashtagNameFrom, profileRouteFor } from '../rendered-html-links';
import { ClientPrefs } from '../client-prefs';
import { Terminology } from '../terminology';
import { Compose } from '../compose/compose';
import { Drafts } from '../drafts';
import { withPkmTag } from '../pkm/pkm-tags';
import { HistoryDialog } from '../history-dialog/history-dialog';
import { Lightbox } from '../lightbox/lightbox';
import { applyMinimalMarkdown } from '../markdown';
import {
  Account,
  FilterContext,
  FilterResult,
  MediaAttachment,
  Poll,
  Status,
  Translation,
} from '../models';
import { qualifiedHandle } from '../account-handle';
import { accountRoutePath } from '../account-route';
import { HugoSettings } from '../providers/hugo/hugo-settings';
import { PosseKind, PosseQueue } from '../providers/hugo/posse-queue';
import { canPosseOnly } from '../providers/provider';
import { OpenRouterSession } from '../providers/openrouter/openrouter-session';
import { AiAvailability } from '../ai-availability';
import { AiTranslate, AiTranslation, languageName } from '../ai-translate';
import { TranslationPreference } from '../translation-preference';
import { ENGINE_LABELS, TranslationEngine, TranslationUsage } from '../translation-usage';
import { AutoTranslateEligibility } from '../trend-language-filter';
import { MutedPosts } from '../muted-posts';
import { LocalModeration } from '../local-moderation';
import { FollowTrust } from '../follow-trust';
import { TrustedAccounts } from '../trusted-accounts';
import { StatusVisibility } from '../status-visibility';
import { serverKnowsStatus, ProviderCapabilities } from '../providers/provider';
import { BskyReply } from '../providers/bluesky/bluesky-reply';
import { BlueskyApi } from '../providers/bluesky/bluesky-api';
import { BlueskySession } from '../providers/bluesky/bluesky-session';
import { BskyRef } from '../providers/bluesky/bluesky-types';
import { SignInPrompt } from '../sign-in-prompt/sign-in-prompt';
import { AnonymousCapabilities } from '../providers/anonymous/anonymous-capabilities';
import { AnonymousBookmarks } from '../providers/anonymous/anonymous-bookmarks';
import { nitterHost, toNitterUrl } from '../providers/twitter/nitter';
import { StatusActions } from '../providers/status-actions';
import { ReportDialog } from '../report-dialog/report-dialog';
import { HumanTimePipe } from '../human-time.pipe';
import { VerifiedBadge } from '../verified-badge/verified-badge';
import { AnonymousProviderRef } from '../providers/anonymous/anonymous-mastodon-provider';
import { AnonymousPublicApi } from '../providers/anonymous/anonymous-public-api';
import { isElizaId } from '../eliza/eliza-identity';
import { LocalCompose } from '../eliza/local-compose';
import { ComposeShareRequest, ShareDialog } from '../share-dialog/share-dialog';
import { selectionWithin } from '../share-dialog/share-selection';
import { FeatureFlags } from '../feature-flags';
import {
  BookmarkChoice,
  BookmarkProviderDialog,
} from '../bookmark-provider-dialog/bookmark-provider-dialog';
import { firstExternalLink, RaindropSession } from '../providers/raindrop/raindrop-session';
import { TranslatedText } from '../i18n/translated';
import { Server } from '../server';
import {
  anonymousAccountRouteRef,
  anonymousStatusRouteRef,
} from '../providers/anonymous/anonymous-route-ref';

const QUOTE_POLICIES = ['public', 'followers', 'nobody'] as const;

// i18n statusCard.filtered: Filtered: {{titles}}
// i18n statusCard.showAnyway: Show anyway
// i18n statusCard.pinned: Pinned
// i18n statusCard.followersOnly: Followers-only {{post}}
// i18n statusCard.source: Source
// i18n statusCard.visibility: Visibility
// i18n statusCard.postedVia: via {{name}}
// i18n statusCard.cancel: Cancel
// i18n statusCard.saving: Saving…
// i18n statusCard.save: Save
// i18n statusCard.showMore: Show more
// i18n statusCard.showLess: Show less
// i18n statusCard.translatedVia: Translated via {{provider}}
// i18n statusCard.translatedViaAutomatic: Translated via {{provider}} · automatic
// i18n statusCard.aiTranslationNote: Translated into {{target}} by {{model}} · machine translation, so treat the wording as approximate
// i18n statusCard.aiTranslation: AI translation
// i18n statusCard.showSensitiveContent: Show sensitive content
// i18n statusCard.quotedPostUnavailable: Quoted post is unavailable.
// i18n statusCard.translating: Translating…
// i18n statusCard.useAiTranslation: Use AI translation
// i18n statusCard.votes: {{count}} votes
// i18n statusCard.vote: Vote
// i18n statusCard.pollResult: {{percent}}% · {{count}} votes
// i18n statusCard.countLabel: {{count}} {{label}}
// i18n statusCard.closed: Closed
// i18n statusCard.revokeQuotePermission: Revoke quote permission
// i18n statusCard.viewImage: View image{{description}}
// i18n statusCard.viewImageNoDescription: View image {{number}} (no description provided)
// i18n statusCard.noDescriptionProvided: No description provided
// i18n statusCard.sensitiveContent: ⚠️ Sensitive content — click to view
// i18n statusCard.replies: replies
// i18n statusCard.repliesTitle: Replies
// i18n statusCard.reply: Reply
// i18n statusCard.readThreadAsArticle: Read thread as article
// i18n statusCard.readArticleAndComments: Read article and comments
// i18n statusCard.viewThread: View thread
// i18n statusCard.recorded: Recorded
// i18n statusCard.quote: Quote
// i18n statusCard.shareElsewhere: Share elsewhere
// i18n statusCard.shareElsewhereEllipsis: Share elsewhere…
// i18n statusCard.boostFromBlog: Remove boost from my blog
// i18n statusCard.recordBoostOnBlog: Record a boost on my blog
// i18n statusCard.share: Share
// i18n statusCard.favourites: favourites
// i18n statusCard.favourited: Favourited
// i18n statusCard.likes: likes
// i18n statusCard.favouritesTitle: Favourites
// i18n statusCard.likesTitle: Likes
// i18n statusCard.favouritedBy: Favourited by
// i18n statusCard.favouritedByCount: {{count}} Favourited by
// i18n statusCard.openOnNitter: Open on {{host}}, a tracker-free front-end for Twitter
// i18n statusCard.favourite: Favourite
// i18n statusCard.undoFavourite: Undo favourite
// i18n statusCard.likeFromBlogRecord: Remove this like from your blog record
// i18n statusCard.recordLikeOnBlog: Record a like on your blog
// i18n statusCard.removeBookmark: Remove bookmark
// i18n statusCard.bookmark: Bookmark
// i18n statusCard.deleteAndBoost: Delete & {{boost}}
// i18n statusCard.moreActions: More {{post}} actions
// i18n statusCard.reportedTitle: Reported
// i18n statusCard.boostFromBlogRecord: Remove this boost from your blog record
// i18n statusCard.openOriginalTitle: Open on the original site
// i18n statusCard.openOriginal: ↗ Open original
// i18n statusCard.translate: Translate
// i18n statusCard.translateWithAi: Translate with AI
// i18n statusCard.editHistory: Edit history
// i18n statusCard.pin: Pin
// i18n statusCard.muteThread: Mute thread
// i18n statusCard.whoCanQuote: Who can quote
// i18n statusCard.edit: Edit
// i18n statusCard.delete: Delete
// i18n statusCard.saveAsTodo: Save as to-do
// i18n statusCard.openPostOriginal: Open post on original site ↗
// i18n statusCard.openProfileOriginal: Open profile on original site ↗
// i18n statusCard.reported: 🚩 reported
// i18n statusCard.muteThisPost: Mute this post
// i18n statusCard.unblock: Unblock
// i18n statusCard.unmute: Unmute
// i18n statusCard.muteAccountFor: Mute @{{acct}} for…
// i18n statusCard.blockAccount: Block @{{acct}}
// i18n statusCard.reportPost: Report post
// i18n statusCard.postDeletedDiscard: Post deleted — edit below and repost, or
// i18n statusCard.discard: discard
// i18n statusCard.editAndRepost: Edit and repost
// i18n statusCard.postYourReply: Post your reply
// i18n statusCard.addComment: Add a comment
// i18n statusCard.translateWith: Translate with
// i18n statusCard.yourServer: Your server
// i18n statusCard.freeAlreadySetUp: Free, already set up
// i18n statusCard.spendsOpenrouterCredits: Spends OpenRouter credits
// i18n statusCard.alwaysUseThis: Always use this, and stop asking
// i18n statusCard.aiTranslationDescription: Translation here is done by an AI model of your choosing, through OpenRouter — your key, your browser, your account. Nothing is sent to a Mawkingbird server, because there isn't one.
// i18n statusCard.connectOpenrouter: Connect OpenRouter
// i18n statusCard.notNow: Not now
// i18n statusCard.policyPublic: public
// i18n statusCard.policyFollowers: followers
// i18n statusCard.policyNobody: nobody
// i18n statusCard.boostQuoteOrShare: Boost, quote or share
// i18n statusCard.removeThisBoostFromBlog: Remove this boost from your blog record
// i18n statusCard.recordBoostOnBlogShort: Record a boost on your blog
// i18n statusCard.shareThisArticle: Share this article
// i18n statusCard.shareDefault: Share
// i18n statusCard.oneHour: 1 hour
// i18n statusCard.oneDay: 1 day
// i18n statusCard.sevenDays: 7 days
// i18n statusCard.forever: forever
// i18n statusCard.mutedServerFailed: Muted locally, but the server mute failed.
// i18n statusCard.blockedServerFailed: Blocked locally, but the server block failed.
// i18n statusCard.deletePostConfirm: Delete this post?
// i18n statusCard.deleteRedraftConfirm: Delete this post and re-draft it?
// i18n statusCard.todoSaved: Saved as a to-do in your drafts. Nothing was posted.
// i18n statusCard.actionFailureBluesky: Couldn't {{verb}} on Bluesky — your link may have expired. Re-link in Settings → Connections.
// i18n statusCard.actionFailure: Couldn't {{verb}} — try again.
// i18n statusCard.externalLinkSaved: External link saved to Raindrop.io.
// i18n statusCard.postSavedToRaindrop: Post saved to Raindrop.io.
// i18n statusCard.raindropBookmarkFailed: Raindrop.io couldn't save that bookmark.
// i18n statusCard.serverTranslateFailedWithAi: Your server couldn't translate this. Try AI translation instead.
// i18n statusCard.serverTranslateFailed: Your server couldn't translate this post.
// i18n statusCard.sameLanguage: This post already looks like {{target}}, so translating it would return the same text. You can turn this check off in Settings → Internationalization.
// i18n statusCard.translationLimit: You've used today's {{engine}} translation limit ({{limit}}). It resets at midnight, or you can raise it in Settings → Internationalization.
// i18n statusCard.modelTranslateFailed: The model couldn't translate this.

/**
 * Everything on a card that owns its own clicks.
 *
 * Used by {@link StatusCard.onCardClick} to tell "the user clicked the card" from
 * "the user clicked a thing that happens to be on the card". Kept as one
 * selector so the list is reviewable in one place: anything added to a card that
 * responds to a click needs to be reachable from here, and the generic entries
 * (`button`, `a`, `[role="button"]`) already cover almost everything by
 * construction.
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
  'video',
  'audio',
  '[role="button"]',
  '[role="link"]',
  // The media thumbnails, the sensitive-content reveal and the alt-text rows are
  // all real `<button>`s, so `button` above already covers them. These are the
  // container blocks whose padding is *theirs* rather than the card's — clicking
  // the gap between two poll options should not navigate away from the poll.
  '.media',
  '.poll',
  '.ai-translation',
  '.quote-card',
  'app-account-hover-card',
].join(',');

/**
 * One entry in the unified 🔁 menu.
 *
 * `posse` is "record a boost on my own blog" — a POSSE write to the reader's
 * site with no network request behind it. It sits in this list rather than as a
 * second 🔁 in the bar, because two recycle symbols side by side is a riddle,
 * not an interface.
 */
type ShareMenuAction = 'boost' | 'quote' | 'posse' | 'share';

interface MastodonPostRef {
  url: string;
  server: string;
  id: string;
}

/** Recognise the public URL shapes emitted by Mastodon and compatible servers. */
function mastodonPostRef(content: string): MastodonPostRef | null {
  const doc = new DOMParser().parseFromString(content, 'text/html');
  for (const anchor of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    try {
      const url = new URL(anchor.href);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      const id =
        url.pathname.match(/^\/@[^/]+\/(\d+)\/?$/)?.[1] ??
        url.pathname.match(/^\/users\/[^/]+\/statuses\/(\d+)\/?$/)?.[1] ??
        url.pathname.match(/^\/statuses\/(\d+)\/?$/)?.[1];
      if (id) return { url: anchor.getAttribute('href')!, server: url.origin, id };
    } catch {
      // A malformed href remains an ordinary link.
    }
  }
  return null;
}

/** Keep long bare URLs compact while preserving the anchor's real destination. */
function compactContentLinks(content: string, embeddedPostUrl: string | null): string {
  const doc = new DOMParser().parseFromString(content, 'text/html');
  for (const anchor of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = anchor.getAttribute('href')!;
    if (embeddedPostUrl === href) {
      const parent = anchor.parentElement;
      anchor.remove();
      if (parent?.tagName === 'P' && !parent.textContent?.trim() && !parent.children.length) {
        parent.remove();
      }
      continue;
    }
    try {
      const url = new URL(href);
      const visible = (anchor.textContent ?? '').trim();
      if (/^https?:\/\//i.test(visible)) {
        const hasTail = url.pathname !== '/' || !!url.search || !!url.hash;
        anchor.textContent = `${url.host}${hasTail ? '/…' : ''}`;
      }
    } catch {
      // Relative and malformed links keep their server-supplied label.
    }
  }
  return doc.body.innerHTML;
}

@Component({
  selector: 'app-status-card',
  imports: [
    RouterLink,
    AccountHoverCard,
    ReportDialog,
    AccountListDialog,
    HistoryDialog,
    FormsModule,
    Compose,
    BskyReply,
    HumanTimePipe,
    Lightbox,
    VerifiedBadge,
    NgOptimizedImage,
    LocalCompose,
    ShareDialog,
    BookmarkProviderDialog,
    PreviewCardComponent,
    SignInPrompt,
    SaveToLibrary,
    TranslocoPipe,
  ],
  templateUrl: './status-card.html',
  styleUrl: './status-card.css',
})
export class StatusCard {
  private api = inject(Api);
  protected auth = inject(Auth);
  private prefs = inject(ClientPrefs);
  /** Accounts whose CWs and sensitive flags this viewer has opted out of. */
  private trusted = inject(TrustedAccounts);
  /** Resolves the "everyone I follow" trust levels; read for its revision. */
  private followTrust = inject(FollowTrust);
  /** For "Save as to-do", which parks a local draft rather than publishing. */
  private drafts = inject(Drafts).forCurrentAccount();
  private actions = inject(StatusActions);
  private router = inject(Router);
  private mutedPosts = inject(MutedPosts);
  private localMod = inject(LocalModeration);
  private visibility = inject(StatusVisibility);
  protected capabilities = inject(AnonymousCapabilities);
  private hugo = inject(HugoSettings);
  private posse = inject(PosseQueue);
  private anonymousBookmarks = inject(AnonymousBookmarks);
  private anonymousPublic = inject(AnonymousPublicApi);
  private blueskyApi = inject(BlueskyApi);
  private blueskySession = inject(BlueskySession);
  private raindrop = inject(RaindropSession);
  private server = inject(Server);
  private transloco = inject(TranslocoService);
  /**
   * Gives the `translate()` calls in the computeds here a dependency on the
   * loaded dictionary. Without it, a label built before the fetch lands keeps
   * the raw key forever. See {@link TranslatedText}.
   */
  private i18n = inject(TranslatedText);

  /** Pictures render only when images are on and feed reader mode is off. */
  protected imagesVisible = computed(() => this.prefs.showImages() && !this.prefs.feedReader());

  /**
   * Icon standing in for one attachment when images are off. Mastodon's media
   * types are image / video / gifv / audio / unknown; picking a matching glyph
   * keeps the text-only list honest about what is actually being hidden.
   */
  protected mediaIcon(media: MediaAttachment): string {
    switch (media.type) {
      case 'video':
      case 'gifv':
        return '🎬';
      case 'audio':
        return '🔊';
      default:
        return '🖼️';
    }
  }

  /** ⭐ or ❤️, per the Mockingbird Blue preference. */
  protected favIcon = computed(() => (this.prefs.favStyle() === 'heart' ? '❤️' : '⭐'));

  /** post/boost vs tweet/retweet wording, per the Mockingbird Blue preference. */
  protected words = inject(Terminology).words;
  protected countWords = computed(() => {
    this.i18n.version();
    const words = this.words();
    if (this.transloco.getActiveLang() !== 'ko') return words;
    const boost = this.transloco.translate('pages.profile.media.boost');
    return { ...words, boosts: boost, BoostedBy: boost };
  });
  /** Internal POSSE queue value; not interface text. */
  protected readonly repostKind: PosseKind = 'repost';

  /**
   * The card renders as nothing when the viewer hid this specific post ("mute
   * this post") or has locally blocked/muted its author. Reading the moderation
   * signals here means the card disappears the moment the viewer acts.
   */
  protected mutedLocally = computed(() => this.visibility.mutedLocally(this.status()));

  /** Whether the viewer has locally blocked this card's author. */
  protected authorBlockedLocally = computed(() => {
    this.localMod.entries();
    return this.localMod.isBlocked(this.display.account);
  });

  /** Whether the viewer has locally muted this card's author. */
  protected authorMutedLocally = computed(() => {
    this.localMod.entries();
    return this.localMod.isMuted(this.display.account);
  });

  /** Minimal markdown (bold/italic/code/headers) applied to the body HTML. */
  protected md = applyMinimalMarkdown;

  readonly status = input.required<Status>();
  /**
   * Which timeline this card renders in — content filters are scoped per
   * context (a filter can apply to home but not threads, say).
   */
  readonly filterContext = input<FilterContext>('home');
  /** Thread view turns this on: show which app the post was made with. */
  readonly showSource = input(false);
  readonly changed = output<Status>();
  /** Emitted when the user deletes this status, so containers can drop it. */
  readonly deleted = output<Status>();
  /** Emitted with the newly-created reply when the user replies inline. */
  readonly replied = output<Status>();

  /** A legacy quote represented only by a Mastodon post URL in the body. */
  private linkQuote = signal<Status | null>(null);
  private linkQuoteUrl = signal<string | null>(null);
  private resolveLinkQuote = effect((onCleanup) => {
    const display = this.display;
    const ref = display.quote ? null : mastodonPostRef(display.content);
    this.linkQuote.set(null);
    this.linkQuoteUrl.set(null);
    if (!ref || ref.url === display.url) return;
    const subscription = this.anonymousPublic
      .getStatus({ server: ref.server, id: ref.id, originalUrl: ref.url })
      .subscribe({
        next: (status) => {
          this.linkQuote.set(status);
          this.linkQuoteUrl.set(ref.url);
        },
        error: () => undefined,
      });
    onCleanup(() => subscription.unsubscribe());
  });

  // Inline composers (reply / quote), shown beneath the status when toggled.
  protected replying = signal(false);
  protected quoting = signal(false);
  protected showShare = signal(false);
  /** Text highlighted when Share was pressed; see {@link openShare}. */
  protected shareQuote = signal('');
  /** Open state of the unified Boost/Quote/Share menu (flagged). */
  protected shareMenuOpen = signal(false);
  /** A composer the share dialog asked for, rendered inline beneath the post. */
  protected shareCompose = signal<ComposeShareRequest | null>(null);

  /**
   * Whether the action bar collapses Boost, Quote and Share into one button.
   *
   * Off by default. The bar is already out of horizontal space and wraps on
   * narrow screens, so this trades three controls for one rather than adding a
   * fourth — see the `unified-share` flag.
   */
  protected readonly unifiedShare = computed(() => this.featureFlags.enabled('unified-share'));

  /**
   * The actions the unified menu would actually offer, in menu order.
   *
   * Computed rather than left implicit in the template because the *count* is
   * what decides whether there is a menu at all — see {@link shareMenuItems}.
   */
  protected readonly shareMenuActions = computed<readonly ShareMenuAction[]>(() => {
    const actions: ShareMenuAction[] = [];
    if (this.caps.reblog) {
      actions.push('boost');
    }
    if (!this.foreign && this.capabilities.canCompose) {
      actions.push('quote');
    }
    // Record-a-boost-on-my-own-blog. On a feed item this is the only thing the
    // word "boost" can honestly mean: there is no network to boost on.
    if (this.posseOnly()) {
      actions.push('posse');
    }
    if (this.display.url) {
      actions.push('share');
    }
    return actions;
  });

  /**
   * Whether the 🔁 control opens a menu, or just does the one thing.
   *
   * A menu holding a single item is not a menu, it is an extra click. That was
   * the RSS case exactly: boost and quote are both impossible on a feed item, so
   * the popup opened to offer "Share elsewhere…" and nothing else — a middleman
   * between the reader and the dialog they were already asking for. Below two
   * real choices the button skips the popup and performs the action directly; a
   * Mastodon post still gets its menu, because Boost, Quote and Share there are
   * three genuinely different things.
   */
  protected readonly shareMenuIsUseful = computed(() => this.shareMenuActions().length > 1);

  /** The single action a degenerate menu collapses to, if there is one. */
  protected readonly soleShareAction = computed<ShareMenuAction | null>(() => {
    const actions = this.shareMenuActions();
    return actions.length === 1 ? actions[0] : null;
  });

  /**
   * What the 🔁 button does when it is not opening a menu.
   *
   * Only reachable when exactly one action exists, so there is nothing to
   * choose between and no popup is drawn.
   */
  protected runSoleShareAction(event: Event): void {
    switch (this.soleShareAction()) {
      case 'boost':
        this.toggleReblog(event);
        return;
      case 'quote':
        this.toggleQuote(event);
        return;
      case 'posse':
        this.togglePosseOnly('repost', event);
        return;
      case 'share':
        this.openShare(event);
        return;
      default:
        event.stopPropagation();
    }
  }

  /** Label and tooltip for the 🔁 control, which changes with what it will do. */
  protected readonly shareButtonLabel = computed(() => {
    this.i18n.version();
    if (this.shareMenuIsUseful()) {
      return this.transloco.translate('statusCard.boostQuoteOrShare');
    }
    switch (this.soleShareAction()) {
      case 'boost':
        return this.display.reblogged ? this.words().UndoBoost : this.words().Boost;
      case 'quote':
        return this.transloco.translate('statusCard.quote');
      case 'posse':
        return this.transloco.translate(
          this.posseQueued('repost')
            ? 'statusCard.removeThisBoostFromBlog'
            : 'statusCard.recordBoostOnBlogShort',
        );
      case 'share':
        // Names the dialog it opens, because it opens it on the first press.
        return this.transloco.translate('statusCard.shareThisArticle');
      default:
        return this.transloco.translate('statusCard.shareDefault');
    }
  });

  // --- content warnings ---

  /** CW revealed by the viewer; resets whenever a different status is bound. */
  protected cwOpen = linkedSignal({ source: this.status, computation: () => false });

  /** The CW label to show (a translation may carry its own spoiler text). */
  protected spoilerText = computed(
    () => this.translation()?.spoiler_text || this.display.spoiler_text,
  );

  /**
   * True when the CW should start open because of who wrote it.
   *
   * `display.account` rather than the booster: trust is about whose judgement
   * you're relaxing, and a boost carries someone else's content. Reads the
   * service's signal so trusting someone re-renders their cards immediately.
   */
  protected authorTrustedForCw = computed(() => {
    this.trusted.entries();
    this.followTrust.revision();
    return this.trusted.cwExpanded(this.display.account, this.booster);
  });

  /**
   * True while the body (text, media, poll, quote) hides behind the CW.
   * Reader mode means "I want to read it": CWs render pre-expanded, and so do
   * the CWs of a trusted author.
   */
  protected cwCollapsed = computed(
    () =>
      !!this.spoilerText() &&
      !this.cwOpen() &&
      !this.prefs.feedReader() &&
      !this.authorTrustedForCw(),
  );

  toggleCw(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.cwOpen.update((v) => !v);
  }

  // --- sensitive media ---

  /** Viewer clicked through the sensitive-media blur; resets per status. */
  private sensitiveRevealed = linkedSignal({ source: this.status, computation: () => false });

  /** True when this author's sensitive media should render unblurred. */
  protected authorTrustedForSensitive = computed(() => {
    this.trusted.entries();
    this.followTrust.revision();
    return this.trusted.sensitiveShown(this.display.account, this.booster);
  });

  /**
   * True while media should sit behind a "sensitive content" blur. A CW already
   * gates the whole body, so we only blur when the post is flagged sensitive but
   * carries no spoiler text — and only until the viewer reveals it, or unless
   * the author is trusted.
   */
  protected mediaBlurred = computed(
    () =>
      this.display.sensitive &&
      !this.spoilerText() &&
      !this.sensitiveRevealed() &&
      !this.authorTrustedForSensitive(),
  );

  revealSensitive(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.sensitiveRevealed.set(true);
  }

  /** Older cached poll payloads may omit own_votes; treat them as no selected options. */
  protected pollOwnVote(poll: Poll, index: number): boolean {
    const ownVotes = (poll as Partial<Poll>).own_votes;
    return Array.isArray(ownVotes) && ownVotes.includes(index);
  }

  // --- content filters (server-computed `filtered`, applied client-side) ---

  /** Matched filters that apply in this timeline's context. */
  private activeFilters = computed<FilterResult[]>(() =>
    this.visibility.activeFilters(this.status(), this.filterContext()),
  );

  /** A hide-action filter matched: the post renders as nothing at all. */
  protected hiddenByFilter = computed(() =>
    this.activeFilters().some((r) => r.filter.filter_action === 'hide'),
  );

  /** Viewer clicked "Show anyway" on a warn filter; resets per status. */
  protected filterOverridden = linkedSignal({ source: this.status, computation: () => false });

  /**
   * A warn-action filter matched and hasn't been overridden: show the stub.
   * Reader mode expands these too (hide-action filters still hide outright).
   */
  protected filterCollapsed = computed(
    () =>
      !this.hiddenByFilter() &&
      !this.filterOverridden() &&
      !this.prefs.feedReader() &&
      this.activeFilters().some((r) => r.filter.filter_action === 'warn'),
  );

  /** "Filtered: <titles>" label for the collapsed stub. */
  protected filterTitles = computed(() =>
    [
      ...new Set(
        this.activeFilters()
          .filter((r) => r.filter.filter_action === 'warn')
          .map((r) => r.filter.title),
      ),
    ].join(', '),
  );

  showFiltered(event: Event): void {
    event.stopPropagation();
    this.filterOverridden.set(true);
  }

  protected readonly quotePolicies = QUOTE_POLICIES;

  protected quotePolicyLabel(policy: (typeof QUOTE_POLICIES)[number]): string {
    const suffix = policy[0].toUpperCase() + policy.slice(1);
    return this.transloco.translate(`statusCard.policy${suffix}`);
  }

  protected showReport = signal(false);
  protected reported = signal(false);

  protected editing = signal(false);
  protected editText = signal('');
  protected saving = signal(false);

  // Translation: held locally; null means "showing original".
  protected translation = signal<Translation | null>(null);
  protected translating = signal(false);

  /** Body HTML with mobile-safe bare-link labels and a resolved quote URL removed. */
  protected renderedContent = computed(() =>
    compactContentLinks(
      this.md(this.translation()?.content ?? this.display.content),
      this.linkQuoteUrl(),
    ),
  );

  // Poll voting state (selected option positions before submitting).
  protected pollSelection = signal<number[]>([]);

  // Dialogs.
  protected accountListMode = signal<AccountListMode | null>(null);
  protected showHistory = signal(false);
  protected showPolicyMenu = signal(false);

  // Image lightbox: the index of the attachment being viewed, or null when closed.
  protected lightboxIndex = signal<number | null>(null);

  /** Whether the logged-in user owns the displayed status (can edit/delete). */
  protected isOwn = computed(
    () => !this.capabilities.active && this.display.account.id === this.auth.account()?.id,
  );

  /** True when this status quotes one of the viewer's own statuses (revocable). */
  protected canRevokeQuote = computed(() => {
    const q = this.display.quote?.quoted_status;
    return (
      !this.capabilities.active &&
      !!q &&
      q.account.id === this.auth.account()?.id &&
      this.display.quote?.state === 'accepted'
    );
  });

  /**
   * Mastodon-compatible per-status shortcuts, active while the card is
   * focused (j/k in Hotkeys moves focus here). Handled keys stop propagating
   * so the global handler never doubles up.
   */
  onCardKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const target = event.target as HTMLElement;
    const tag = target.tagName.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || target.isContentEditable) {
      return;
    }
    const key = event.key.toLowerCase();
    if (['a', 'button', 'label'].includes(tag) && key === 'enter') {
      return;
    }
    if (this.handleCardKey(key, event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private handleCardKey(key: string, event: Event): boolean {
    switch (key) {
      case 'f':
        if (this.caps.favourite) {
          this.toggleFavourite(event);
        }
        return true;
      case 'b':
        if (this.caps.reblog) {
          this.toggleReblog(event);
        }
        return true;
      case 'r':
      case 'm':
        if (this.caps.reply) {
          this.toggleReply(event);
        }
        return true;
      case 'q':
        if (!this.foreign && this.capabilities.canCompose) {
          this.toggleQuote(event);
        }
        return true;
      case 'enter':
      case 'o':
        if (this.threadLink) {
          void this.router.navigate(this.threadLink);
        }
        return true;
      case 'p':
        if (this.accountLink) {
          void this.router.navigate(this.accountLink);
        }
        return true;
      case 'e':
        if (this.display.media_attachments?.length) {
          this.lightboxIndex.set(0);
        }
        return true;
      case 'x':
        // Mastodon's shortcut: toggle the content-warning fold.
        if (this.spoilerText()) {
          this.cwOpen.update((v) => !v);
        }
        return true;
      default:
        return false;
    }
  }

  openReport(event: Event): void {
    event.stopPropagation();
    if (!this.canReport) {
      return;
    }
    this.showReport.set(true);
  }

  protected get canReport(): boolean {
    return this.display.provider === 'bluesky'
      ? this.blueskySession.linked()
      : this.capabilities.canManageRelationships && !this.foreign;
  }

  onReported(): void {
    this.showReport.set(false);
    this.reported.set(true);
  }

  /** Mute duration presets for the ••• menu (seconds; null = indefinite). */
  protected readonly muteDurations: { label: string; seconds: number | null }[] = [
    { label: 'statusCard.oneHour', seconds: 3600 },
    { label: 'statusCard.oneDay', seconds: 86400 },
    { label: 'statusCard.sevenDays', seconds: 604800 },
    { label: 'statusCard.forever', seconds: null },
  ];

  /** Hide this post locally for 30 days (there is no server-side per-post hide). */
  mutePost(event: Event): void {
    event.stopPropagation();
    this.mutedPosts.mute(this.display.id);
  }

  /**
   * Mute this card's author for `seconds` (null = indefinitely). Always records
   * a client-side mute (works for every provider, including read-only
   * Anonymous), and additionally issues the real server-side mute when the
   * viewer has that capability, so an authenticated account stays in sync.
   */
  muteAuthorLocally(event: Event, seconds: number | null): void {
    event.stopPropagation();
    this.localMod.mute(this.display.account, seconds);
    if (this.capabilities.canManageRelationships && !this.foreign) {
      this.api.muteAccount(this.display.account.id, seconds ?? undefined).subscribe({
        error: () => this.actionError.set(this.transloco.translate('statusCard.mutedServerFailed')),
      });
    }
  }

  /**
   * Block this card's author. Always records a client-side block (hides them
   * everywhere, works for every provider); also issues the real server-side
   * block when the viewer can, keeping an authenticated account in sync.
   */
  blockAuthorLocally(event: Event): void {
    event.stopPropagation();
    this.localMod.block(this.display.account);
    if (this.capabilities.canManageRelationships && !this.foreign) {
      this.api.block(this.display.account.id).subscribe({
        error: () =>
          this.actionError.set(this.transloco.translate('statusCard.blockedServerFailed')),
      });
    }
  }

  /** Lift a local block/mute on this card's author (client-side only). */
  unsuppressAuthorLocally(event: Event): void {
    event.stopPropagation();
    this.localMod.clear(this.display.account);
  }

  startEdit(event: Event): void {
    event.stopPropagation();
    this.api.getStatusSource(this.display.id).subscribe((src) => {
      this.editText.set(src.text);
      this.editing.set(true);
    });
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  saveEdit(): void {
    const text = this.editText().trim();
    if (!text || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.editStatus(this.display.id, text).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.editing.set(false);
        this.changed.emit(updated);
      },
      error: () => this.saving.set(false),
    });
  }

  remove(event: Event): void {
    event.stopPropagation();
    if (!confirm(this.transloco.translate('statusCard.deletePostConfirm'))) {
      return;
    }
    if (this.display.provider === 'bluesky') {
      const ref = this.display.providerRef as BskyRef;
      this.blueskyApi.deleteRecord(ref.uri).subscribe({
        next: () => this.deleted.emit(this.status()),
        error: () => this.actionError.set(this.actionFailureMessage('delete this post')),
      });
      return;
    }
    this.api.deleteStatus(this.display.id).subscribe(() => this.deleted.emit(this.status()));
  }

  // --- save as to-do ---

  /**
   * Park this post as a to-do: "reply to this later", "write about this later".
   *
   * Saved as a **local draft** quoting the post, not as a published self-post.
   * A `direct` post is a real post on a real server, and one click on a menu
   * should never publish anything — not even to an audience of one. The
   * self-post variant is reachable from /write, deliberately, because choosing
   * "this should follow me between devices" deserves more than a menu item.
   *
   * Works anonymously for the same reason: a local draft needs no server.
   */
  saveAsTodo(event: Event): void {
    event.stopPropagation();
    const vocab = this.prefs.pkmVocabulary();
    const handle = qualifiedHandle(this.display.account);
    const url = this.display.url || '';
    const body = withPkmTag(`Re: @${handle}${url ? ` ${url}` : ''}`, 'todo', vocab);
    const saved = this.drafts.save({
      segments: [body],
      spoilerText: '',
      sensitive: false,
      visibility: this.prefs.defaultVisibility(),
      poll: null,
      quotedStatusId: this.display.id,
      target: 'fedi',
    });
    this.actionNotice.set(
      this.transloco.translate(saved.durable ? 'statusCard.todoSaved' : 'drafts.saveFailed'),
    );
    setTimeout(() => this.actionNotice.set(null), 4000);
  }

  /** Whether the to-do kind has any configured word — an empty list means off. */
  protected todosEnabled(): boolean {
    return this.prefs.pkmVocabulary().todo.length > 0;
  }

  // --- delete & repost ---
  protected redrafting = signal(false);
  protected redraftText = signal('');

  /**
   * Delete the post on the server, then reopen its source text in an inline
   * composer so it can be tweaked and reposted (Blue's "edit", the honest way).
   */
  deleteAndRedraft(event: Event): void {
    event.stopPropagation();
    if (!confirm(this.transloco.translate('statusCard.deleteRedraftConfirm'))) {
      return;
    }
    this.api.getStatusSource(this.display.id).subscribe((src) => {
      this.api.deleteStatus(this.display.id).subscribe(() => {
        this.redraftText.set(src.text);
        this.redrafting.set(true);
      });
    });
  }

  /** The redraft was posted: swap the (already deleted) original for the new status. */
  onRedrafted(status: Status): void {
    this.redrafting.set(false);
    this.changed.emit(status);
  }

  /** Redraft abandoned: the original is gone from the server, so drop the card. */
  cancelRedraft(): void {
    this.redrafting.set(false);
    this.deleted.emit(this.status());
  }

  /** Open the image lightbox at the clicked attachment. */
  openLightbox(index: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.lightboxIndex.set(index);
  }

  /**
   * Whether text was selected when this gesture started.
   *
   * Recorded on `mousedown` because that is the last moment it is knowable: the
   * same event collapses the selection, so `click` always sees an empty one.
   * See {@link onCardClick}.
   */
  private selectionAtMouseDown = false;

  /** Snapshot the selection before the browser clears it. */
  onCardMouseDown(): void {
    this.selectionAtMouseDown = (getSelection()?.toString() ?? '').length > 0;
  }

  /**
   * Open the thread when the click landed on the card's own whitespace.
   *
   * ## Why the card needs this at all
   *
   * Navigation used to hang entirely off the anchor wrapped around the post
   * *text*. That works right up until there is no text: an image-only post is a
   * very common shape, and on one there was literally nothing to click — the
   * picture opens the lightbox, the avatar and display name go to the profile,
   * the action row acts, and every pixel between them did nothing at all.
   *
   * ## Why this is a guard list rather than a handler on the whitespace
   *
   * There is no "whitespace" element to bind to; the gaps are padding and
   * margins belonging to the card and its rows. So the card listens to every
   * click and *declines* the ones that belong to something else. Getting that
   * backwards — navigating unless told not to — is how a card starts eating
   * clicks on its own buttons, so the checks below are deliberately broad:
   *
   * - **Anything interactive**, found by walking up from the target. Buttons,
   *   links, form controls, the poll, the lightbox triggers, the `<details>`
   *   menus. `closest()` rather than checking the target itself, because a
   *   click usually lands on a `<span>` *inside* a button.
   * - **A text selection.** Measured in a real browser: a drag that selects text
   *   fires no `click` at all, so that gesture was never at risk. What remains
   *   is the click that *ends* a selection — text is highlighted, the reader
   *   clicks elsewhere on the card to dismiss it — and there the browser
   *   collapses the selection on `mousedown`, before `click` runs. So the flag
   *   is snapshotted then ({@link selectionAtMouseDown}); reading the live
   *   selection during the click would always see an empty one.
   * - **Modified and non-primary clicks.** Ctrl/cmd/shift/middle-click all mean
   *   "open somewhere else" and are the browser's business, not ours.
   *
   * Keyboard users already had a way through: `onCardKeydown` handles Enter and
   * `o`. This is the pointer equivalent, and it deliberately reuses the same
   * {@link threadLink}, so a card that is not threadable stays inert.
   */
  onCardClick(event: MouseEvent): void {
    const hadSelection = this.selectionAtMouseDown;
    this.selectionAtMouseDown = false;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    // Note: double-clicking post *text* still navigates, because that text is
    // wrapped in its own routerLink and the first click of the pair acts before
    // any second one is known about. That is long-standing behaviour, not
    // something this handler introduced, and fixing it would mean delaying every
    // single click on post text to wait for a possible second — deliberately not
    // done. Guarding `detail > 1` here would only suppress the redundant second
    // navigation, which changes nothing the reader can see.
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    if (target.closest(INTERACTIVE_SELECTOR)) {
      return;
    }
    // Either the gesture began with text already highlighted, or it *was* the
    // drag that highlighted some. Both mean "the user was reading, not
    // navigating".
    if (hadSelection || (getSelection()?.toString() ?? '').length > 0) {
      return;
    }
    const link = this.threadLink;
    if (!link) {
      return;
    }
    void this.router.navigate(link);
  }

  /**
   * Intercept clicks inside rendered post HTML: if the user clicked a link
   * that points off-site, open it in a new tab instead of letting the
   * surrounding router link swallow the navigation.
   */
  onContentClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) {
      return;
    }
    const href = anchor.getAttribute('href');
    if (!href) {
      return;
    }
    // Hashtag links in server-rendered content point at the origin instance
    // (e.g. https://mastodon.social/tags/foo). Keep them in-app: route to
    // Mockingbird's own tag page instead of opening the instance.
    const tag = this.hashtagName(anchor, href);
    if (tag) {
      event.preventDefault();
      event.stopPropagation();
      this.router.navigate(['/tags', tag]);
      return;
    }
    const mention = this.mentionLink(anchor, href);
    if (mention) {
      event.preventDefault();
      event.stopPropagation();
      void this.router.navigate(mention);
      return;
    }
    // A pasted link to somebody's profile. Not a mention (the server did not
    // mark it up as one), but it names an account this app can show, and
    // sending the reader off to a server they are signed out of is the one
    // outcome nobody wants. See mastodonProfileHandle.
    const profile = profileRouteFor(href);
    if (profile) {
      event.preventDefault();
      event.stopPropagation();
      void this.router.navigate(profile);
      return;
    }
    // Treat anything else with an explicit http(s) origin as external.
    if (/^https?:\/\//i.test(href)) {
      event.preventDefault();
      event.stopPropagation();
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  }

  /** Shared with bios and other rendered HTML — see {@link hashtagNameFrom}. */
  private hashtagName(anchor: HTMLAnchorElement, href: string): string | null {
    return hashtagNameFrom(anchor, href);
  }

  /** Route resolved Mastodon mentions to Mawkingbird's profile page. */
  private mentionLink(anchor: HTMLAnchorElement, href: string): (string | number)[] | null {
    if (!anchor.classList.contains('mention') || anchor.classList.contains('hashtag')) return null;
    const visible = (anchor.textContent ?? '').trim().replace(/^@/, '').toLocaleLowerCase();
    const mention = this.display.mentions?.find(
      (candidate) =>
        candidate.url === href ||
        candidate.acct.toLocaleLowerCase() === visible ||
        candidate.username.toLocaleLowerCase() === visible,
    );
    if (!mention) return null;
    if (this.display.provider === 'anonymous-mastodon') {
      try {
        return [
          '/accounts',
          anonymousAccountRouteRef({
            server: new URL(mention.url).origin,
            id: mention.id,
            originalUrl: mention.url,
          }),
        ];
      } catch {
        return null;
      }
    }
    // A mention carries acct + url, which is everything `qualifiedHandle` needs.
    return accountRoutePath({
      id: mention.id,
      handle: qualifiedHandle(mention as unknown as Account) ?? undefined,
    });
  }

  /** The status to render: unwrap a boost to the original. */
  /**
   * An unconfirmed local flip of `favourited` / `reblogged`, or null.
   *
   * Set the instant the reader presses, cleared when the server answers either
   * way — so it is never the source of truth for longer than one request. Held
   * apart from the status rather than written into it because the status is an
   * `input` owned by the feed: mutating it would make a parent re-render undo
   * the feedback, and a failed request would need the original back.
   */
  private optimistic = signal<Partial<Pick<Status, 'favourited' | 'reblogged'>> | null>(null);

  /**
   * An avatar URL, and whether `NgOptimizedImage` is allowed to handle it.
   *
   * `ngSrc` throws NG02952 on a `data:` URI, and some providers legitimately
   * use one: `RSS_AVATAR` is an inline SVG precisely so a feed's icon costs no
   * external fetch. Binding it to `ngSrc` crashed the card — reachable today
   * from the RSS pane, which renders feed items as status cards.
   *
   * So the directive is used where it earns its keep (remote avatars, which are
   * the overwhelming majority and the ones that benefit from lazy loading and
   * fixed dimensions) and skipped where it cannot apply. A data URI needs
   * neither: it is already in the document and cannot be fetched twice.
   */
  protected avatarSrc(account: { avatar_static?: string; avatar?: string }): {
    url: string;
    optimizable: boolean;
  } {
    const url = account.avatar_static || account.avatar || 'favicon-32x32.png';
    return { url, optimizable: !url.startsWith('data:') };
  }

  get display(): Status {
    const s = this.status();
    const base = s.reblog ?? s;
    const pending = this.optimistic();
    if (!pending) {
      return base;
    }
    // Counts move with the flag, or the card shows "Liked" beside an unchanged
    // number and looks broken in a different way than before.
    const favouritesDelta =
      pending.favourited === undefined || pending.favourited === base.favourited
        ? 0
        : pending.favourited
          ? 1
          : -1;
    const reblogsDelta =
      pending.reblogged === undefined || pending.reblogged === base.reblogged
        ? 0
        : pending.reblogged
          ? 1
          : -1;
    return {
      ...base,
      ...pending,
      favourites_count: Math.max(0, base.favourites_count + favouritesDelta),
      reblogs_count: Math.max(0, base.reblogs_count + reblogsDelta),
    };
  }

  /**
   * Who boosted this, or null when it is not a boost.
   *
   * The counterpart to {@link display}: that unwraps to the original author,
   * this keeps hold of the person who passed it along, which the
   * `follows-boosts` trust level needs.
   */
  get booster(): Account | null {
    const s = this.status();
    return s.reblog ? s.account : null;
  }

  protected bookmarkActive(): boolean {
    return this.auth.isAnonymous ||
      (this.display.provider === 'bluesky' && !this.blueskySession.linked())
      ? this.anonymousBookmarks.has(this.display)
      : this.display.bookmarked;
  }

  /**
   * True for posts from a foreign provider (RSS, Bluesky, …). Foreign posts
   * have no server-side account/thread to link to, and their interactions are
   * capability-gated — RSS is read-only, so it gets "Open original" instead.
   */
  protected get foreign(): boolean {
    return (this.display.provider ?? 'mastodon') !== 'mastodon';
  }

  /**
   * A provider that reports real engagement counts the viewer cannot act on.
   *
   * X is the first of these and the reason this exists. Its posts carry genuine
   * reply, repost and like counts — 244 likes, 77k views on a real NASA post —
   * but no viewer of this app can add to them, because every write on Twitter needs an
   * authenticated Twitter account this app deliberately never asks for.
   *
   * Before this, those numbers were invisible: the counts render under
   * `caps.favourite`/`caps.reblog`, which are `false` for Twitter precisely *because*
   * the actions are impossible. So the capability flag was doing two jobs —
   * "can you press this" and "is there a number worth showing" — and the second
   * answer was wrong. RSS and paste genuinely have nothing to show; X has a lot.
   */
  protected get readOnlyStats(): boolean {
    return this.display.provider === 'twitter';
  }

  /**
   * This post on Nitter, or null when it is not a tweet.
   *
   * Null rather than a fallback so the template can keep "↗ Open original" for
   * every other foreign provider — an RSS item's original site is the whole
   * point of the link, and there is nothing to rewrite it to.
   */
  /** The mirror's host, so the link names where it actually goes. */
  protected get nitterLabel(): string {
    return nitterHost();
  }

  protected get nitterLink(): string | null {
    return this.display.provider === 'twitter' ? toNitterUrl(this.display.url) : null;
  }

  /**
   * True when the thread page can render this post in a conversation view.
   * Bluesky threads load via `getPostThread`; RSS items open a reader view of
   * the article (plus a comment feed when the publisher declares one).
   */
  protected get threadable(): boolean {
    if (this.isLocalPractice) {
      return true;
    }
    const provider = this.display.provider ?? 'mastodon';
    if (provider === 'anonymous-mastodon') {
      const ref = this.anonymousRef;
      return !!ref && !ref.statusId.startsWith('rss:');
    }
    return (
      provider === 'mastodon' ||
      provider === 'bluesky' ||
      provider === 'rss' ||
      // tweets open a thread view backed by `tweet/replies`. Costs one request
      // per open, which is why the thread page shows the price and does not
      // walk ancestors — see spec/ui/twitter_remaining_roadmap.md §2.
      provider === 'twitter'
    );
  }

  protected get threadLink(): (string | number)[] | null {
    if (!this.threadable) return null;
    // Local practice posts (Eliza's and the viewer's) thread by their raw id;
    // the thread page reads them from the browser-local stores.
    if (this.isLocalPractice) {
      return ['/statuses', this.display.id];
    }
    const ref = this.anonymousRef;
    if (this.display.provider === 'anonymous-mastodon') {
      if (!ref?.statusId) return null;
      return [
        '/statuses',
        anonymousStatusRouteRef({
          server: ref.server,
          id: ref.statusId,
          originalUrl: this.display.url ?? undefined,
        }),
      ];
    }
    return ['/statuses', this.display.id];
  }

  protected get longTextLink(): (string | number)[] | null {
    const thread = this.threadLink;
    return thread ? ['/read', thread[1]] : null;
  }

  /**
   * The account link for this card's author, or null when there's no profile to
   * open. RSS feeds get a synthetic "feed = profile" page (`/accounts/rss:<url>`);
   * per-comment author accounts (`rss:<url>::author::<name>`) have no page.
   */
  protected get accountLink(): (string | number)[] | null {
    const id = this.display.account.id;
    if (!this.foreign) {
      // Handle in the path alongside the id, so the link still finds the right
      // person after a change of server — ids are per-server and a short one
      // can silently resolve to a different account elsewhere.
      return accountRoutePath({ id, handle: qualifiedHandle(this.display.account) ?? undefined });
    }
    // Eliza's posts (and the viewer's own local practice posts) link straight to
    // the author's profile by id — Eliza's synthetic profile, or the viewer's.
    if (this.isLocalPractice) {
      return ['/accounts', id];
    }
    const ref = this.anonymousRef;
    if (this.display.provider === 'anonymous-mastodon' && ref?.accountId) {
      return [
        '/accounts',
        anonymousAccountRouteRef({
          server: ref.server,
          id: ref.accountId,
          originalUrl: this.display.account.url || undefined,
        }),
      ];
    }
    if (this.display.provider === 'rss' && id.startsWith('rss:') && !id.includes('::')) {
      return ['/accounts', id];
    }
    // Twitter accounts already have a working profile page (the Sprint 4 screen);
    // nothing linked to it, which made avatars and display names dead text.
    if (this.display.provider === 'twitter' && id.startsWith('twitter:@')) {
      return ['/accounts', id];
    }
    // Bluesky ids are `bsky:<did>`, and a DID is route-safe (`did:plc:abc123`).
    if (this.display.provider === 'bluesky' && id.startsWith('bsky:')) {
      return ['/accounts', id];
    }
    return null;
  }

  private get anonymousRef(): AnonymousProviderRef | null {
    const ref = this.display.providerRef as Partial<AnonymousProviderRef> | undefined;
    if (
      !ref ||
      typeof ref.server !== 'string' ||
      typeof ref.statusId !== 'string' ||
      typeof ref.accountId !== 'string'
    ) {
      return null;
    }
    try {
      const protocol = new URL(ref.server).protocol;
      return protocol === 'https:' || protocol === 'http:' ? (ref as AnonymousProviderRef) : null;
    } catch {
      return null;
    }
  }

  protected get providerBadge(): string | null {
    switch (this.display.provider) {
      case 'rss':
        return '📡 RSS';
      case 'bluesky':
        return '🦋 Bluesky';
      case 'anonymous-mastodon':
        return '🐘 Mastodon';
      case 'twitter':
        return '🐦 Twitter';
      case 'blog':
        return '✍️ Blog';
      default:
        return null;
    }
  }

  /** Which interactions this post's network supports (buttons hide per provider). */
  protected get caps(): ProviderCapabilities {
    return this.capabilities.statusCaps(this.display.provider ?? 'mastodon');
  }

  /** A browser-local practice post — the viewer's own (`local:`) or one of
   *  Eliza's (`eliza:`). These support replying locally even for anonymous
   *  visitors, and their replies route through {@link LocalPostStore}, never the
   *  network. */
  protected get isLocalPractice(): boolean {
    const id = this.display.id;
    return id.startsWith('local:') || isElizaId(id);
  }

  /** Whether to show an enabled reply affordance: either the network supports it,
   *  or it's a local practice post the viewer can always reply to. */
  protected get canReply(): boolean {
    return this.caps.reply || this.isLocalPractice;
  }

  /** Public Mastodon edit history remains readable without a user token. */
  protected get canViewPublicHistory(): boolean {
    const ref = this.anonymousRef;
    return (
      this.auth.isAnonymous && !!this.display.edited_at && !!ref && !ref.statusId.startsWith('rss:')
    );
  }

  protected get historyStatusId(): string {
    return this.anonymousRef?.statusId ?? this.display.id;
  }

  protected get historyServer(): string | null {
    return this.display.provider === 'anonymous-mastodon'
      ? (this.anonymousRef?.server ?? null)
      : null;
  }

  get boostedBy(): string | null {
    const s = this.status();
    return s.reblog ? s.account.display_name : null;
  }

  /**
   * The booster's profile, or null when there is nowhere to send the reader.
   *
   * "John Doe boosted this" was bare text, so the only way to find out who John
   * Doe is — or to go and turn off their boosts — was to search their name by
   * hand. The account was in reach the whole time: {@link booster} already
   * returns it for the follow-trust check.
   *
   * The booster is the *outer* status's account, which is the reader's own
   * server's view of them, so this takes the same handle-plus-id route as
   * {@link accountLink}'s native case rather than the provider-specific
   * branches — a boost only exists on a provider that has profiles.
   */
  protected get boosterLink(): (string | number)[] | null {
    const booster = this.booster;
    if (!booster || this.foreign) {
      return null;
    }
    return accountRoutePath({
      id: booster.id,
      handle: qualifiedHandle(booster) ?? undefined,
    });
  }

  /** The quoted status to embed, if this status quotes a visible one. */
  protected quotedStatus = computed<Status | null>(
    () => this.display.quote?.quoted_status ?? this.linkQuote(),
  );

  /** Thread route for both native quote entities and URL-resolved remote quotes. */
  protected quoteThreadLink(status: Status): (string | number)[] {
    const ref = status.providerRef as Partial<AnonymousProviderRef> | undefined;
    if (status.provider === 'anonymous-mastodon' && ref?.server && ref.statusId) {
      return [
        '/statuses',
        anonymousStatusRouteRef({
          server: ref.server,
          id: ref.statusId,
          originalUrl: status.url ?? undefined,
        }),
      ];
    }
    return ['/statuses', status.id];
  }

  /** True when a quote exists but the quoted status is hidden (e.g. revoked). */
  protected quoteUnavailable = computed<boolean>(() => {
    const q = this.display.quote;
    return !!q && q.quoted_status === null;
  });

  // --- inline reply / quote ---
  toggleReply(event: Event): void {
    event.stopPropagation();
    // Local practice posts are always replyable; otherwise a real compose
    // capability is required.
    if (!this.capabilities.canCompose && !this.isLocalPractice) {
      return;
    }
    this.quoting.set(false);
    this.replying.update((v) => !v);
  }

  toggleQuote(event: Event): void {
    event.stopPropagation();
    if (!this.capabilities.canCompose) {
      return;
    }
    this.replying.set(false);
    this.quoting.update((v) => !v);
  }

  /** A reply was posted: bump the local count and bubble it up to the container. */
  onReplied(reply: Status): void {
    this.replying.set(false);
    this.changed.emit({ ...this.display, replies_count: this.display.replies_count + 1 });
    this.replied.emit(reply);
  }

  /** A quote post was created: surface it to the container like a reply. */
  onQuoted(quote: Status): void {
    this.quoting.set(false);
    this.replied.emit(quote);
  }

  /**
   * Which action is in flight, or null. One at a time, by construction.
   *
   * ## Why this replaced a single boolean
   *
   * `actionBusy` was one flag for the whole card, bound to `[disabled]` on five
   * separate controls. Two things followed, both bad:
   *
   * - A disabled icon button looks exactly like an idle one. On a phone, where
   *   there is no hover and no cursor to read, a tap that landed and a tap that
   *   missed the target produced the identical picture — which is the reported
   *   "no clues if you failed to touch the tiny button or if it is still in
   *   progress".
   * - Any one action greyed out all five. Pressing Like made Boost, Share and
   *   Bookmark go dead too, so the card looked like it was doing five things.
   *
   * Naming the action fixes the second and lets {@link busyWith} drive a visible
   * state for the first.
   */
  protected inFlight = signal<'favourite' | 'reblog' | 'bookmark' | null>(null);

  /** Whether *this* action is the one waiting on the network. */
  protected busyWith(action: 'favourite' | 'reblog' | 'bookmark'): boolean {
    return this.inFlight() === action;
  }

  /**
   * True while any action is in flight.
   *
   * Kept for the share *menu*, whose items must not be pressable mid-boost —
   * that is a genuine correctness guard rather than a feedback signal.
   */
  protected actionBusy = computed(() => this.inFlight() !== null);
  /** Last fav/boost failure, shown under the actions row until the next attempt. */
  protected actionError = signal<string | null>(null);
  /** Successful external actions are announced without styling them as failures. */
  protected actionNotice = signal<string | null>(null);
  protected showBookmarkProviders = signal(false);
  protected externalBookmarkUrl = computed(() =>
    firstExternalLink(this.display.content, this.server.baseUrl()),
  );

  /**
   * Which action an anonymous reader just asked for, or null when no prompt is up.
   *
   * Holds the i18n *key suffix* rather than a rendered phrase so the heading
   * translates with the rest of the page — resolved in {@link signInAction}.
   */
  protected signInFor = signal<'like' | 'reply' | 'boost' | null>(null);

  /** The translated phrase the prompt puts in its heading. */
  protected signInAction = computed(() => {
    const action = this.signInFor();
    return action ? this.transloco.translate(`signInPrompt.action.${action}`) : '';
  });

  /**
   * Answer a tap on an action an anonymous reader cannot perform.
   *
   * `stopPropagation` because the card itself navigates to the thread on click,
   * and opening a dialog and leaving the page at the same time is neither.
   */
  protected promptSignIn(action: 'like' | 'reply' | 'boost', event: Event): void {
    event.stopPropagation();
    this.signInFor.set(action);
  }

  toggleFavourite(event: Event): void {
    event.stopPropagation();
    if (!this.caps.favourite) {
      return;
    }
    // Routed by provider (Mastodon API vs Bluesky like records). Foreign calls
    // cross the network to another service, so show pending + surface failures
    // (a silently dead Bluesky session used to make this button "do nothing").
    this.inFlight.set('favourite');
    this.actionError.set(null);
    const target = this.display;
    // Flip the heart now and correct it from the response. The action is
    // idempotent and the success path already replaces this state with the
    // server's own, so an optimistic answer is never a lie that outlives the
    // request — and it is the only feedback that arrives within one frame,
    // which is what a tap on a phone needs.
    this.optimistic.set({ favourited: !target.favourited });
    this.actions.toggleFavourite(target).subscribe({
      next: (updated) => {
        this.inFlight.set(null);
        this.optimistic.set(null);
        this.recordPosse('like', target, updated.favourited);
        this.changed.emit(updated);
      },
      error: () => {
        this.inFlight.set(null);
        // Put the heart back. The failure message says why.
        this.optimistic.set(null);
        this.actionError.set(this.actionFailureMessage('like'));
      },
    });
  }

  /**
   * Open the share dialog, capturing any highlighted text first.
   *
   * The capture has to happen here, in the click handler: opening the dialog
   * moves focus into it and collapses the selection, so reading it inside the
   * dialog would always find nothing. `selectionWithin` also refuses a selection
   * made in a *different* card, which would otherwise quote the wrong post
   * silently.
   */
  openShare(event: Event): void {
    event.stopPropagation();
    this.shareQuote.set(selectionWithin(this.host.nativeElement));
    this.shareMenuOpen.set(false);
    this.showShare.set(true);
  }

  /**
   * Open the unified menu with Boost focused.
   *
   * Boost is the most-used action on this bar, and a menu that turns it into two
   * presses would be a regression however tidy the bar looks. Focusing the first
   * item means `Enter` still boosts — one press, as before. Done here rather
   * than with an `autofocus` attribute, which the a11y lint rejects for good
   * reasons that do not apply to a menu the user just opened.
   */
  toggleShareMenu(event: Event): void {
    event.stopPropagation();
    const opening = !this.shareMenuOpen();
    this.shareMenuOpen.set(opening);
    if (!opening) {
      return;
    }
    afterNextRender(
      () => {
        const host = this.host.nativeElement as HTMLElement;
        host.querySelector<HTMLButtonElement>('.share-menu [role="menuitem"]')?.focus();
      },
      { injector: this.injector },
    );
  }

  /** Open a composer prefilled by the share dialog. */
  onShareCompose(request: ComposeShareRequest): void {
    this.shareCompose.set(request);
  }

  toggleReblog(event: Event): void {
    event.stopPropagation();
    if (!this.caps.reblog) {
      return;
    }
    this.inFlight.set('reblog');
    this.actionError.set(null);
    const target = this.display;
    // Same reasoning as the heart above: show the boost immediately, let the
    // response overwrite it, put it back if the request fails.
    this.optimistic.set({ reblogged: !target.reblogged });
    this.actions.toggleReblog(target).subscribe({
      next: (updated) => {
        this.inFlight.set(null);
        this.optimistic.set(null);
        const result = updated.reblog ?? updated;
        this.recordPosse('repost', target, result.reblogged || !!updated.reblog);
        this.changed.emit(result);
      },
      error: () => {
        this.inFlight.set(null);
        this.optimistic.set(null);
        this.actionError.set(this.actionFailureMessage('boost'));
      },
    });
  }

  /**
   * Mirror an interaction into the POSSE queue, when that is switched on.
   *
   * Called only from the *success* path of the real action, and deliberately
   * additive: the Mastodon (or Bluesky) request above is unchanged, and nothing
   * here can make a working like look broken. Queueing is a synchronous
   * localStorage write whose failures are swallowed by the queue itself.
   *
   * Un-toggling removes a still-queued entry, so liking and immediately
   * un-liking leaves nothing behind. Once published it is a commit in a repo
   * and the queue has no further claim on it.
   */
  /**
   * True where an interaction can be *recorded* but not *sent*.
   *
   * RSS and Twitter items have no network to like on, so with POSSE switched on
   * their cards offer record-only buttons instead. With it off there is nowhere
   * to record to, and the buttons are absent rather than inert.
   */
  protected posseOnly(): boolean {
    return this.hugo.posseEnabled() && canPosseOnly(this.display.provider) && !!this.display.url;
  }

  /** Whether this interaction is already waiting in the queue. */
  protected posseQueued(kind: PosseKind): boolean {
    const url = this.display.url;
    return !!url && this.posse.has(kind, url);
  }

  /**
   * Record — or un-record — an interaction that has no network behind it.
   *
   * Issues **no HTTP request at all**, which is the entire point: there is no
   * endpoint to call for a feed item, and pretending otherwise is what
   * `PROVIDER_CAPS.rss` correctly refuses. This writes to localStorage and
   * nothing else.
   */
  protected togglePosseOnly(kind: PosseKind, event: Event): void {
    event.stopPropagation();
    if (!this.posseOnly()) {
      return;
    }
    if (this.posseQueued(kind)) {
      this.posse.removeMatching(kind, this.display.url);
    } else {
      this.posse.add(kind, this.display);
    }
  }

  private recordPosse(kind: PosseKind, target: Status, active: boolean): void {
    if (!this.hugo.posseEnabled()) {
      return;
    }
    if (active) {
      this.posse.add(kind, target);
    } else {
      this.posse.removeMatching(kind, target.url);
    }
  }

  private actionFailureMessage(
    verb: 'delete this post' | 'like' | 'boost' | 'bookmark this post',
  ): string {
    const actionKeys = {
      'delete this post': 'statusCard.delete',
      like: 'pages.profile.media.like',
      boost: 'pages.profile.media.boost',
      'bookmark this post': 'statusCard.bookmark',
    } as const;
    const localizedVerb =
      this.transloco.getActiveLang() === 'ko' ? this.transloco.translate(actionKeys[verb]) : verb;
    return this.display.provider === 'bluesky'
      ? this.transloco.translate('statusCard.actionFailureBluesky', { verb: localizedVerb })
      : this.transloco.translate('statusCard.actionFailure', { verb: localizedVerb });
  }

  toggleBookmark(event: Event): void {
    event.stopPropagation();
    if (!this.capabilities.canBookmark) {
      return;
    }
    if (this.raindrop.connected()) {
      this.showBookmarkProviders.set(true);
      return;
    }
    this.toggleNativeBookmark();
  }

  protected chooseBookmark(choice: BookmarkChoice): void {
    this.showBookmarkProviders.set(false);
    if (choice === 'mastodon') {
      this.toggleNativeBookmark();
      return;
    }
    // A real round trip to Raindrop, so it gets the bookmark button's busy state
    // rather than the whole card's.
    this.inFlight.set('bookmark');
    this.actionError.set(null);
    this.actionNotice.set(null);
    const target = choice === 'raindrop-link' ? 'external-link' : 'post';
    void this.raindrop
      .addBookmark(this.display, target, this.externalBookmarkUrl() ?? undefined)
      .then(() => {
        this.inFlight.set(null);
        this.actionNotice.set(
          choice === 'raindrop-link'
            ? this.transloco.translate('statusCard.externalLinkSaved')
            : this.transloco.translate('statusCard.postSavedToRaindrop'),
        );
      })
      .catch((error: unknown) => {
        this.inFlight.set(null);
        this.actionError.set(
          error instanceof Error
            ? error.message
            : this.transloco.translate('statusCard.raindropBookmarkFailed'),
        );
      });
  }

  /**
   * Bookmark locally or on the server, depending on where the post lives.
   *
   * The test is "does the home server know this post", not "am I signed in".
   * Those coincide for Mastodon posts and come apart for every foreign
   * provider: a signed-in reader bookmarking a tweet used to send
   * `twitter:2083…` to `/api/v1/statuses/{id}/bookmark`, which 404s and loses
   * the bookmark silently. Anonymous readers got a working local bookmark for
   * the same post, so signing in made the feature worse — parity inverted.
   *
   * Local storage is the right home for these regardless of session: the home
   * server cannot bookmark a post it has never seen, and {@link
   * AnonymousBookmarks} already keys off the status rather than a Mastodon id.
   */
  private toggleNativeBookmark(): void {
    const s = this.display;
    if (s.provider === 'bluesky' && this.blueskySession.linked()) {
      const ref = s.providerRef as BskyRef;
      const call = s.bookmarked
        ? this.blueskyApi.deleteBookmark(ref.uri)
        : this.blueskyApi.createBookmark(ref.uri, ref.cid);
      call.subscribe({
        next: () => this.changed.emit({ ...s, bookmarked: !s.bookmarked }),
        error: () => this.actionError.set(this.actionFailureMessage('bookmark this post')),
      });
      return;
    }
    if (this.auth.isAnonymous || s.provider === 'bluesky' || !serverKnowsStatus(s.provider)) {
      this.changed.emit(this.anonymousBookmarks.toggle(s));
      return;
    }
    const call = s.bookmarked ? this.api.unbookmark(s.id) : this.api.bookmark(s.id);
    call.subscribe((updated) => this.changed.emit(updated));
  }

  togglePin(event: Event): void {
    event.stopPropagation();
    const s = this.display;
    const call = s.pinned ? this.api.unpin(s.id) : this.api.pin(s.id);
    call.subscribe((updated) => this.changed.emit(updated));
  }

  toggleMute(event: Event): void {
    event.stopPropagation();
    const s = this.display;
    const call = s.muted ? this.api.unmuteStatus(s.id) : this.api.muteStatus(s.id);
    call.subscribe((updated) => this.changed.emit(updated));
  }

  // --- translation ---
  toggleTranslate(event: Event): void {
    event.stopPropagation();
    if (this.translation()) {
      this.translation.set(null);
      return;
    }
    // Already in your language: the call would hand back the post you are reading, so
    // it is refused before it costs a request or a slot in the daily budget.
    if (this.alreadyInTargetLanguage()) {
      this.translateError.set(this.sameLanguageMessage());
      return;
    }
    // Metered against the instance's own budget, which is separate from OpenRouter's
    // (see TranslationUsage). Checked before the call, not after: a limit that only
    // notices once the request is in flight has not limited anything.
    if (!this.usage.canSpend('mastodon')) {
      this.translateError.set(this.limitMessage('mastodon'));
      return;
    }
    this.translating.set(true);
    this.translateError.set(null);
    this.usage.record('mastodon');
    this.api.translate(this.display.id).subscribe({
      next: (t) => {
        this.translation.set(t);
        this.translating.set(false);
      },
      error: () => {
        this.translating.set(false);
        // Most servers have no translation provider configured at all, so this is
        // the common path rather than an edge. Offer the way out instead of
        // dead-ending on a button that did nothing.
        this.translateError.set(
          this.openrouter.connected()
            ? this.transloco.translate('statusCard.serverTranslateFailedWithAi')
            : this.transloco.translate('statusCard.serverTranslateFailed'),
        );
      },
    });
  }

  // --- AI translation (anonymous-great sprint 3) ---
  private openrouter = inject(OpenRouterSession);
  private ai = inject(AiAvailability);
  private aiTranslate = inject(AiTranslate);
  protected translatePref = inject(TranslationPreference);

  /** Untrusted model output. Rendered as text; never near the `[innerHTML]` path. */
  protected aiTranslation = signal<AiTranslation | null>(null);
  protected aiTranslating = signal(false);
  protected translateError = signal<string | null>(null);
  protected translateChoiceOpen = signal(false);
  protected rememberChoice = signal(false);

  /** Per-engine daily budgets. Injected here because this card owns both call sites. */
  private usage = inject(TranslationUsage);

  /**
   * What to say when an engine's daily hard limit has been reached.
   *
   * Names the engine, because the other one may still have allowance — "you are out of
   * translations" would be wrong when only half the capability is exhausted, and would
   * hide the fact that there is a second way through.
   */
  /**
   * True when this post already appears to be in the language we'd translate into.
   *
   * The target is whatever the translator would aim for — the reader's own language —
   * so this asks `AiTranslate` for it rather than assuming English.
   */
  private alreadyInTargetLanguage(): boolean {
    return this.eligibility.isAlreadyTargetLanguage(
      this.display,
      this.aiTranslate.targetLanguage(),
    );
  }

  /** Explains a refusal, and says how to override it — never a dead end. */
  private sameLanguageMessage(): string {
    const target = languageName(this.aiTranslate.targetLanguage());
    return this.transloco.translate('statusCard.sameLanguage', { target });
  }

  private limitMessage(engine: TranslationEngine): string {
    return this.transloco.translate('statusCard.translationLimit', {
      engine: ENGINE_LABELS[engine],
      limit: this.usage.hardLimit(engine),
    });
  }

  /**
   * Whether to show the 🤖🌐 button.
   *
   * For anonymous readers: **always**, connected or not. This is a deliberate
   * exception to `openrouter-0-overview.md` decision 9 ("helper buttons are hidden
   * when OpenRouter isn't connected — no upsell, no teaser"). That rule holds where
   * a helper is an addition to a surface that already works; here `canUseServerActions`
   * has taken the only translate button away, so hiding this one makes the capability
   * invisible rather than merely unavailable. Unconnected, it explains itself once.
   *
   * For signed-in users the rule stands: the server 🌐 already works, so the AI
   * button appears only once OpenRouter is connected.
   */
  protected showAiTranslate = computed(
    () => this.capabilities.active || this.openrouter.connected() || this.serverCannotTranslate,
  );

  /**
   * True when the home server could not translate this post even if asked.
   *
   * Translation for a read-only provider means "ask the autorouter": the server
   * has never seen an X, RSS or paste post, so `/api/v1/statuses/{id}/translate`
   * can only fail on an id it cannot resolve. The AI path works from the post
   * text already in hand, so it is the only one that can succeed.
   *
   * Without this the 🌐 button was hidden (it needs `canUseServerActions`) and
   * the 🤖🌐 button was hidden too (it needed anonymous mode), so a signed-in
   * reader looking at a tweet got no translate control at all — the
   * capability vanished rather than being merely unavailable.
   */
  protected get serverCannotTranslate(): boolean {
    return !serverKnowsStatus(this.display.provider);
  }

  /** Drives the dialog's two faces: chooser when connected, upsell when not. */
  // AI translation is an AI surface, so it answers to the AI switch as well as
  // to whether a key exists. See AiAvailability.
  protected openrouterConnected = computed(() => this.ai.enabled() && this.openrouter.connected());

  /** The 🌐 click for a signed-in user, routed by preference. */
  translateByPreference(event: Event): void {
    event.stopPropagation();
    switch (this.translatePref.choice()) {
      case 'ai':
        void this.runAiTranslate();
        return;
      case 'ask':
        this.translateChoiceOpen.set(true);
        return;
      default:
        this.toggleTranslate(event);
    }
  }

  /** Chosen from the ask-dialog. Optionally remembered. */
  chooseTranslator(which: 'server' | 'ai', event: Event): void {
    event.stopPropagation();
    this.translateChoiceOpen.set(false);
    if (this.rememberChoice()) {
      this.translatePref.set(which);
    }
    if (which === 'ai') {
      void this.runAiTranslate();
    } else {
      this.toggleTranslate(event);
    }
  }

  /**
   * Translate with the chosen model, or explain why we can't.
   *
   * Unconnected is not an error state — it is a thing the user hasn't set up yet, so
   * it gets a sentence and a link rather than red text.
   */
  async runAiTranslate(): Promise<void> {
    if (this.aiTranslation()) {
      this.aiTranslation.set(null);
      return;
    }
    if (!this.openrouter.connected()) {
      this.translateChoiceOpen.set(true);
      return;
    }
    if (this.alreadyInTargetLanguage()) {
      this.translateError.set(this.sameLanguageMessage());
      return;
    }
    // OpenRouter's budget is its own. Spending here must never be blocked by, or
    // consume, the instance endpoint's allowance — the two engines fail independently.
    if (!this.usage.canSpend('openrouter')) {
      this.translateError.set(this.limitMessage('openrouter'));
      return;
    }
    this.aiTranslating.set(true);
    this.translateError.set(null);
    this.usage.record('openrouter');
    try {
      this.aiTranslation.set(await this.aiTranslate.translateHtml(this.display.content));
    } catch (error: unknown) {
      this.translateError.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate('statusCard.modelTranslateFailed'),
      );
    } finally {
      this.aiTranslating.set(false);
    }
  }

  onAiTranslateClick(event: Event): void {
    event.stopPropagation();
    void this.runAiTranslate();
  }

  // --- automatic translation (i18n sprint 3) ---

  private eligibility = inject(AutoTranslateEligibility);
  private host = inject(ElementRef<HTMLElement>);
  private featureFlags = inject(FeatureFlags);
  private injector = inject(Injector);

  /**
   * True once this card has tried to auto-translate, successfully or not.
   *
   * Guards against the trigger firing repeatedly — an `IntersectionObserver` reports
   * every scroll back into view, and a hover fires on every pass of the mouse. Without
   * this, reading a post twice would pay for it twice. Set before the request rather
   * than after, so an in-flight translation cannot be started again by a second event.
   */
  private autoTried = false;

  /** Whether the translation on this card came from the automatic path. */
  protected autoTranslated = signal(false);

  /**
   * True when this card's translation should render *below* the original rather than
   * replacing it. Only ever set for a language the reader is learning.
   */
  protected appendMode = signal(false);

  /** The observer watching this card, when the trigger mode is `view`. */
  private observer: IntersectionObserver | null = null;

  constructor() {
    // The trigger is set up reactively rather than in ngOnInit because the mode can
    // change while cards are on screen: switching to `hover` mid-scroll must detach the
    // observers immediately, not at the next navigation.
    effect(() => {
      const mode = this.prefs.autoTranslateMode();
      this.detachObserver();
      if (mode === 'view' && !this.autoTried) {
        this.attachObserver();
      }
    });
    inject(DestroyRef).onDestroy(() => this.detachObserver());
  }

  private attachObserver(): void {
    // jsdom has no IntersectionObserver, and neither do very old browsers. Absent it,
    // `view` mode simply never fires — which is the safe direction for a feature that
    // spends money.
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void this.autoTranslate();
        }
      },
      // A little over half the card visible: enough that it is genuinely being read,
      // rather than clipping the viewport edge during a fast scroll.
      { threshold: 0.6 },
    );
    this.observer.observe(this.host.nativeElement);
  }

  private detachObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  /** The hover trigger. Does nothing unless `hover` is the chosen mode. */
  onCardHover(): void {
    if (this.prefs.autoTranslateMode() === 'hover') {
      void this.autoTranslate();
    }
  }

  /**
   * Translate this post automatically, if it is one of the posts that should be.
   *
   * Every early return here is a call not spent. The eligibility rules live in
   * {@link AutoTranslateEligibility}; the budget lives in {@link TranslationUsage}; this
   * method's only job is to consult both before doing anything, and to stop trying once
   * it has tried.
   */
  private async autoTranslate(): Promise<void> {
    if (this.autoTried || this.translation() || this.aiTranslation()) {
      return;
    }
    if (!this.eligibility.shouldTranslate(this.display)) {
      return;
    }
    // Silent here, unlike the manual path: nobody asked, so there is nothing to explain.
    if (this.alreadyInTargetLanguage()) {
      return;
    }
    // Claimed up front: two intersection callbacks can arrive before the first request
    // resolves, and each would otherwise start its own.
    this.autoTried = true;
    this.detachObserver();
    this.appendMode.set(this.eligibility.appends(this.display));

    // Automatic translation uses the instance endpoint unless the reader has explicitly
    // allowed it to spend OpenRouter credit. A read-only provider's post has no server
    // translation to ask for, so AI is the only engine that could work — but that is
    // still not permission to spend, so it is skipped rather than silently upgraded.
    const useAi = this.prefs.autoTranslateUsesAi() && this.openrouterConnected();
    if (this.serverCannotTranslate && !useAi) {
      return;
    }

    const engine = useAi ? 'openrouter' : 'mastodon';
    if (!this.usage.canSpend(engine)) {
      // Silent: an automatic pass hitting its ceiling is the budget working, not an
      // error the reader needs interrupting for. The count is on the settings screen.
      return;
    }

    this.autoTranslated.set(true);
    if (useAi) {
      this.usage.record('openrouter');
      this.aiTranslating.set(true);
      try {
        this.aiTranslation.set(await this.aiTranslate.translateHtml(this.display.content));
      } catch {
        // A failed automatic translation leaves the original post exactly as it was,
        // which is a perfectly good outcome. Errors belong to translations the reader
        // asked for by pressing something.
        this.autoTranslated.set(false);
      } finally {
        this.aiTranslating.set(false);
      }
      return;
    }

    this.usage.record('mastodon');
    this.translating.set(true);
    this.api.translate(this.display.id).subscribe({
      next: (t) => {
        this.translation.set(t);
        this.translating.set(false);
      },
      error: () => {
        this.translating.set(false);
        this.autoTranslated.set(false);
      },
    });
  }

  /**
   * The original post body, for the append view.
   *
   * `renderedContent()` swaps the translation in for the original, which is the right
   * behaviour for replace mode and exactly wrong for a learner: they need both. This
   * renders the untranslated body regardless of translation state, so the append block
   * can show the original above and the translation below.
   */
  protected originalContent = computed(() =>
    compactContentLinks(this.md(this.display.content), this.linkQuoteUrl()),
  );

  // --- polls ---
  protected poll = computed<Poll | null>(() => this.display.poll);

  protected pollClosed = computed<boolean>(() => {
    const p = this.poll();
    return this.capabilities.active || !p || p.expired || p.voted;
  });

  pollPercent(option: { votes_count: number }): number {
    const total = this.poll()?.votes_count ?? 0;
    return total === 0 ? 0 : Math.round((option.votes_count / total) * 100);
  }

  toggleChoice(position: number): void {
    const p = this.poll();
    if (!p) {
      return;
    }
    if (p.multiple) {
      this.pollSelection.update((sel) =>
        sel.includes(position) ? sel.filter((x) => x !== position) : [...sel, position],
      );
    } else {
      this.pollSelection.set([position]);
    }
  }

  submitVote(event: Event): void {
    event.stopPropagation();
    if (!this.capabilities.canUseServerActions) {
      return;
    }
    const p = this.poll();
    if (!p || !this.pollSelection().length) {
      return;
    }
    this.api.votePoll(p.id, this.pollSelection()).subscribe((updated) => {
      // Reflect the updated poll back onto the status for re-render.
      this.changed.emit({ ...this.display, poll: updated });
      this.pollSelection.set([]);
    });
  }

  // --- favourited/reblogged-by dialogs ---
  openAccountList(mode: AccountListMode, event: Event): void {
    event.stopPropagation();
    this.accountListMode.set(mode);
  }

  // --- edit history ---
  openHistory(event: Event): void {
    event.stopPropagation();
    this.showHistory.set(true);
  }

  // --- interaction policy / quote revoke ---
  togglePolicyMenu(event: Event): void {
    event.stopPropagation();
    this.showPolicyMenu.update((v) => !v);
  }

  setPolicy(policy: string): void {
    this.api.setInteractionPolicy(this.display.id, policy).subscribe((updated) => {
      this.changed.emit(updated);
      this.showPolicyMenu.set(false);
    });
  }

  revokeQuote(event: Event): void {
    event.stopPropagation();
    const quoted = this.display.quote?.quoted_status;
    if (!quoted) {
      return;
    }
    // The viewer owns the quoted status; revoke this status's quote of it.
    this.api
      .revokeQuote(quoted.id, this.display.id)
      .subscribe((updated) => this.changed.emit(updated));
  }
}
