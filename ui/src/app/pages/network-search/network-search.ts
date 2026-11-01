import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { SearchLauncher, SearchNetwork } from './search-launcher';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';
import { originalPath, toolPageAt } from '../../focused-tools';

/**
 * Search as a focused mini-app, at two URLs: /mastodon-search and
 * /bluesky-search. A search box first, the copy after; searching lands on the
 * app's own search page with the network preset and the search running.
 *
 * The network comes from the route's path, as on the Bluesky ⇄ Mastodon pages,
 * so the public page, the signed-in twin and the prerender agree.
 */
@Component({
  selector: 'app-network-search',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SearchLauncher],
  templateUrl: './network-search.html',
  styleUrls: ['../focused-apps/focused-page.css', './network-search.css'],
})
export class NetworkSearch {
  protected readonly route = inject(ActivatedRoute);
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = this.route.snapshot.data['inShell'] === true;
  protected readonly network: SearchNetwork = networkOf(this.route);
  /** This page's own path, in its language, for the search box's sign-in return. */
  protected readonly root = `/${toolPageAt(stepPaths(this.route))?.path ?? 'mastodon-search'}`;
}

/** The paths of a route's steps, root first. */
function stepPaths(route: ActivatedRoute): string[] {
  return (route.snapshot?.pathFromRoot ?? []).map((step) => step.routeConfig?.path ?? '');
}

/** Mastodon unless the page is a version, in any language, of /bluesky-search. */
export function networkOf(route: ActivatedRoute): SearchNetwork {
  const page = toolPageAt(stepPaths(route));
  return page && originalPath(page) === 'bluesky-search' ? 'bluesky' : 'mastodon';
}

/**
 * The German pages (focused-tools.json `lang: "de"`), both networks: the same
 * search box, German words, and everything translated inside it pinned to
 * German (see page-language.ts).
 */
@Component({
  selector: 'app-network-search-de',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SearchLauncher],
  templateUrl: './network-search.de.html',
  styleUrls: ['../focused-apps/focused-page.css', './network-search.css'],
  providers: [provideRouteLanguage()],
})
export class NetworkSearchDe extends NetworkSearch {}

/** The Japanese pages, both networks; see NetworkSearchDe. */
@Component({
  selector: 'app-network-search-ja',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SearchLauncher],
  templateUrl: './network-search.ja.html',
  styleUrls: ['../focused-apps/focused-page.css', './network-search.css'],
  providers: [provideRouteLanguage()],
})
export class NetworkSearchJa extends NetworkSearch {}

/** The French pages, both networks; see NetworkSearchDe. */
@Component({
  selector: 'app-network-search-fr',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SearchLauncher],
  templateUrl: './network-search.fr.html',
  styleUrls: ['../focused-apps/focused-page.css', './network-search.css'],
  providers: [provideRouteLanguage()],
})
export class NetworkSearchFr extends NetworkSearch {}

/**
 * The Spanish page (focused-tools.json `lang: "es"`): the same tool and
 * logic, Spanish words, and everything translated inside it pinned to
 * Spanish (see page-language.ts).
 */
@Component({
  selector: 'app-network-search-es',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SearchLauncher],
  templateUrl: './network-search.es.html',
  styleUrls: ['../focused-apps/focused-page.css', './network-search.css'],
  providers: [provideRouteLanguage()],
})
export class NetworkSearchEs extends NetworkSearch {}

/**
 * The Traditional Chinese page (focused-tools.json `lang: "zh-Hant"`): the same tool and
 * logic, Traditional Chinese words, and everything translated inside it pinned to
 * Traditional Chinese (see page-language.ts).
 */
@Component({
  selector: 'app-network-search-zh-hant',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SearchLauncher],
  templateUrl: './network-search.zh-hant.html',
  styleUrls: ['../focused-apps/focused-page.css', './network-search.css'],
  providers: [provideRouteLanguage()],
})
export class NetworkSearchZhHant extends NetworkSearch {}

/**
 * The Korean page (focused-tools.json `lang: "ko"`): the same tool and
 * logic, Korean words, and everything translated inside it pinned to
 * Korean (see page-language.ts).
 */
@Component({
  selector: 'app-network-search-ko',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SearchLauncher],
  templateUrl: './network-search.ko.html',
  styleUrls: ['../focused-apps/focused-page.css', './network-search.css'],
  providers: [provideRouteLanguage()],
})
export class NetworkSearchKo extends NetworkSearch {}

/**
 * The Portuguese (Brazil) page (focused-tools.json `lang: "pt"`): the same tool and
 * logic, Portuguese (Brazil) words, and everything translated inside it pinned to
 * Portuguese (Brazil) (see page-language.ts).
 */
@Component({
  selector: 'app-network-search-pt',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SearchLauncher],
  templateUrl: './network-search.pt.html',
  styleUrls: ['../focused-apps/focused-page.css', './network-search.css'],
  providers: [provideRouteLanguage()],
})
export class NetworkSearchPt extends NetworkSearch {}

/**
 * The Italian page (focused-tools.json `lang: "it"`): the same tool and
 * logic, Italian words, and everything translated inside it pinned to
 * Italian (see page-language.ts).
 */
@Component({
  selector: 'app-network-search-it',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SearchLauncher],
  templateUrl: './network-search.it.html',
  styleUrls: ['../focused-apps/focused-page.css', './network-search.css'],
  providers: [provideRouteLanguage()],
})
export class NetworkSearchIt extends NetworkSearch {}
