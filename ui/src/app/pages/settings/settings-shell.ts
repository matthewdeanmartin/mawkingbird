import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Auth } from '../../auth';
import { environment } from '../../../environments/environment';
import { FeatureFlagId, FeatureFlags } from '../../feature-flags';
import { SettingsPreloading } from './settings-preloading';

interface SettingsNavItem {
  labelKey: string;
  path: string;
  /** Match child routes too (the Filters editor lives under /settings/filters/...). */
  exact: boolean;
  /** True for pages backed by /api/v1/_mock endpoints; hidden against real servers. */
  mockOnly?: boolean;
  /** Safe and useful for the one browser-local Anonymous account. */
  anonymous?: boolean;
  /** Meaningful only for the browser-local Anonymous account. */
  anonymousOnly?: boolean;
  /** Hidden unless this feature flag is on. */
  featureFlag?: FeatureFlagId;
}

/** A heading in the sidebar, and the pages filed under it. */
interface SettingsNavGroup {
  titleKey: string;
  /** Item paths, in the order they should appear under the heading. */
  paths: string[];
}

/**
 * The shelves the settings pages sit on.
 *
 * A page may appear under more than one heading, and several do. There is no
 * one true partition of settings into categories — ours would not match the
 * user's anyway — so when a page has a real claim to two shelves it goes on
 * both, and whichever one the user looked under first is the right one. The
 * cost is a duplicated row in a list; the alternative is a user who cannot find
 * a setting that is definitely there.
 *
 * Order matters more than it looks: this list is what the user sees before
 * scrolling, so the groups worth reaching are near the top. "Basic" is the
 * catch-all and is listed first — anything not deliberately filed elsewhere
 * still appears there, so no page can fall out of the sidebar by being
 * forgotten here.
 */
// i18n settings.groups.basic: Basic
// i18n settings.groups.accounts: Accounts
// i18n settings.groups.content: Content
// i18n settings.groups.people: People
// i18n settings.groups.advanced: Advanced
// i18n settings.groups.rss: RSS
// i18n settings.nav.publicProfile: Public profile
// i18n settings.nav.server: Server
// i18n settings.nav.mawkingbirdPlus: Mawkingbird Plus
// i18n settings.nav.connections: Connections
// i18n settings.nav.privacy: Privacy
// i18n settings.nav.writing: Writing
// i18n settings.nav.appearance: Appearance
// i18n settings.nav.internationalization: Internationalization
// i18n settings.nav.localStorage: Local storage
// i18n settings.nav.endorsements: Endorsements
// i18n settings.nav.signedInAccounts: Signed-in accounts
// i18n settings.nav.emailNotifications: Email notifications
// i18n settings.nav.approveFollowRequests: Approve follow requests
// i18n settings.nav.mutedBlocked: Muted & Blocked
// i18n settings.nav.trustCwSensitive: Trust: CW/Sensitive
// i18n settings.nav.bulkModeration: Bulk moderation
// i18n settings.nav.filters: Filters
// i18n settings.nav.automaticPostDeletion: Automatic post deletion
// i18n settings.nav.account: Account
// i18n settings.nav.importExportFriendsTags: Import/Export Friends & Tags
// i18n settings.nav.importExportConfig: Import/Export Config
// i18n settings.nav.inviteLinks: Invite links
// i18n settings.nav.featureFlags: Feature flags
// i18n settings.nav.development: Development
// i18n settings.nav.rss: RSS feeds
// i18n settings.sectionsAriaLabel: Settings sections
const NAV_GROUPS: SettingsNavGroup[] = [
  {
    titleKey: 'settings.groups.basic',
    // Pages that belong here *as well as* under a more specific heading. Anything
    // not named in any group lands here too — see `groups` below — so this list
    // is only for deliberate cross-listing, not for the ordinary case.
    paths: ['profile', 'writing', 'privacy', 'appearance'],
  },
  {
    // Second, and 'mawkingbird-plus' first within it: an account page nobody
    // scrolls to is an account page nobody upgrades from.
    titleKey: 'settings.groups.accounts',
    // Public profile already leads Basic. Repeating the same subgroup under
    // Accounts made the sidebar look like it contained two different editors.
    paths: ['mawkingbird-plus', 'accounts', 'account', 'connections', 'server'],
  },
  {
    // What gets shown to you and what gets shown about you — the filtering and
    // labelling rules, as opposed to the people they apply to.
    titleKey: 'settings.groups.content',
    paths: ['filters', 'spotlight', 'content'],
  },
  {
    titleKey: 'settings.groups.people',
    paths: ['moderation', 'follows', 'bulk-actions', 'import-export', 'invites', 'privacy'],
  },
  {
    // Its own heading rather than a line under Content: RSS is a reading list
    // of many feeds carrying no credential, which is a different kind of thing
    // from every filtering rule Content holds. Last because it is a side
    // interest for most accounts, and the ones who want it go looking.
    titleKey: 'settings.groups.rss',
    paths: ['rss'],
  },
  {
    titleKey: 'settings.groups.advanced',
    paths: ['storage', 'feature-flags', 'development', 'config', 'deletion'],
  },
];

/**
 * Full-width settings area: 2018-Twitter-style boxed sidebar on the left
 * (profile card + category list), routed content pane on the right. The
 * category headings are always expanded — the list is long, and a collapsed
 * group is a place for a setting to hide.
 */
@Component({
  selector: 'app-settings-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoPipe],
  templateUrl: './settings-shell.html',
  styleUrl: './settings-shell.css',
})
export class SettingsShell {
  protected auth = inject(Auth);
  private readonly flags = inject(FeatureFlags);
  private readonly preloading = inject(SettingsPreloading);

  constructor() {
    // The router preloader runs after navigation completes. Enabling it while
    // entering Settings makes the sibling page bundles available for later clicks.
    this.preloading.enable();
  }

  // The element type is annotated on the literal rather than only on `nav`:
  // `.filter()` breaks the contextual-typing chain, so without it `featureFlag`
  // widens to `string` and stops being checked against `FeatureFlagId`.
  protected readonly nav: SettingsNavItem[] = (
    [
      { labelKey: 'settings.nav.publicProfile', path: 'profile', exact: true, anonymous: true },
      {
        labelKey: 'settings.nav.server',
        path: 'server',
        exact: true,
        anonymous: true,
        anonymousOnly: true,
      },
      // 'blue' is deliberately absent. Appearance embeds the whole
      // <app-blue-controls> cluster, so every setting the Blue page showed is
      // already one click away under a heading that describes it — and the
      // sidebar is short on room. The route still resolves for old bookmarks.
      // A Mawkingbird account. `anonymous: true` because the account belongs to
      // the human, not to a Mastodon persona — the same reasoning that makes the
      // CORS proxy key account-unscoped in `cors-proxy-settings.ts`.
      {
        labelKey: 'settings.nav.mawkingbirdPlus',
        path: 'mawkingbird-plus',
        exact: true,
        anonymous: true,
        featureFlag: 'mawkingbird-plus',
      },
      // Client-side (localStorage) accounts on other services: Bluesky, GitHub,
      // Raindrop.io, Dropbox. Not exact — the catalog's child pages live under it.
      { labelKey: 'settings.nav.connections', path: 'connections', exact: false, anonymous: true },
      // RSS is in the More menu too, on its way to becoming a miniapp of its
      // own like Write. It is listed here as well because the feed list, the
      // subscription cap and OPML import/export are settings by any reading,
      // and a settings page reachable only from another menu is one nobody
      // finds when they go looking for it.
      { labelKey: 'settings.nav.rss', path: 'rss', exact: true, anonymous: true },
      { labelKey: 'settings.nav.privacy', path: 'privacy', exact: true },
      { labelKey: 'settings.nav.writing', path: 'writing', exact: true, anonymous: true },
      // Appearance is client-side (theme/accent/undo-send in localStorage) and works
      // against any instance; the page hides its server-backed rows off-mock itself.
      { labelKey: 'settings.nav.appearance', path: 'appearance', exact: true, anonymous: true },
      { labelKey: 'settings.nav.internationalization', path: 'i18n', exact: true, anonymous: true },
      { labelKey: 'settings.nav.localStorage', path: 'storage', exact: true, anonymous: true },
      // Path is 'spotlight' on purpose — see the route's comment in app.routes.ts.
      { labelKey: 'settings.nav.endorsements', path: 'spotlight', exact: true, anonymous: true },
      { labelKey: 'settings.nav.signedInAccounts', path: 'accounts', exact: true, anonymous: true },
      {
        labelKey: 'settings.nav.emailNotifications',
        path: 'notifications',
        exact: true,
        mockOnly: true,
      },
      { labelKey: 'settings.nav.approveFollowRequests', path: 'follows', exact: true },
      { labelKey: 'settings.nav.mutedBlocked', path: 'moderation', exact: true },
      // The flipside of the line above — accounts you want *without* a doorway in
      // front of them — so it sits next to it. Client-side, hence anonymous: true.
      { labelKey: 'settings.nav.trustCwSensitive', path: 'content', exact: true, anonymous: true },
      // Sits under the two lists it can empty, and next to the follow-wide
      // retweet switches, because that is what all four of them operate on.
      { labelKey: 'settings.nav.bulkModeration', path: 'bulk-actions', exact: true },
      { labelKey: 'settings.nav.filters', path: 'filters', exact: false },
      {
        labelKey: 'settings.nav.automaticPostDeletion',
        path: 'deletion',
        exact: true,
        mockOnly: true,
      },
      // mockOnly: against a real server the page is a read-only username row —
      // password changes and session revocation are not in the public API. An
      // entry that leads somewhere nothing can be done is worse than no entry.
      { labelKey: 'settings.nav.account', path: 'account', exact: true, mockOnly: true },
      { labelKey: 'settings.nav.importExportFriendsTags', path: 'import-export', exact: true },
      { labelKey: 'settings.nav.importExportConfig', path: 'config', exact: true, anonymous: true },
      // "Invite links", not "Invite people": /invites is the page that invites
      // people, and two menu entries reading the same thing is a maze.
      { labelKey: 'settings.nav.inviteLinks', path: 'invites', exact: true, mockOnly: true },
      {
        labelKey: 'settings.nav.featureFlags',
        path: 'feature-flags',
        exact: true,
        anonymous: true,
      },
      { labelKey: 'settings.nav.development', path: 'development', exact: true, mockOnly: true },
    ] satisfies SettingsNavItem[]
  ).filter(
    (item) =>
      (environment.mockTooling || !item.mockOnly) &&
      (!this.auth.isAnonymous || item.anonymous) &&
      (this.auth.isAnonymous || !item.anonymousOnly) &&
      (!item.featureFlag || this.flags.enabled(item.featureFlag)),
  );

  /**
   * The visible nav, bucketed under headings.
   *
   * Built from {@link nav} rather than from the group lists, so a page hidden by
   * a feature flag, the mock-tooling check or the anonymous guards stays hidden
   * in every group it is named in. Empty groups drop out entirely, which is what
   * keeps the Anonymous account from staring at a "People" heading with nothing
   * under it.
   */
  protected readonly groups: { titleKey: string; items: SettingsNavItem[] }[] = (() => {
    const byPath = new Map(this.nav.map((item) => [item.path, item]));
    const filed = new Set(NAV_GROUPS.flatMap((g) => g.paths));
    return NAV_GROUPS.map((group) => ({
      titleKey: group.titleKey,
      items:
        group.titleKey === 'settings.groups.basic'
          ? // Its own cross-listed pages first, then every page nobody filed
            // anywhere — a page left out of the lists is still a page the user
            // needs to reach, and silently dropping it is the one outcome this
            // whole arrangement must not have.
            [
              ...group.paths
                .map((path) => byPath.get(path))
                .filter((item): item is SettingsNavItem => !!item),
              ...this.nav.filter((item) => !filed.has(item.path)),
            ]
          : group.paths
              .map((path) => byPath.get(path))
              .filter((item): item is SettingsNavItem => !!item),
    })).filter((group) => group.items.length > 0);
  })();
}
