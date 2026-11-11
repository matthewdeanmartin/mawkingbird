import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { FriendFeedsWorkbench } from './friend-feeds-workbench';
import { provideRouteLanguage } from '../../i18n/page-language';
import { LanguageVersions } from '../../public-pages/focused-apps/language-versions';
import { AppOnlyLinkRel } from '../../public-pages/public-page-urls';

/**
 * "Find the RSS feeds of everyone you follow" as a focused mini-app: profile
 * links → blogs → feeds → one OPML file, from the RSS pages' friend-feed scan.
 *
 * Signed out, the page explains it, says it is a Plus feature, and signs in.
 * Signed in, the workbench opens the existing dialog, which holds the Plus gate.
 */
@Component({
  selector: 'app-mastodon-friends-rss-feeds',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
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
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.de.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
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
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.ja.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
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
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.fr.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
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
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.es.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
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
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.zh-hant.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
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
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.ko.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
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
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.pt.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
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
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.it.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsIt extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/it/feed-rss-di-chi-segui-su-mastodon' };
}

/**
 * The Polish page (focused-tools.json `lang: "pl"`): the same tool and
 * logic, Polish words, and everything translated inside it pinned to
 * Polish (see page-language.ts).
 */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-pl',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.pl.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsPl extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/pl/kanaly-rss-obserwowanych-na-mastodonie' };
}

/** Ukrainian public page, with embedded tools pinned to the route language. */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-uk',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.uk.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsUk extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/uk/mastodon-friends-rss-feeds' };
}

/** Hindi public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-hi',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.hi.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsHi extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/hi/mastodon-friends-rss-feeds' };
}

/** Dutch public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-nl',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.nl.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsNl extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/nl/rss-feeds-mastodon-vrienden' };
}

/** Indonesian public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-id',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.id.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsId extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/id/feed-rss-teman-mastodon' };
}

/** Russian public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-ru',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.ru.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsRu extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/ru/mastodon-friends-rss-feeds' };
}

/** Swedish public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-sv',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.sv.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsSv extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/sv/rss-floden-mastodon-vanner' };
}

/** Vietnamese public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-vi',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.vi.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsVi extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/vi/mastodon-friends-rss-feeds' };
}

/** Turkish public page; embedded tools use the route language. */
@Component({
  selector: 'app-mastodon-friends-rss-feeds-tr',
  imports: [
    RouterLink,
    AppOnlyLinkRel,
    MbButton,
    MbContentLink,
    LanguageVersions,
    FriendFeedsWorkbench,
  ],
  templateUrl: './mastodon-friends-rss-feeds.tr.html',
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class MastodonFriendsRssFeedsTr extends MastodonFriendsRssFeeds {
  protected override readonly returnHere = { next: '/tr/mastodon-arkadas-rss-akislari' };
}
