import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { FriendFeedsWorkbench } from './friend-feeds-workbench';

/**
 * "Find the RSS feeds of everyone you follow" as a focused mini-app: profile
 * links → blogs → feeds → one OPML file, from the RSS pages' friend-feed scan.
 *
 * Signed out, the page explains it, says it is a Plus feature, and signs in.
 * Signed in, the workbench opens the existing dialog, which holds the Plus gate.
 */
@Component({
  selector: 'app-mastodon-friends-rss-feeds',
  imports: [RouterLink, MbButton, MbContentLink, FriendFeedsWorkbench],
  templateUrl: './mastodon-friends-rss-feeds.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class MastodonFriendsRssFeeds {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/mastodon-friends-rss-feeds' };
}
