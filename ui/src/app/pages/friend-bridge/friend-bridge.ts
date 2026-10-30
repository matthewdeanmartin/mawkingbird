import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { BridgeNetwork } from '../settings/import-export/bridge-matching';
import { FriendBridgeWorkbench } from './friend-bridge-workbench';

/** The network names a direction reads from and searches on. */
export interface BridgeCopy {
  source: BridgeNetwork;
  from: string;
  to: string;
  /** This page's own path, for the sign-in return and the Invite tab. */
  root: string;
}

const COPY: Record<BridgeNetwork, BridgeCopy> = {
  bluesky: { source: 'bluesky', from: 'Bluesky', to: 'Mastodon', root: '/bluesky-to-mastodon' },
  mastodon: { source: 'mastodon', from: 'Mastodon', to: 'Bluesky', root: '/mastodon-to-bluesky' },
};

/**
 * The bridge finder as a focused mini-app, at two URLs: /bluesky-to-mastodon
 * reads your Bluesky follows and finds them on Mastodon, /mastodon-to-bluesky
 * the reverse. One page, because the finder is one engine either way round.
 *
 * The direction comes from the route's path rather than route data, so the
 * signed-in twin, the public page and the prerender all agree without each
 * having to pass it along.
 */
@Component({
  selector: 'app-friend-bridge',
  imports: [RouterLink, MbButton, MbContentLink, FriendBridgeWorkbench],
  templateUrl: './friend-bridge.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class FriendBridge {
  private readonly route = inject(ActivatedRoute);
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = this.route.snapshot.data['inShell'] === true;
  protected readonly copy: BridgeCopy = COPY[bridgeSourceOf(this.route)];
  protected readonly returnHere = { next: this.copy.root };
}

/** Bluesky is read unless the path says it is Mastodon's follows being read. */
export function bridgeSourceOf(route: ActivatedRoute): BridgeNetwork {
  const paths = route.snapshot.pathFromRoot.map((step) => step.routeConfig?.path ?? '');
  return paths.includes('mastodon-to-bluesky') ? 'mastodon' : 'bluesky';
}
