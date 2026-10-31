import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { FriendFeedsWorkbench } from './friend-feeds-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * "Find the RSS feeds of everyone you follow" as a focused mini-app: profile
 * links → blogs → feeds → one OPML file, from the RSS pages' friend-feed scan.
 *
 * Signed out, the page explains it, says it is a Plus feature, and signs in.
 * Signed in, the workbench opens the existing dialog, which holds the Plus gate.
 */
@Component({
  selector: 'app-mastodon-friends-rss-feeds',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendFeedsWorkbench],
  templateUrl: './mastodon-friends-rss-feeds.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class MastodonFriendsRssFeeds {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/mastodon-friends-rss-feeds' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendFeedsWorkbench],
  templateUrl: './mastodon-friends-rss-feeds.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsDe extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/de/rss-feeds-deiner-mastodon-freunde' };
}
