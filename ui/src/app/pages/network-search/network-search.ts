import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { SearchLauncher, SearchNetwork } from './search-launcher';
import { provideRouteLanguage } from '../../page-language';
import { LanguageVersions } from '../focused-apps/language-versions';

const ROOTS: Record<SearchNetwork, string> = {
  mastodon: '/mastodon-search',
  bluesky: '/bluesky-search',
};

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
  protected readonly root = ROOTS[this.network];
}

/** Mastodon unless the path says Bluesky. */
export function networkOf(route: ActivatedRoute): SearchNetwork {
  const paths = route.snapshot.pathFromRoot.map((step) => step.routeConfig?.path ?? '');
  // Any language version: the English slug, under /ja/ too, or the German one.
  return paths.some((path) => path.endsWith('bluesky-search') || path === 'de/bluesky-suche')
    ? 'bluesky'
    : 'mastodon';
}

/** The German pages' own paths, one per network. */
const GERMAN_ROOTS: Record<SearchNetwork, string> = {
  mastodon: '/de/mastodon-suche',
  bluesky: '/de/bluesky-suche',
};

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
export class NetworkSearchDe extends NetworkSearch {
  protected override readonly root = GERMAN_ROOTS[networkOf(this.route)];
}

/** The Japanese pages' own paths, one per network. */
const JAPANESE_ROOTS: Record<SearchNetwork, string> = {
  mastodon: '/ja/mastodon-search',
  bluesky: '/ja/bluesky-search',
};

/** The Japanese pages, both networks; see NetworkSearchDe. */
@Component({
  selector: 'app-network-search-ja',
  imports: [RouterLink, MbButton, MbContentLink, LanguageVersions, SearchLauncher],
  templateUrl: './network-search.ja.html',
  styleUrls: ['../focused-apps/focused-page.css', './network-search.css'],
  providers: [provideRouteLanguage()],
})
export class NetworkSearchJa extends NetworkSearch {
  protected override readonly root = JAPANESE_ROOTS[networkOf(this.route)];
}
