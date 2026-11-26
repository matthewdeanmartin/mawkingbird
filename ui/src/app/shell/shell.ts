import { Server } from '../platform/http/server';
import { ReadingHistory } from './reading-history';
import { ReadingOutlet } from './reading-outlet';
import { accountScopeSuffix } from '../platform/session/account-scope';
import { BlueskyModeration } from '../connections/bluesky/bluesky-moderation';
import { accountProfilePath } from '../accounts/account-route';
import { MbContentState } from '../design-system/content-state/content-state';
import { MbButton } from '../design-system/button/button';
import { ConnectionChip } from './connection-chip/connection-chip';
import { MbControl, MbField } from '../design-system/field/field';
import { FeatureUseHistory } from '../feeds/feature-use-history';
import { PlusPrice } from '../accounts/mawkingbird/plus-price';
import { PlusPaywallDialog } from '../accounts/mawkingbird/plus-paywall-dialog';
import { AiBudgetPrompt } from '../translation/ai-budget-prompt';
import { ProxyLimitNotice } from '../connections/cors-proxy/proxy-limit-notice';
import {
  Component,
  computed,
  effect,
  ElementRef,
  forwardRef,
  HostListener,
  inject,
  OnInit,
  signal,
  Type,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NgComponentOutlet, NgOptimizedImage } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { filter, map, MonoTypeOperatorFunction, retry, throwError, timer } from 'rxjs';
import { Api } from '../platform/api/api';
import { MenuIndicators } from './menu-indicators';
import { AccountChoice, Auth, Session } from '../platform/session/auth';
import { ClientPrefs } from '../platform/storage/client-prefs';
import { BotPeers } from '../chat/bot-peers';
import { environment } from '../../environments/environment';
import { brandLogoSrc, isCanaryBuild, isTestBuild } from '../platform/build/build-flavor';
import { Hotkeys } from './hotkeys';
import { ShortcutHelp } from './shortcut-help/shortcut-help';
import { EvenMore } from './even-more/even-more';
import { AppFooter } from './app-footer/app-footer';
import { LeftRail } from './left-rail/left-rail';
import { RightRail } from './right-rail/right-rail';
import { ServerAbout } from '../discovery/server-about';
import { FeatureFlags } from '../platform/build/feature-flags';
import { LeaveChoice, LeaveDialog } from './leave-dialog/leave-dialog';
import { WritingZen } from '../publishing/writing-zen';
import { ReadingZen } from '../reading/reading-zen';
import { Wellness } from '../wellness/wellness';
import { DiscoveryBanner } from '../wellness/discovery-banner';
import { WellnessTime } from '../wellness/wellness-time';
import {
  ACCOUNT_FILTER_THRESHOLD,
  AccountSwitcher,
  accountLabel,
  filterAccountChoices,
} from '../accounts/account-switcher';
import { Account } from '../platform/api/models';
import { AccountReplyCounts } from '../accounts/account-reply-counts';
import { NavFit } from './nav-fit';
import { AddAccountDialog } from '../accounts/sign-in/add-account-dialog/add-account-dialog';
import { FirstRunChoice, FirstRunModal } from '../accounts/first-run/first-run-modal';
import { PreviewSeed } from '../accounts/first-run/preview-seed';
import { ScreenShare } from './screen-share/screen-share';
import { ScreenShareBadge, ScreenShareCover } from './screen-share/screen-share-badge';
import { OnboardingLauncher } from '../accounts/onboarding/onboarding-launcher';
import { setupRedirectFor } from '../accounts/setup/setup-store';
import { PlusBadgeEntitlement } from '../accounts/mawkingbird/plus-badge-entitlement';
import { visiblePlusBenefits } from '../platform/build/plus-benefits';
import { TranslocoService, TranslocoPipe } from '@jsverse/transloco';
import { TranslatedText } from '../i18n/translated';
import { AppModeService } from '../platform/build/app-mode';
import { RadioOutlet } from './radio-outlet';
import { RailOutlet } from './rail-outlet';
import { focusedAppFor, MODE_NAV, ModeNavItem } from './mode-nav';
import { ModeSwitch } from './mode-switch';
import { AccountTabBanner } from '../platform/session/account-tab-guard/account-tab-banner';
import {
  NATIVE_FOLLOW_COLLECT,
  NATIVE_FOLLOW_STATUS,
  NATIVE_NOTIFICATION_COLLECT,
  NATIVE_PROFILES,
  NativeFollowStatus,
} from '../platform/session/platform-login';
/** Between two people read for the bulk archive, and the longest wait when there is nothing to do. */
const TRICKLE_MS = 60_000;
const TRICKLE_IDLE_MS = 15 * 60_000;
// i18n shell.archive.progress: Local people inventory: {{count}} found so far. Reading more in the background.
// i18n shell.archive.paused: Local people inventory paused after {{count}}. It will resume when you reopen the app.
// i18n shell.nav.posts: Posts
// i18n shell.nav.profiles: Profiles

// i18n shell.testDeployment: Test deployment — nothing here is real. Payments use Stripe's sandbox and no money moves. The real app is at
// i18n shell.deployment.canary: Canary
// i18n shell.deployment.test: Test
// i18n shell.skipToMain: Skip to main content
// i18n shell.sidebar.accountsDiscovery: Accounts and discovery
// i18n shell.sidebar.serverRecommendations: Server information and recommendations
// i18n shell.plan.state.checking: Checking…
// i18n shell.plan.state.plus: Plus
// i18n shell.plan.state.unavailable: Plan?
// i18n shell.plan.state.free: Free
// i18n shell.plan.badgePlusAria: Mawkingbird Plus active — show plan details
// i18n shell.plan.badgeCheckingAria: Checking Mawkingbird plan — show plan details
// i18n shell.plan.badgeUnavailableAria: Could not check Mawkingbird plan — show plan details
// i18n shell.plan.badgeFreeAria: Mawkingbird Free — show what Plus adds
// i18n shell.plan.ariaBenefits: Mawkingbird plan benefits
// i18n shell.plan.activeName: Mawkingbird Plus
// i18n shell.plan.freeName: Mawkingbird Free
// i18n shell.plan.activeDescription: Thanks — your subscription is active. Here is what it is doing.
// i18n shell.plan.checkingDescription: Checking your account before deciding which plan is active…
// i18n shell.plan.unavailableDescription: The account service could not confirm your plan. Open the Plus page to retry.
// i18n shell.plan.freeDescription: Free works without a subscription. Here is what Plus adds.
// i18n shell.plan.close: Close plan details
// i18n shell.plan.freeLabel: Free:
// i18n shell.plan.plusLabel: Plus:
// i18n shell.plan.subscriptionDetails: Subscription details and diagnostics
// i18n shell.plan.seePlus: See the Plus page — ${{price}} a year
// i18n shell.plus.readHere.label: Read articles without leaving
// i18n shell.plus.readHere.free: A couple of full articles a day. Links always open in a new tab for free.
// i18n shell.plus.readHere.plus: Open as many as you like, laid out to read, without losing your place.
// i18n shell.plus.sameEverywhere.label: The same on your phone and your PC
// i18n shell.plus.sameEverywhere.free: Everything you set up stays on this computer. Save a file to move it yourself.
// i18n shell.plus.sameEverywhere.plus: Your feeds, lists and settings follow you to every device you sign in on.
// i18n shell.nav.primary: Primary navigation
// i18n shell.brandHome: {{brand}} home
// i18n shell.nav.home: Home
// i18n shell.nav.algo: Algo
// i18n shell.nav.inbox: Inbox
// i18n shell.nav.chat: Chat
// i18n shell.nav.newActivity: New activity
// i18n shell.nav.search: Search
// i18n shell.nav.feeds: Feeds
// i18n shell.nav.videos: Videos
// i18n shell.nav.rss: RSS
// i18n shell.nav.login: Login
// i18n shell.navShort.home: Home
// i18n shell.navShort.algo: Algo
// i18n shell.navShort.inbox: Inbox
// i18n shell.navShort.chat: Chat
// i18n shell.navShort.search: Search
// i18n shell.navShort.feeds: Feeds
// i18n shell.navShort.login: Login
// i18n shell.nav.moreAria: More navigation
// i18n shell.nav.more: More
// i18n shell.menu.settings: Settings
// i18n shell.menu.onboarding: Onboarding
// i18n shell.menu.screenShareOn: Start screen share mode
// i18n shell.menu.screenShareOff: Stop screen share mode
// i18n shell.menu.likesBookmarksHistory: Likes, bookmarks, history
// i18n shell.menu.bookmarksHistory: Bookmarks, history
// i18n shell.menu.myServer: My server
// i18n shell.menu.manageRss: Manage RSS feeds
// i18n shell.menu.watchParties: Watch parties
// i18n shell.menu.write: Write
// i18n shell.menu.drafts: Drafts
// i18n shell.menu.scheduled: Scheduled posts
// i18n shell.menu.waitingToPublish: Waiting to publish
// i18n shell.menu.pastes: Pastes
// i18n shell.menu.links: Links
// i18n shell.menu.findFriends: Find Friends
// i18n shell.menu.invites: Invites
// i18n shell.menu.analytics: Analytics
// i18n shell.menu.evenMore: Even more…
// i18n shell.menu.observability: Observability
// i18n shell.menu.help: Help
// i18n shell.menu.news: Site News
// i18n shell.menu.canary: Canary ↗
// i18n shell.menu.faults: Faults
// i18n shell.menu.apiDocs: API Docs ↗
// i18n shell.menu.admin: Admin
// i18n shell.account.switch: Switch account
// i18n shell.account.filter: Filter accounts
// i18n shell.account.filterPlaceholder: Filter by name, @handle or server
// i18n shell.account.noMatch: No account matches.
// i18n shell.account.all: All accounts ({{count}})…
// i18n shell.account.anonymous: Anonymous
// i18n shell.account.unavailable: Account details unavailable
// i18n shell.account.add: + Add account
// i18n shell.account.exitAnonymous: Exit anonymous
// i18n shell.account.logout: Log out
// i18n shell.account.menuFor: Account menu for {{name}}
// i18n shell.toast.removed: Removed that account. Nothing else changed.
// i18n shell.toast.dismiss: Dismiss
// i18n shell.dead.thatAccount: That account
// i18n shell.dead.thisServer: this server
// i18n shell.dead.title: Can't switch to {{name}}
// i18n shell.dead.description: {{server}} rejected that account's saved session. This usually means it expired, or the access was revoked.
// i18n shell.dead.note: You're still signed in as before — nothing has changed yet.
// i18n shell.dead.reauthenticate: Reauthenticate
// i18n shell.dead.remove: Remove account
// i18n shell.dead.cancel: Cancel

function isWideUrl(url: string): boolean {
  // /search goes rails-off wide so facets have room to live beside results.
  // /write does too, and for the mirror-image reason: it spends the width on
  // drafts and notes instead of on trending tags and people to follow.
  // /rss is a two-pane reader: its own left rail of subscriptions would be
  // competing with the shell's rails for the same edge of the screen.
  return (
    url.startsWith('/settings') ||
    // Diagnostics pages: tables, charts and logs that need the width, and the
    // rails' who-to-follow material is beside the point there.
    url.startsWith('/observability') ||
    url === '/connection' ||
    url.startsWith('/connection?') ||
    url.startsWith('/storage-diagnostics') ||
    url.startsWith('/conversations') ||
    url.startsWith('/search') ||
    url.startsWith('/write') ||
    url === '/watch' ||
    url.startsWith('/watch?') ||
    url.startsWith('/rss') ||
    // RSS's Shelf keeps RSS's layout (owner, 2026-11-26).
    (url.startsWith('/bookmarks?') &&
      new URLSearchParams(url.split('?')[1]?.split('#')[0]).get('kind') === 'rss') ||
    url === '/videos' ||
    url.startsWith('/videos?') ||
    url.startsWith('/videos/search') ||
    url.startsWith('/videos/parties') ||
    // Focused mini-apps keep to one task: no rails competing with it.
    focusedAppFor(url) !== null
  );
}

/**
 * A nav label's abbreviation, for when the full labels do not fit (see NavFit).
 * Literal keys, so the i18n checks see them used. Translators supply real
 * abbreviations ("Skrz." for Skrzynka odbiorcza); where a language has none,
 * or its short form equals the full one, the nav goes straight to icons.
 */
const NAV_SHORT_KEYS: Readonly<Record<string, string>> = {
  'shell.nav.home': 'shell.navShort.home',
  'shell.nav.algo': 'shell.navShort.algo',
  'shell.nav.inbox': 'shell.navShort.inbox',
  'shell.nav.chat': 'shell.navShort.chat',
  'shell.nav.search': 'shell.navShort.search',
  'shell.nav.feeds': 'shell.navShort.feeds',
  'shell.nav.login': 'shell.navShort.login',
};

@Component({
  selector: 'app-shell',
  imports: [
    DiscoveryBanner,
    ScreenShareBadge,
    ScreenShareCover,
    WellnessTime,
    AddAccountDialog,
    NavFit,
    ReadingOutlet,
    AccountTabBanner,
    MbContentState,
    MbButton,
    PlusPrice,
    PlusPaywallDialog,
    AiBudgetPrompt,
    ProxyLimitNotice,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LeftRail,
    RightRail,
    AppFooter,
    ShortcutHelp,
    EvenMore,
    NgOptimizedImage,
    LeaveDialog,
    FirstRunModal,
    NgComponentOutlet,
    TranslocoPipe,
    ModeSwitch,
    MbField,
    MbControl,
    ConnectionChip,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  // Lets routed pages (the full account picker) reuse this switch flow.
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [{ provide: AccountSwitcher, useExisting: forwardRef(() => Shell) }],
})
export class Shell implements OnInit, AccountSwitcher {
  private readonly nativeFollowCollect = inject(NATIVE_FOLLOW_COLLECT);
  private readonly nativeFollowStatus = inject(NATIVE_FOLLOW_STATUS);
  private readonly nativeNotificationCollect = inject(NATIVE_NOTIFICATION_COLLECT);
  private readonly nativeProfiles = inject(NATIVE_PROFILES);
  protected readonly nativeProfilesAvailable = this.nativeProfiles !== null;
  protected readonly archiveStatus = signal<NativeFollowStatus | null>(null);
  protected readonly archivePaused = signal(false);
  private readonly archiveInventory = effect((onCleanup) => {
    const handle = this.auth.kind() === 'mastodon' ? this.auth.token() : null;
    if (
      !handle?.startsWith('native-mastodon:') ||
      !this.auth.account() ||
      !this.nativeFollowStatus
    ) {
      this.archiveStatus.set(null);
      this.archivePaused.set(false);
      return;
    }
    this.archivePaused.set(false);
    let cancelled = false;
    let paused = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let notificationTimer: ReturnType<typeof setTimeout> | undefined;
    let seedTimer: ReturnType<typeof setTimeout> | undefined;
    let notificationsStarted = false;
    const collectNotifications = () => {
      if (cancelled || !this.nativeNotificationCollect) return;
      void this.nativeNotificationCollect(handle)
        .then((report) => {
          if (!cancelled && !report.complete)
            notificationTimer = setTimeout(collectNotifications, 30_000);
        })
        .catch((error: unknown) => {
          if (
            !cancelled &&
            typeof error === 'object' &&
            error !== null &&
            'kind' in error &&
            error.kind === 'busy'
          ) {
            notificationTimer = setTimeout(collectNotifications, 30_000);
          }
        });
    };
    // The bulk archive trickles: one person, one call, about once a minute
    // (the queue's order is the host's). Backs off while the server struggles.
    const trickle = (delay: number) => {
      const profiles = this.nativeProfiles;
      if (cancelled || !profiles) return;
      const backOff = () => Math.min(delay * 2, TRICKLE_IDLE_MS);
      seedTimer = setTimeout(() => {
        void profiles.seedRecent(handle, 1).then(
          (report) =>
            trickle(
              report.rateLimited ? backOff() : report.profiles ? TRICKLE_MS : TRICKLE_IDLE_MS,
            ),
          () => trickle(backOff()),
        );
      }, delay);
    };
    const poll = async (startIfNeeded = false) => {
      try {
        const status = await this.nativeFollowStatus!(handle);
        if (cancelled) return;
        this.archiveStatus.set(status);
        if (startIfNeeded && !status?.complete) {
          void this.nativeFollowCollect?.(handle).catch(() => {
            if (!cancelled) {
              paused = true;
              this.archivePaused.set(true);
            }
          });
        }
        if (status?.complete && !notificationsStarted) {
          notificationsStarted = true;
          collectNotifications();
          trickle(TRICKLE_MS);
        }
        if (!status?.complete && !paused) timeout = setTimeout(() => void poll(), 2000);
      } catch {
        if (!cancelled) this.archiveStatus.set(null);
      }
    };
    void poll(true);
    onCleanup(() => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      if (notificationTimer) clearTimeout(notificationTimer);
      if (seedTimer) clearTimeout(seedTimer);
    });
  });
  protected readonly radioOutlet = inject(RadioOutlet);
  /** A page's own rails (Forum), shown in place of the defaults while set. */
  protected readonly railOutlet = inject(RailOutlet);
  protected readonly accountProfilePath = accountProfilePath;
  private bskyModeration = inject(BlueskyModeration);
  private readonly featureUseHistory = inject(FeatureUseHistory);
  protected indicators = inject(MenuIndicators);
  protected auth = inject(Auth);
  protected readonly replyCounts = inject(AccountReplyCounts);
  private transloco = inject(TranslocoService);
  private readonly dictionary = inject(TranslatedText).version;

  /**
   * The short form of a nav label in the active language, or null. Only a
   * short form the language itself provides counts: the English fallback
   * would put "Inbox" in a Polish nav.
   */
  protected readonly navShort = computed(() => {
    this.dictionary();
    const lang = this.transloco.getActiveLang();
    const dict = this.transloco.getTranslation(lang) as Record<string, unknown>;
    return (labelKey: string): string | null => {
      const key = NAV_SHORT_KEYS[labelKey];
      const short = key ? dict[key] : undefined;
      if (typeof short !== 'string' || !short) return null;
      return short === this.transloco.translate<string>(labelKey) ? null : short;
    };
  });
  private bots = inject(BotPeers);
  private preview = inject(PreviewSeed);
  protected onboarding = inject(OnboardingLauncher);

  /**
   * The onboarding card's component, fetched the first time it is needed.
   *
   * A dynamic import rather than `@defer`: the wizard, its questions and their
   * dependencies stay out of the initial bundle either way, and this keeps the
   * shell's own metadata synchronous for everything that renders it.
   */
  protected onboardingCard = signal<Type<unknown> | null>(null);
  private readonly loadOnboardingCard = effect(() => {
    if (this.onboarding.mode() && !this.onboardingCard()) {
      void import('../accounts/onboarding/onboarding-card').then((m) =>
        this.onboardingCard.set(m.OnboardingCard),
      );
    }
  });

  /**
   * Whether an anonymous visitor has anyone to chat with.
   *
   * Anonymous accounts cannot reach the real chat API, so the entry is worth
   * showing only when a browser-local correspondent exists. In practice that
   * is always true while AI is on, because Eliza is unconditional — but the
   * check is against the peer list rather than assuming so, since that list is
   * the thing the page actually renders. It is also what a future bot (a docs
   * search bot, say) would add itself to.
   */
  protected hasLocalChat = computed(() => this.bots.peers().length > 0);
  private api = inject(Api);
  private router = inject(Router);
  /** Mastodon-compatible keyboard shortcuts (and the "?" help dialog). */
  protected hotkeys = inject(Hotkeys);
  protected prefs = inject(ClientPrefs);
  private wellness = inject(Wellness);
  /**
   * Writing zen, which hides the header and footer too — those are shell-owned
   * and outside the router outlet, so /write cannot hide them by itself. This is
   * a different feature from `prefs.zenMode` (see {@link WritingZen}); writing
   * zen hides a strict superset, so the two are safe to have on at once.
   */
  protected writingZen = inject(WritingZen);
  /**
   * Reading zen: reader mode's transient hold on the rails. ORed with the saved
   * preference below rather than writing it, so opening an article never
   * reconfigures the app for someone who had zen on — or off — already.
   */
  protected readingZen = inject(ReadingZen);

  /** Rails hidden: the saved preference, or a reader-mode hold. */
  protected readonly railsHidden = computed(() => this.prefs.zenMode() || this.readingZen.active());

  /**
   * Header and footer hidden: writing zen, or the reader page's `full` hold.
   *
   * Both are the same claim — "this surface is the whole screen" — made by two
   * features that hide an identical superset of the chrome. Kept as one
   * computed so the five places that ask cannot drift apart, which they did
   * while `railsHidden` and the writing-zen checks were maintained separately.
   */
  protected readonly chromeHidden = computed(
    () => this.writingZen.active() || this.readingZen.chromeHidden(),
  );
  protected serverAbout = inject(ServerAbout);
  protected featureFlags = inject(FeatureFlags);

  /** Build flavor: drives the brand and whether mock-only nav links are shown. */
  protected mockTooling = environment.mockTooling;
  /** Canary deployments (/canary/ base href) show a distinct name, mark, accent. */
  protected isCanary = isCanaryBuild();
  /**
   * Test deployments (/test/ base href) say so, loudly and permanently.
   *
   * Unlike canary — which is production, for real customers, with new features
   * — /test/ talks to the sandbox Worker and sandbox Stripe. Nothing bought
   * there is real, so it must never be mistakable for the app that takes money.
   */
  protected isTest = isTestBuild();
  protected brand = environment.brand;
  protected deploymentLabel = this.isCanary ? 'Canary' : this.isTest ? 'Test' : null;
  /** Recomputed so switching illustration sets repaints the mark without a reload. */
  protected logoSrc = computed(() => brandLogoSrc(this.prefs.artStyle()));
  /** The header's account plan badge, settled without eagerly bundling account services. */
  protected plusBadge = inject(PlusBadgeEntitlement);
  /** Same source of truth as the Plus settings page; feature-flagged rows stay honest. */
  protected plusBenefits = computed(() =>
    visiblePlusBenefits((flag) => this.featureFlags.enabled(flag)),
  );

  protected benefitText(benefit: { id: string }, field: 'label' | 'free' | 'plus'): string {
    const benefitKey = benefit.id.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    return this.transloco.translate(`shell.plus.${benefitKey}.${field}`);
  }

  /**
   * Whether the plan card is open.
   *
   * This used to be a hover popover, and hover is the wrong pattern for a card
   * you are meant to *reach*: the badge and the card are separated by a gap,
   * the pointer travels diagonally, and any moment the cursor is over neither
   * closes it — so the card vanishes on the way to the thing you wanted to
   * click. A disclosure has none of that quality by construction. It opens on
   * click, stays open until you dismiss it, and closes on Escape, on an outside
   * click, or on navigation.
   */
  private planCardOpen = signal(false);
  protected readonly planOpen = this.planCardOpen.asReadonly();
  /** The toggle, so focus can return to it when the card closes. */
  private readonly planTrigger = viewChild<ElementRef<HTMLButtonElement>>('planTrigger');

  protected togglePlanCard(): void {
    this.planCardOpen.update((open) => !open);
  }

  /**
   * Close, optionally putting focus back on the badge.
   *
   * Focus returns for keyboard dismissals (Escape, or the card's own close
   * button) — a pointer dismissal must not yank focus back, because the click
   * that closed it is usually a click on something else.
   */
  protected closePlanCard(restoreFocus = false): void {
    if (!this.planCardOpen()) {
      return;
    }
    this.planCardOpen.set(false);
    if (restoreFocus) {
      this.planTrigger()?.nativeElement.focus();
    }
  }

  /**
   * An outside click closes the card.
   *
   * Bound on the document rather than with a full-screen backdrop element so
   * the rest of the header stays clickable while the card is up: dismissing it
   * should not cost the reader the click they actually meant to make.
   */
  @HostListener('document:pointerdown', ['$event'])
  protected onDocumentPointerDown(event: Event): void {
    if (!this.planCardOpen()) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && this.planWrap()?.nativeElement.contains(target)) {
      return;
    }
    this.closePlanCard();
  }

  @HostListener('document:keydown.escape')
  protected onDocumentEscape(): void {
    this.closePlanCard(true);
  }

  private readonly planWrap = viewChild<ElementRef<HTMLElement>>('planWrap');

  /** Whether the current account holds a staff role (drives the Admin nav link). */
  protected isStaff = computed(() => {
    const role = this.auth.account()?.role;
    return !!role && role.name !== '';
  });

  /** Which app the primary nav serves — see spec/top_level_menu.md. */
  protected readonly appMode = inject(AppModeService);

  /** The router URL, for mode tabs whose 'current' depends on query params. */
  protected readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** A focused mini-app replaces the mode's tabs and hides the mode switcher. */
  protected readonly focusedApp = computed(() => focusedAppFor(this.currentUrl()));

  /** The current mode's (or mini-app's) tabs, less any this visitor cannot use. */
  protected readonly modeItems = computed(() =>
    (this.focusedApp()?.items ?? MODE_NAV[this.appMode.mode()])
      .map((item) =>
        item.id === 'algo' && this.wellness.demoteGoodStuff() && !this.auth.isAnonymous
          ? {
              // Wellness: the tab opens Catch-up. Good Stuff (and Bluesky's
              // Discover, the same idea) stay reachable from Feeds.
              ...item,
              link: '/algo/catch-up',
              subitems: undefined,
            }
          : item.id === 'algo' && this.auth.isBlueskyPrimary
            ? {
                // Still "Algo" to the reader; for Bluesky it is the Discover feed.
                ...item,
                link: '/for-you',
                active: (url: string) => url.split(/[?#]/, 1)[0] === '/for-you',
                subitems: undefined,
              }
            : item,
      )
      .filter((item) => {
        // The Misskey visitor has no account either: no inbox, nothing joined.
        if (item.requires === 'signedIn')
          return !this.auth.isAnonymous && !this.auth.isMisskeyVisitor;
        if (item.requires === 'chat') return !this.auth.isAnonymous || this.hasLocalChat();
        // The archive is the desktop app's; the web has nothing to read it from.
        if (item.requires === 'native') return !!this.nativeProfiles && !this.auth.isAnonymous;
        return true;
      }),
  );

  /** Activity dots are a signed-in Mastodon thing; Anonymous chat has none. */
  protected hasActivity(item: ModeNavItem): boolean {
    if (!item.activity || this.auth.isAnonymous) return false;
    return item.activity === 'ordinary' ? this.indicators.ordinary() : this.indicators.chat();
  }

  /** Settings and chat take the full width below the top bar (no rails), like 2018 Twitter. */
  protected wide = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => isWideUrl(this.router.url)),
    ),
    { initialValue: isWideUrl(this.router.url) },
  );

  /**
   * The routed column, which takes focus after each navigation.
   *
   * Angular swaps the outlet's contents but leaves focus where it was —
   * usually the nav link that was just activated. A screen reader user would
   * hear nothing and stay parked in the navbar, so moving focus to the top of
   * the new page is what actually makes the navigation perceivable. It also
   * puts Tab back at the start of the content rather than mid-navbar.
   */
  private readonly mainColumn = viewChild<ElementRef<HTMLElement>>('mainColumn');

  protected readonly readingHistory = inject(ReadingHistory);
  private readonly readingServer = inject(Server);
  private readonly readingIdentity = effect(() => {
    this.auth.kind();
    this.auth.token();
    this.auth.account();
    this.readingServer.baseUrl();
    this.readingHistory.setScope(`${accountScopeSuffix()}:${this.readingServer.baseUrl()}`);
  });

  constructor() {
    this.indicators.start();
    // Bluesky muted words and moderation services, from the account's Bluesky
    // preferences. Nothing happens without a linked Bluesky account. Muted
    // words are signals, so cards already on screen filter once they arrive.
    void this.bskyModeration.ensureLoaded();
    // Not in ngOnInit: that returns early for anonymous visitors, and route
    // focus has to work for them too.
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        // The outlet renders during navigation, but the new component's own
        // view may not be committed yet; wait a tick so focus lands on a
        // <main> that already holds the new page.
        // A route change is a dismissal: the card is header chrome, and leaving
        // it open over a page the reader just navigated to is stale furniture.
        this.closePlanCard();
        // A minutes-old account (any sign-in path) goes to full-page setup.
        const setup = setupRedirectFor(this.router.url);
        if (setup) {
          void this.router.navigateByUrl(setup, { replaceUrl: true });
          return;
        }
        // A brand-new account's first Home visit opens the onboarding card.
        this.onboarding.maybeAutoOpen(this.router.url, this.firstRunActive());
        setTimeout(() => {
          if (!this.readingHistory.restoring) this.focusMain();
        });
      });
  }

  /** The leave/log-out confirmation, which also offers to erase browser data. */
  protected showLeave = signal(false);

  /**
   * Whether the first-run modal is up.
   *
   * Read once at construction rather than as a live signal: the preview flag is
   * plain `localStorage`, and re-reading it mid-session would let an unrelated
   * write re-open a modal the visitor has already answered.
   */
  private firstRunActive = signal(this.previewRunning());

  /** The preview ends with any sign-in, by whichever door: the question is answered. */
  private previewRunning(): boolean {
    if (!this.preview.active) return false;
    if (this.auth.isAnonymous) return true;
    this.preview.clear();
    return false;
  }

  /** The public page the front door was opened from, if the visitor came from one. */
  protected readonly firstRunFrom = this.preview.from?.title ?? null;
  protected firstRun = this.firstRunActive.asReadonly();

  /**
   * The visitor answered. Clear the seed, then go where they asked.
   *
   * The seed is cleared on **every** path, not just "continue" — someone who
   * signs in with Mastodon must not discover an anonymous account carrying
   * three follows they never chose. `clear()` skips any of the three they
   * genuinely followed while the preview was up.
   *
   * The login paths use `location.assign` for the same reason account switching
   * does: services cache storage-backed state in signals at construction, so a
   * soft navigation would leave `AnonymousFollows` serving follows that are no
   * longer in storage.
   *
   * ## Why "continue" navigates instead of staying put
   *
   * It used to just return, leaving the visitor on `/home` — whose three seeded
   * follows had been removed a line earlier. So the timeline they had been
   * reading while they decided disappeared on the click that dismissed the
   * modal, and they landed on the empty state. Watching a first-time user hit
   * this, the empty state's single button was not read as the next step: it
   * looks like a message about a problem, not an instruction.
   *
   * Even followed, that button starts a four-screen walk — the Find Friends hub
   * (ten rows), then the kit list, then a kit, then "Follow everyone". Every one
   * of those screens asks the visitor to choose a *method* when what they need
   * is people. Twitter and Mastodon both force a follow step, and neither routes
   * through a hub to reach it.
   *
   * So this goes straight to the kits, the one screen where a stranger with no
   * account gets a working timeline in one press. The hub still exists and is
   * still the right answer for someone browsing deliberately; it is the wrong
   * thing to put in front of someone who has just been shown an empty feed.
   */
  protected answerFirstRun(choice: FirstRunChoice): void {
    const from = this.preview.from;
    this.preview.clear();
    this.firstRunActive.set(false);
    if (choice === 'anonymous') {
      this.auth.chooseAnonymous();
      // Safe now: the app is theirs to navigate. `start()` is idempotent.
      this.hotkeys.start();
      void this.router.navigateByUrl('/bundled-starter-kits');
      return;
    }
    // Leave Anonymous so the login page opens signed-out, exactly as the
    // header's own Log in button does.
    this.auth.exitAnonymous();
    // Back to the page they came from, as undecided as they were on it.
    location.assign(choice === 'back' ? (from?.url ?? '/').slice(1) : `login/${choice}`);
  }

  /**
   * Move focus into the routed column.
   *
   * Shared by the skip link and the post-navigation effect. `<main>` carries
   * `tabindex="-1"` so it can accept focus programmatically without joining the
   * tab order; `preventScroll` because the router's own scroll restoration has
   * already decided where the page should sit.
   */
  protected focusMain(): void {
    this.mainColumn()?.nativeElement.focus({ preventScroll: true });
  }

  /**
   * Skip-link activation.
   *
   * The href stays `#main` so the control degrades to a real anchor and shows
   * a sane target in the status bar, but the router would treat a bare
   * fragment navigation as a route change, so move focus directly instead.
   */
  protected skipToMain(event: Event): void {
    event.preventDefault();
    this.focusMain();
  }

  /** Transient, non-blocking message (e.g. a failed account switch). null = hidden. */
  protected toast = signal<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private showToast(message: string): void {
    this.toast.set(message);
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => this.toast.set(null), 6000);
  }

  dismissToast(): void {
    this.toast.set(null);
  }

  /**
   * A saved account whose token its instance rejected, from either a failed
   * switch or a failed verify on boot. In both cases the token has been cleared,
   * so it is *not* the active account — which is exactly why this has to exist.
   * The account menu's Log out acts on the active account, so without an
   * explicit escape the user could neither enter the broken account nor remove it.
   */
  protected deadSession = signal<AccountChoice | null>(null);

  /** Human label for the stuck account, for the dialog copy. */
  protected deadSessionName = computed<string | null>(() => {
    const s = this.deadSession();
    return s?.account?.display_name || s?.account?.username || null;
  });

  protected deadSessionServer = computed<string | null>(() => {
    const s = this.deadSession();
    return s?.server ? s.server.replace(/^https?:\/\//, '') : null;
  });

  /**
   * Close the dialog. If the failure happened on boot there is no signed-in
   * account behind it, so dismissing has to land somewhere usable rather than
   * leaving a logged-out shell rendering empty feeds.
   */
  protected dismissDeadSession(): void {
    this.deadSession.set(null);
    if (!this.auth.isAuthenticated) {
      location.assign('login');
    }
  }

  /**
   * Sign in again to refresh the rejected token. The failed switch already
   * restored that session's instance, so the login page opens pointed at the
   * right host; ?add=1 stops it bouncing a signed-in user home.
   */
  protected reauthenticate(): void {
    const session = this.deadSession();
    if (!session?.token) {
      return;
    }
    // Re-point at the dead session's instance without activating its token, so
    // the login page offers the host the account actually belongs to.
    this.auth.prepareReauth(session.token);
    // Straight to the Mastodon page, past the network chooser: the account being
    // re-authenticated is a Mastodon one, so there is nothing to choose.
    location.assign('login/mastodon?add=1');
  }

  /** Give up on the stuck account and drop it from the switcher. */
  protected forgetDeadSession(): void {
    const session = this.deadSession();
    if (!session?.token) {
      return;
    }
    this.auth.removeSession(session.token);
    this.deadSession.set(null);
    if (!this.auth.isAuthenticated) {
      // Boot-failure case: that was the only account, so there is nothing to
      // stay signed in as.
      location.assign('login');
      return;
    }
    // removeSession only touches the active account if it *was* active; it isn't
    // here, so the current identity is untouched and no reload is needed.
    this.showToast(this.transloco.translate('shell.toast.removed'));
  }

  /** The "Even more" dialog (spec/sprint/explore-2026-11.md, Sprint 5). */
  protected readonly evenMoreOpen = signal(false);
  /** Where focus goes back to when it closes: the … menu's own button. */
  protected evenMoreReturn: HTMLElement | null = null;

  /** The … menu's Even more entry: close the menu, open the dialog. */
  protected openEvenMore(event: Event): void {
    const details = (event.currentTarget as HTMLElement).closest('details');
    this.evenMoreReturn = details?.querySelector('summary') ?? null;
    details?.removeAttribute('open');
    this.evenMoreOpen.set(true);
  }

  /** Optional server links are discovered only when the user opens More. */
  onMoreToggle(event: Event): void {
    if ((event.currentTarget as HTMLDetailsElement).open) {
      this.serverAbout.load();
    }
  }

  ngOnInit(): void {
    // Independent of the Mastodon identity below. A Mawkingbird subscription
    // can exist while browsing anonymously or through Bluesky, and the header
    // must still settle its own account tier before claiming it is Free.
    void this.plusBadge.check();
    // Not while the first-run modal is blocking. The shortcuts are global and
    // navigational — "g" then "h" would move the app *behind* a modal the
    // visitor cannot dismiss, leaving them looking at a question about a page
    // that is no longer there. Started in `answerFirstRun` instead.
    if (!this.firstRunActive()) {
      this.hotkeys.start();
    }
    // Bluesky-primary excluded alongside Anonymous: this gates a Mastodon
    // `verify_credentials` call, and such an account has no Mastodon token to
    // verify. Reaching the call below without one fails, and the error branch
    // calls `exitToLoggedOut()` — so before this, a Bluesky-primary session
    // signed itself out on every single boot.
    if (this.auth.isAnonymous || this.auth.isForeignPrimary) {
      return;
    }
    if (!this.auth.account()) {
      this.api
        .verifyCredentials()
        .pipe(retryUnlessRejected())
        .subscribe({
          next: (acc) => this.auth.setAccount(acc),
          error: (err: unknown) => {
            // A failure that is not a 401 says nothing about the token: the
            // server (a household board on Wi-Fi, say) did not answer in time.
            // Stay signed in; the fail whale reports an unreachable server.
            if (!tokenRejected(err)) {
              return;
            }
            // The stored token was rejected on boot. Don't silently delete the
            // account: offer the same reauthenticate/remove choice as a failed
            // switch. The dead token is the *active* one here, so clear it (every
            // request would 401) while leaving the saved session intact.
            const token = this.auth.token();
            const session = token
              ? (this.auth.sessions().find((s) => s.token === token) ?? null)
              : null;
            this.auth.exitToLoggedOut();
            if (!session) {
              // Nothing saved to reauthenticate against — the old behaviour is right.
              location.assign('login');
              return;
            }
            this.deadSession.set({
              key: `mastodon:${session.id}`,
              kind: 'mastodon',
              token: session.token,
              server: session.server ?? '',
              account: session.account,
            });
          },
        });
    }
  }

  protected accountName(account: Account | null): string {
    return accountLabel(account);
  }

  /** A slow or broken avatar host must not leave a blank account choice. */
  protected accountAvatarFailed(event: Event): void {
    const image = event.target as HTMLImageElement;
    const fallback = new URL('favicon-32x32.png', document.baseURI).toString();
    if (image.src !== fallback) image.src = fallback;
  }

  /**
   * Narrows the account menu's switch list. Only offered once there are enough
   * saved accounts that scanning the list is slower than typing.
   */
  protected readonly accountQuery = signal('');
  protected readonly manyAccounts = computed(
    () => this.switchable().length >= ACCOUNT_FILTER_THRESHOLD,
  );
  protected readonly screenShare = inject(ScreenShare);
  /** The accounts the switcher offers: not pseudonymous ones while screen sharing. */
  protected readonly switchable = computed(() => this.screenShare.shown(this.auth.otherSessions()));
  protected readonly visibleOtherSessions = computed(() =>
    filterAccountChoices(this.switchable(), this.accountQuery()),
  );
  /** A private page while screen sharing: covered, not shown. */
  protected readonly screenCovered = computed(() => this.screenShare.covers(this.currentUrl()));

  protected setAccountQuery(event: Event): void {
    this.accountQuery.set((event.target as HTMLInputElement).value);
  }

  /** A stale filter would hide accounts the next time the menu opens. */
  protected onAccountMenuToggle(event: Event): void {
    if ((event.target as HTMLDetailsElement).open) void this.replyCounts.refresh();
    else this.accountQuery.set('');
  }

  /** Enter in the filter switches when exactly one account is left. */
  protected switchToOnlyMatch(): void {
    const matches = this.visibleOtherSessions();
    if (matches.length === 1) this.switchTo(matches[0]);
  }

  protected closeMenu(event: Event): void {
    (event.currentTarget as HTMLElement).closest('details')?.removeAttribute('open');
  }

  /**
   * Switch to a saved account, then re-verify it before committing. A soft route
   * refresh isn't enough: nearly every widget (feeds, prefs, RSS/Bluesky, the
   * observability metrics) is scoped to the active account, and some read their
   * account-scoped storage at construction. So once the new token verifies, we
   * do a full page reload — the cleanest way to invalidate everything and
   * re-bootstrap against the new identity.
   */
  protected readonly switchingServer = signal<string | null>(null);

  switchTo(target: AccountChoice | Session): void {
    if (this.switchingServer()) return;
    const session: AccountChoice =
      'kind' in target
        ? target
        : {
            key: `mastodon:${target.id}`,
            kind: 'mastodon',
            token: target.token,
            server: target.server ?? '',
            account: target.account,
          };
    // Anonymous and Bluesky-primary are both tokenless identities: there is no
    // `verify_credentials` to run, so the switch is committed immediately and the
    // reload rebuilds everything account-scoped (including `BlueskySession`,
    // which picks the identity or connector keys at construction). Without this,
    // a Bluesky choice fell through to the token comparison below, matched
    // null === null, and returned having done nothing at all.
    // Misskey-primary is tokenless here too (its token lives in its own store).
    if (session.kind === 'anonymous' || session.kind === 'bluesky' || session.kind === 'misskey') {
      if (this.auth.switchAccount(session)) {
        // Let an OAuth token refresh started by the menu's reply counts finish
        // first, or the reload can leave a spent refresh token (see settled()).
        this.replyCounts.afterSettled(() => location.reload());
      }
      return;
    }
    const previous = this.auth.token();
    const previousWasAnonymous = this.auth.isAnonymous;
    // Remembered for the revert path below: a failed switch away from a
    // tokenless identity has no token to restore, and `exitToLoggedOut()` would
    // strand the user signed out of an account that was working a moment ago.
    const previousWasBluesky = this.auth.isBlueskyPrimary;
    const previousWasMisskey = this.auth.isMisskeyPrimary;
    if (session.token === previous) {
      return;
    }
    if (!session.token) {
      return;
    }
    this.switchingServer.set(session.server || location.origin);
    try {
      this.auth.switchTo(session.token);
    } catch (error) {
      // Storage full, even after dropping caches: Auth has put the old account
      // back. Release the switch lock, or every later attempt returns at the top
      // of this method and the menu looks dead. The global error handler explains.
      this.switchingServer.set(null);
      throw error;
    }
    this.api.verifyCredentials().subscribe({
      next: (acc) => {
        this.auth.setAccount(acc);
        // Hard reload: rebuild the whole app under the new account, once any
        // OAuth refresh from the menu's reply counts has been stored.
        this.replyCounts.afterSettled(() => location.reload());
      },
      error: (err: unknown) => {
        // The token was rejected by its instance. Don't silently delete the account —
        // put the user back where they were, then offer the only two things that
        // actually resolve it. A toast was a dead end: the switch leaves the broken
        // account inactive, so the account menu's Log out (which acts on the *active*
        // account) can never reach it, and retrying the switch just fails again.
        if (previousWasAnonymous) {
          this.auth.enterAnonymous(undefined, { implicit: true });
        } else if (previousWasBluesky) {
          this.auth.enterBluesky();
        } else if (previousWasMisskey) {
          this.auth.enterMisskey();
        } else if (previous) {
          this.auth.switchTo(previous);
        } else {
          // Nothing to revert to: the failed token is still stored as active, so
          // clear it rather than leaving the app authenticated with a dead token.
          this.auth.exitToLoggedOut();
        }
        this.switchingServer.set(null);
        // Only a 401 makes the account dead. Otherwise its server just did not
        // answer (the fail whale says so); the account stays a normal choice.
        if (tokenRejected(err)) {
          this.deadSession.set(session);
        }
      },
    });
  }

  /** Which network the new account is on is asked in the dialog, not the menu. */
  protected readonly addAccountOpen = signal(false);

  protected openAddAccount(event: Event): void {
    this.closeMenu(event);
    this.addAccountOpen.set(true);
  }

  /**
   * Ask before leaving, so the user can take their data with them.
   *
   * Leaving used to be immediate, and it left every follow, list and subscribed
   * hashtag in `localStorage` — which is the wrong default for someone reading on a
   * machine that is not theirs. The dialog owns the teardown; this only reacts to
   * what they chose.
   */
  logout(): void {
    this.showLeave.set(true);
  }

  /**
   * Finish leaving after the dialog has already erased whatever was chosen.
   *
   * A wipe is always followed by a full page load rather than a soft navigation:
   * services hold their state in signals loaded at construction, so `AnonymousFollows`
   * and friends would happily keep serving data whose storage no longer exists. The
   * app already relies on this for account switching.
   */
  finishLeave(choice: LeaveChoice): void {
    this.showLeave.set(false);
    if (choice === 'all-data') {
      // Every session is gone by definition; there is nothing to fall back to.
      // The front page rather than a login form: this browser is now indistinguishable
      // from a first-time visitor's, which is precisely who `/` is written for.
      // Resolved against <base href> so it works under /_ui/ and /canary/ alike.
      location.assign(document.baseURI);
      return;
    }
    // `leaveActive`, never `logout`: the dialog promised not to delete anything,
    // and `logout` forgets the active account. This used to call `logout`, which
    // deleted the account the user was leaving and then silently signed them in
    // as the next one in the stable — so the app looked like it had switched
    // rather than destroyed, and the loss was only noticed after it had happened
    // twice. Saved accounts survive both remaining choices; `anonymous-data`
    // erases the Anonymous session's own keys and nothing else.
    this.auth.leaveActive();
    // Also the front page: `leaveActive` kept every saved account, and `/` offers
    // both doors plus the anonymous path, where a bare login form offers one.
    location.assign(document.baseURI);
  }
}

// i18n shell.switchingServer: Connecting to {{server}}…

/**
 * Only a 401 says the instance rejected the token. Status 0 (no reply: Wi-Fi,
 * a reset connection, which Firefox reports as a CORS failure), timeouts and
 * 5xx are about reaching the server, and must not end a session.
 */
export function tokenRejected(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 401;
}

/** Waits before each retry of a boot `verify_credentials` that did not get a 401. */
export const VERIFY_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000];

/** Retries with backoff unless the token was rejected, which is final. */
function retryUnlessRejected<T>(): MonoTypeOperatorFunction<T> {
  return retry<T>({
    count: VERIFY_RETRY_DELAYS_MS.length,
    delay: (err: unknown, attempt: number) =>
      tokenRejected(err) ? throwError(() => err) : timer(VERIFY_RETRY_DELAYS_MS[attempt - 1]),
  });
}
