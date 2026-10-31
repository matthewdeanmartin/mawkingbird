import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { SearchLauncher, SearchNetwork } from './search-launcher';

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
  imports: [RouterLink, MbButton, MbContentLink, SearchLauncher],
  templateUrl: './network-search.html',
  styleUrls: ['../focused-apps/focused-page.css', './network-search.css'],
})
export class NetworkSearch {
  private readonly route = inject(ActivatedRoute);
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = this.route.snapshot.data['inShell'] === true;
  protected readonly network: SearchNetwork = networkOf(this.route);
  protected readonly root = ROOTS[this.network];
}

/** Mastodon unless the path says Bluesky. */
export function networkOf(route: ActivatedRoute): SearchNetwork {
  const paths = route.snapshot.pathFromRoot.map((step) => step.routeConfig?.path ?? '');
  return paths.includes('bluesky-search') ? 'bluesky' : 'mastodon';
}
