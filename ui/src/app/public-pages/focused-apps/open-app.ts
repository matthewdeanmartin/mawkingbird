import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { Auth } from '../../platform/session/auth';
import { toolPageAt } from '../focused-tools';
import { AppOnlyLinkRel } from '../public-page-urls';

/**
 * The app screen a tool page leads to once signed in, by the English tool's id,
 * named with that screen's own (already translated) menu label.
 */
const APP_SCREENS: Record<string, { link: string; labelKey: string }> = {
  'twitter-import': { link: '/unbird', labelKey: 'shell.modeNav.mode.unbird' },
  'twitter-archive-tools': { link: '/unbird/archive', labelKey: 'shell.modeNav.mode.unbird' },
  crosspost: { link: '/write', labelKey: 'shell.menu.write' },
  'mastodon-analytics': { link: '/analytics', labelKey: 'shell.menu.analytics' },
  'github-friends': {
    link: '/settings/connections/github',
    labelKey: 'settings.connections.catalog.github.label',
  },
  schedule: { link: '/drafts', labelKey: 'shell.menu.drafts' },
  'bluesky-to-mastodon': { link: '/find-friends', labelKey: 'shell.menu.findFriends' },
  'mastodon-to-bluesky': { link: '/find-friends', labelKey: 'shell.menu.findFriends' },
  'turn-off-boosts': { link: '/settings/bulk-actions', labelKey: 'settings.nav.bulkModeration' },
  'find-contacts': { link: '/find-friends', labelKey: 'shell.menu.findFriends' },
  'friend-feeds': { link: '/rss', labelKey: 'shell.nav.rss' },
  amnesty: { link: '/settings/bulk-actions', labelKey: 'settings.nav.bulkModeration' },
  pseudonymity: { link: '/settings/pseudonymity', labelKey: 'settings.nav.pseudonymity' },
  'content-warnings': { link: '/settings/content', labelKey: 'settings.nav.trustCwSensitive' },
  'export-bookmarks': { link: '/bookmarks', labelKey: 'pages.bookmarks.tab.bookmarks' },
  'mastodon-search': { link: '/search', labelKey: 'shell.nav.search' },
  'bluesky-search': { link: '/search', labelKey: 'shell.nav.search' },
  'language-en': { link: '/settings/i18n', labelKey: 'shell.modeNav.languages.setup' },
  'learn-english': { link: '/settings/i18n', labelKey: 'shell.modeNav.languages.setup' },
};

/**
 * A public tool page's way into the app. The page projects its own words for
 * "Open the app"; where that goes depends on who is asking:
 *
 * - signed in (`inShell`): the app screen this tool belongs to, named, because
 *   a second "Open the app" after signing in says nothing;
 * - someone who chose to read without an account: the app, as they left it;
 * - everyone else: sign in, and come back to this page.
 *
 * On a tool index there is no one tool, so signing in lands on Home.
 */
@Component({
  selector: 'app-open-app',
  imports: [AppOnlyLinkRel, MbButton, RouterLink, TranslocoPipe],
  template: `
    @if (inShell) {
      @if (screen) {
        <a mbButton variant="outline" class="screen" [routerLink]="screen.link">{{
          screen.labelKey | transloco
        }}</a>
      }
    } @else {
      <a
        mbButton
        variant="outline"
        [routerLink]="reading() ? '/' : door"
        [queryParams]="reading() ? null : returnHere"
        ><ng-content
      /></a>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .screen {
      margin-bottom: 20px;
    }
  `,
})
export class OpenApp {
  private readonly route = inject(ActivatedRoute);
  /** The session is the browser's; the prerender shows the stranger's link. */
  private readonly auth = isPlatformBrowser(inject(PLATFORM_ID)) ? inject(Auth) : null;
  private readonly tool = toolPageAt(
    (this.route.snapshot?.pathFromRoot ?? [])
      .map((step) => step.routeConfig?.path)
      .filter((path): path is string => !!path),
  );

  protected readonly inShell = this.route.snapshot?.data?.['inShell'] === true;
  protected readonly screen = this.tool
    ? (APP_SCREENS[this.tool.translationOf ?? this.tool.id] ?? null)
    : null;
  /** A Mastodon-only tool skips the network question. */
  protected readonly door = this.tool?.signIn === 'mastodon' ? '/login/mastodon' : '/login';
  protected readonly returnHere = this.tool ? { next: `/${this.tool.path}` } : null;
  /** Reading without an account, on purpose. */
  protected readonly reading = computed(
    () => !!this.auth && (this.auth.choseAnonymous || this.auth.isMisskeyVisitor),
  );
}
