import { Component, computed, inject, input } from '@angular/core';
import { Auth } from '../../auth';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';
import { ConnectionBluesky } from '../settings/connections/bluesky/connection-bluesky';
import { ConnectionMastodon } from '../settings/connections/mastodon/connection-mastodon';
import { BridgeFinder } from '../settings/import-export/bridge-finder';
import { BridgeFriendsImport } from '../settings/import-export/bridge-friends-import';
import { BridgeNetwork } from '../settings/import-export/bridge-matching';

/**
 * The signed-in body of the Bluesky ⇄ Mastodon pages: connect whichever network
 * is missing, right here, then run the finder in the page's direction.
 */
@Component({
  selector: 'app-friend-bridge-workbench',
  imports: [BridgeFriendsImport, ConnectionBluesky, ConnectionMastodon, FocusedNextSteps],
  template: `
    @if (!bskyReady()) {
      <section class="panel">
        <h2>Connect Bluesky</h2>
        <app-connection-bluesky [embedded]="true" />
      </section>
    }
    @if (!mastodonReady()) {
      <section class="panel">
        <h2>Connect Mastodon</h2>
        <app-connection-mastodon [embedded]="true" />
      </section>
    }

    <app-bridge-friends-import [fixedSource]="source()" [connectInline]="true" />

    <!-- After the follows are read: the task is underway, so the rest of the app can wait no longer. -->
    @if (bridge.rows().length) {
      <app-focused-next-steps [inviteLink]="root() + '/invite'" />
    }
  `,
  styleUrl: '../focused-apps/focused-page.css',
})
export class FriendBridgeWorkbench {
  private readonly auth = inject(Auth);
  private readonly bsky = inject(BlueskySession);
  protected readonly bridge = inject(BridgeFinder);

  readonly source = input.required<BridgeNetwork>();
  readonly root = input.required<string>();

  /** A Mastodon token, as the identity or as a Bluesky account's connector. */
  protected readonly mastodonReady = computed(() => !this.auth.lacksMastodonToken);
  protected readonly bskyReady = computed(() => this.bsky.linked());
}
