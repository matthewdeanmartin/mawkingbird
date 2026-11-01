import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { GitHubFriendsWorkbench } from './github-friends-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * GitHub friends → Mastodon as a focused mini-app.
 *
 * Signed out, a public page that explains the three steps; signed in with
 * Mastodon, the shell's trimmed nav around the GitHub connector and finder.
 * The workbench is deferred and only exists signed in.
 */
@Component({
  selector: 'app-github-to-mastodon',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, GitHubFriendsWorkbench],
  templateUrl: './github-to-mastodon.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class GithubToMastodon {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/github-to-mastodon' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-github-to-mastodon-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, GitHubFriendsWorkbench],
  templateUrl: './github-to-mastodon.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class GithubToMastodonDe extends GithubToMastodon {
  protected override readonly returnHere = { next: '/de/github-freunde-auf-mastodon' };
}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-github-to-mastodon-ja',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, GitHubFriendsWorkbench],
  templateUrl: './github-to-mastodon.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class GithubToMastodonJa extends GithubToMastodon {
  protected override readonly returnHere = { next: '/ja/github-to-mastodon' };
}

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-github-to-mastodon-fr',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, GitHubFriendsWorkbench],
  templateUrl: './github-to-mastodon.fr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class GithubToMastodonFr extends GithubToMastodon {
  protected override readonly returnHere = { next: '/fr/amis-github-sur-mastodon' };
}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-github-to-mastodon-es',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, GitHubFriendsWorkbench],
  templateUrl: './github-to-mastodon.es.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class GithubToMastodonEs extends GithubToMastodon {
  protected override readonly returnHere = { next: '/es/amigos-de-github-en-mastodon' };
}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-github-to-mastodon-zh-hant',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, GitHubFriendsWorkbench],
  templateUrl: './github-to-mastodon.zh-hant.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class GithubToMastodonZhHant extends GithubToMastodon {
  protected override readonly returnHere = { next: '/zh-hant/github-to-mastodon' };
}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-github-to-mastodon-ko',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, GitHubFriendsWorkbench],
  templateUrl: './github-to-mastodon.ko.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class GithubToMastodonKo extends GithubToMastodon {
  protected override readonly returnHere = { next: '/ko/github-to-mastodon' };
}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-github-to-mastodon-pt',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, GitHubFriendsWorkbench],
  templateUrl: './github-to-mastodon.pt.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class GithubToMastodonPt extends GithubToMastodon {
  protected override readonly returnHere = { next: '/pt/amigos-do-github-no-mastodon' };
}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-github-to-mastodon-it',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, GitHubFriendsWorkbench],
  templateUrl: './github-to-mastodon.it.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class GithubToMastodonIt extends GithubToMastodon {
  protected override readonly returnHere = { next: '/it/amici-di-github-su-mastodon' };
}
