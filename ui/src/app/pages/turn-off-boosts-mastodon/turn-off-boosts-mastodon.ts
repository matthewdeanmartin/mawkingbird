import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { BoostsWorkbench } from './boosts-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * "Turn off boosts for everyone" as a focused mini-app: the Mastodon twin of the
 * single-purpose "turn off all retweets" sites people used on Twitter.
 *
 * Mastodon only offers this one account at a time, on each profile. Signed out,
 * the page says so and offers sign-in; signed in, it runs the bulk action from
 * Settings. The workbench is deferred and only exists signed in.
 */
@Component({
  selector: 'app-turn-off-boosts-mastodon',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, BoostsWorkbench],
  templateUrl: './turn-off-boosts-mastodon.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class TurnOffBoostsMastodon {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/turn-off-boosts-mastodon' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-turn-off-boosts-mastodon-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, BoostsWorkbench],
  templateUrl: './turn-off-boosts-mastodon.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TurnOffBoostsMastodonDe extends TurnOffBoostsMastodon {
  protected override readonly returnHere = { next: '/de/mastodon-boosts-ausblenden' };
}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-turn-off-boosts-mastodon-ja',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, BoostsWorkbench],
  templateUrl: './turn-off-boosts-mastodon.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TurnOffBoostsMastodonJa extends TurnOffBoostsMastodon {
  protected override readonly returnHere = { next: '/ja/turn-off-boosts-mastodon' };
}

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-turn-off-boosts-mastodon-fr',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, BoostsWorkbench],
  templateUrl: './turn-off-boosts-mastodon.fr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TurnOffBoostsMastodonFr extends TurnOffBoostsMastodon {
  protected override readonly returnHere = { next: '/fr/masquer-les-boosts-mastodon' };
}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-turn-off-boosts-mastodon-es',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, BoostsWorkbench],
  templateUrl: './turn-off-boosts-mastodon.es.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TurnOffBoostsMastodonEs extends TurnOffBoostsMastodon {
  protected override readonly returnHere = { next: '/es/ocultar-boosts-en-mastodon' };
}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-turn-off-boosts-mastodon-zh-hant',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, BoostsWorkbench],
  templateUrl: './turn-off-boosts-mastodon.zh-hant.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TurnOffBoostsMastodonZhHant extends TurnOffBoostsMastodon {
  protected override readonly returnHere = { next: '/zh-hant/turn-off-boosts-mastodon' };
}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-turn-off-boosts-mastodon-ko',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, BoostsWorkbench],
  templateUrl: './turn-off-boosts-mastodon.ko.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TurnOffBoostsMastodonKo extends TurnOffBoostsMastodon {
  protected override readonly returnHere = { next: '/ko/turn-off-boosts-mastodon' };
}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-turn-off-boosts-mastodon-pt',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, BoostsWorkbench],
  templateUrl: './turn-off-boosts-mastodon.pt.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TurnOffBoostsMastodonPt extends TurnOffBoostsMastodon {
  protected override readonly returnHere = { next: '/pt/ocultar-boosts-no-mastodon' };
}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-turn-off-boosts-mastodon-it',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, BoostsWorkbench],
  templateUrl: './turn-off-boosts-mastodon.it.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TurnOffBoostsMastodonIt extends TurnOffBoostsMastodon {
  protected override readonly returnHere = { next: '/it/nascondere-i-boost-su-mastodon' };
}

/**
 * The Polish page (focused-tools.json `lang: "pl"`): the same tool and
 * logic, Polish words, and everything translated inside it pinned to
 * Polish (see page-language.ts).
 */
@Component({
  selector: 'app-turn-off-boosts-mastodon-pl',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, BoostsWorkbench],
  templateUrl: './turn-off-boosts-mastodon.pl.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class TurnOffBoostsMastodonPl extends TurnOffBoostsMastodon {
  protected override readonly returnHere = { next: '/pl/ukryj-podbicia-na-mastodonie' };
}
