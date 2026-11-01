import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { CrosspostWorkbench } from './crosspost-workbench';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

/**
 * The Mastodon + Bluesky crossposter as a focused mini-app.
 *
 * Signed out, a public page that offers sign-in with either network. Signed in
 * with either, the shell's trimmed nav around a small composer and a way to
 * connect the other network. The workbench is deferred and only exists signed
 * in, so prerendering touches no session or account.
 */
@Component({
  selector: 'app-crosspost',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, CrosspostWorkbench],
  templateUrl: './crosspost.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class Crosspost {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/crosspost' };
}

/**
 * The German page (focused-tools.json `lang: "de"`): the same tool and logic,
 * German words, and everything translated inside it pinned to German (see
 * page-language.ts).
 */
@Component({
  selector: 'app-crosspost-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, CrosspostWorkbench],
  templateUrl: './crosspost.de.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostDe extends Crosspost {
  protected override readonly returnHere = { next: '/de/mastodon-und-bluesky-gleichzeitig-posten' };
}

/**
 * The Japanese page (focused-tools.json `lang: "ja"`): the same tool and
 * logic, Japanese words, and everything translated inside it pinned to
 * Japanese (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-ja',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, CrosspostWorkbench],
  templateUrl: './crosspost.ja.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostJa extends Crosspost {
  protected override readonly returnHere = { next: '/ja/crosspost' };
}

/**
 * The French page (focused-tools.json `lang: "fr"`): the same tool and
 * logic, French words, and everything translated inside it pinned to
 * French (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-fr',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, CrosspostWorkbench],
  templateUrl: './crosspost.fr.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostFr extends Crosspost {
  protected override readonly returnHere = { next: '/fr/publier-sur-mastodon-et-bluesky' };
}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-es',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, CrosspostWorkbench],
  templateUrl: './crosspost.es.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostEs extends Crosspost {
  protected override readonly returnHere = { next: '/es/publicar-en-mastodon-y-bluesky' };
}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-zh-hant',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, CrosspostWorkbench],
  templateUrl: './crosspost.zh-hant.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostZhHant extends Crosspost {
  protected override readonly returnHere = { next: '/zh-hant/crosspost' };
}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-ko',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, CrosspostWorkbench],
  templateUrl: './crosspost.ko.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostKo extends Crosspost {
  protected override readonly returnHere = { next: '/ko/crosspost' };
}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-pt',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, CrosspostWorkbench],
  templateUrl: './crosspost.pt.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostPt extends Crosspost {
  protected override readonly returnHere = { next: '/pt/publicar-no-mastodon-e-no-bluesky' };
}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-crosspost-it',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, CrosspostWorkbench],
  templateUrl: './crosspost.it.html',
  styleUrl: '../focused-apps/focused-page.css',
  providers: [provideRouteLanguage()],
})
export class CrosspostIt extends Crosspost {
  protected override readonly returnHere = { next: '/it/pubblicare-su-mastodon-e-bluesky' };
}
