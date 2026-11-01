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

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-ja',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendFeedsWorkbench],
  templateUrl: './mastodon-friends-rss-feeds.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsJa extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/ja/mastodon-friends-rss-feeds' };
}

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-fr',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendFeedsWorkbench],
  templateUrl: './mastodon-friends-rss-feeds.fr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsFr extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/fr/flux-rss-de-tes-abonnements-mastodon' };
}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-es',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendFeedsWorkbench],
  templateUrl: './mastodon-friends-rss-feeds.es.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsEs extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/es/feeds-rss-de-quienes-sigues-en-mastodon' };
}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-zh-hant',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendFeedsWorkbench],
  templateUrl: './mastodon-friends-rss-feeds.zh-hant.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsZhHant extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/zh-hant/mastodon-friends-rss-feeds' };
}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-ko',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendFeedsWorkbench],
  templateUrl: './mastodon-friends-rss-feeds.ko.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsKo extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/ko/mastodon-friends-rss-feeds' };
}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-pt',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendFeedsWorkbench],
  templateUrl: './mastodon-friends-rss-feeds.pt.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsPt extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/pt/feeds-rss-de-quem-voce-segue-no-mastodon' };
}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-it',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, FriendFeedsWorkbench],
  templateUrl: './mastodon-friends-rss-feeds.it.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsIt extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/it/feed-rss-di-chi-segui-su-mastodon' };
}
