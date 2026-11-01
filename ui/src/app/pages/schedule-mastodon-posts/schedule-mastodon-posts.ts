import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { ScheduleWorkbench } from './schedule-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * Bulk Mastodon scheduling as a focused mini-app.
 *
 * Signed out, a public page aimed at "how do I schedule a Mastodon post", that
 * explains the server-side scheduling every Mastodon server already has and
 * offers sign-in. Signed in with Mastodon, the shell's trimmed nav around the
 * scheduler and the posts already waiting. The workbench is deferred and only
 * exists signed in, so prerendering touches no account.
 */
@Component({
  selector: 'app-schedule-mastodon-posts',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class ScheduleMastodonPosts {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/schedule-mastodon-posts' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-schedule-mastodon-posts-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsDe extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/de/mastodon-beitraege-planen' };
}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-schedule-mastodon-posts-ja',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsJa extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/ja/schedule-mastodon-posts' };
}

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-schedule-mastodon-posts-fr',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.fr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsFr extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/fr/programmer-des-posts-mastodon' };
}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-schedule-mastodon-posts-es',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.es.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsEs extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/es/programar-publicaciones-en-mastodon' };
}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-schedule-mastodon-posts-zh-hant',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.zh-hant.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsZhHant extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/zh-hant/schedule-mastodon-posts' };
}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-schedule-mastodon-posts-ko',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.ko.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsKo extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/ko/schedule-mastodon-posts' };
}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-schedule-mastodon-posts-pt',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.pt.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsPt extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/pt/agendar-publicacoes-no-mastodon' };
}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-schedule-mastodon-posts-it',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.it.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsIt extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/it/programmare-post-su-mastodon' };
}

/**
 * The Polish page (focused-tools.json `lang: "pl"`): the same tool and
 * logic, Polish words, and everything translated inside it pinned to
 * Polish (see page-language.ts).
 */
@Component({
  selector: 'app-schedule-mastodon-posts-pl',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.pl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsPl extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/pl/planowanie-wpisow-na-mastodonie' };
}

/** Ukrainian public page, with embedded tools pinned to the route language. */
@Component({
  selector: 'app-schedule-mastodon-posts-uk',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.uk.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsUk extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/uk/schedule-mastodon-posts' };
}

/** Hindi public page; embedded tools use the route language. */
@Component({
  selector: 'app-schedule-mastodon-posts-hi',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.hi.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsHi extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/hi/schedule-mastodon-posts' };
}

/** Dutch public page; embedded tools use the route language. */
@Component({
  selector: 'app-schedule-mastodon-posts-nl',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.nl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsNl extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/nl/mastodon-berichten-plannen' };
}

/** Indonesian public page; embedded tools use the route language. */
@Component({
  selector: 'app-schedule-mastodon-posts-id',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.id.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsId extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/id/jadwalkan-postingan-mastodon' };
}

/** Russian public page; embedded tools use the route language. */
@Component({
  selector: 'app-schedule-mastodon-posts-ru',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.ru.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsRu extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/ru/schedule-mastodon-posts' };
}

/** Swedish public page; embedded tools use the route language. */
@Component({
  selector: 'app-schedule-mastodon-posts-sv',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.sv.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsSv extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/sv/schemalagg-mastodon-inlagg' };
}

/** Vietnamese public page; embedded tools use the route language. */
@Component({
  selector: 'app-schedule-mastodon-posts-vi',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, ScheduleWorkbench],
  templateUrl: './schedule-mastodon-posts.vi.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class ScheduleMastodonPostsVi extends ScheduleMastodonPosts {
  protected override readonly returnHere = { next: '/vi/schedule-mastodon-posts' };
}
