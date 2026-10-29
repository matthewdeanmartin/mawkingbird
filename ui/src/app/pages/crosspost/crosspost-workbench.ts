import { Component, computed, inject } from '@angular/core';
import { Auth } from '../../auth';
import { Compose, PostTarget } from '../../compose/compose';
import { BlueskySession } from '../../providers/bluesky/bluesky-session';
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';
import { ConnectionBluesky } from '../settings/connections/bluesky/connection-bluesky';
import { ConnectionMastodon } from '../settings/connections/mastodon/connection-mastodon';

/**
 * The signed-in body of /crosspost: the app's own composer aimed at whatever
 * this session can reach, and the existing connector for the missing network.
 *
 * Signed in with one network the composer still works for that one, so the
 * visitor can try it at once; connecting the other switches it to both.
 */
@Component({
  selector: 'app-crosspost-workbench',
  imports: [Compose, ConnectionBluesky, ConnectionMastodon, FocusedNextSteps],
  template: `
    <section class="panel">
      <h2>{{ heading() }}</h2>
      <!-- One composer per target: the composer reads its target once, and
           connecting a network should start it afresh aimed at both. -->
      @switch (target()) {
        @case ('both') {
          <app-compose [compact]="true" initialTarget="both" />
        }
        @case ('fedi') {
          <app-compose [compact]="true" initialTarget="fedi" />
        }
        @case ('bsky') {
          <app-compose [compact]="true" initialTarget="bsky" />
        }
      }
    </section>

    @if (!bskyReady()) {
      <section class="panel">
        <h2>Add Bluesky to post to both</h2>
        <app-connection-bluesky [embedded]="true" />
      </section>
    }
    @if (!mastodonReady()) {
      <section class="panel">
        <h2>Add Mastodon to post to both</h2>
        <app-connection-mastodon [embedded]="true" />
      </section>
    }

    <app-focused-next-steps inviteLink="/crosspost/invite" />
  `,
  styleUrl: '../focused-apps/focused-page.css',
})
export class CrosspostWorkbench {
  private readonly auth = inject(Auth);
  private readonly bsky = inject(BlueskySession);

  /** A Mastodon token, as the identity or as a Bluesky account's connector. */
  protected readonly mastodonReady = computed(() => !this.auth.lacksMastodonToken);
  protected readonly bskyReady = computed(() => this.bsky.linked());

  protected readonly target = computed<PostTarget>(() =>
    this.mastodonReady() && this.bskyReady() ? 'both' : this.mastodonReady() ? 'fedi' : 'bsky',
  );

  protected readonly heading = computed(() => {
    switch (this.target()) {
      case 'both':
        return 'Write once, post to Mastodon and Bluesky';
      case 'fedi':
        return 'Try it on Mastodon';
      default:
        return 'Try it on Bluesky';
    }
  });
}
