import { Component, computed, inject } from '@angular/core';
import { Auth } from '../../platform/session/auth';
import { Compose, PostTarget } from '../compose/compose';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import {
  FocusedNextSteps,
  toolInviteLink,
} from '../../public-pages/focused-apps/focused-next-steps';

// i18n focusedTools.crosspost.both: Write once, post to Mastodon and Bluesky
// i18n focusedTools.crosspost.fedi: Try it on Mastodon
// i18n focusedTools.crosspost.bsky: Try it on Bluesky
// i18n focusedTools.crosspost.addBluesky: Add Bluesky to post to both
// i18n focusedTools.crosspost.addMastodon: Add Mastodon to post to both
import { ConnectionBluesky } from '../../settings/connections/bluesky/connection-bluesky';
import { ConnectionMastodon } from '../../settings/connections/mastodon/connection-mastodon';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The signed-in body of /crosspost: the app's own composer aimed at whatever
 * this session can reach, and the existing connector for the missing network.
 *
 * Signed in with one network the composer still works for that one, so the
 * visitor can try it at once; connecting the other switches it to both.
 */
@Component({
  selector: 'app-crosspost-workbench',
  imports: [TranslocoPipe, Compose, ConnectionBluesky, ConnectionMastodon, FocusedNextSteps],
  template: `
    <section class="panel">
      <h2>{{ heading() | transloco }}</h2>
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
        <h2>{{ 'focusedTools.crosspost.addBluesky' | transloco }}</h2>
        <app-connection-bluesky [embedded]="true" />
      </section>
    }
    @if (!mastodonReady()) {
      <section class="panel">
        <h2>{{ 'focusedTools.crosspost.addMastodon' | transloco }}</h2>
        <app-connection-mastodon [embedded]="true" />
      </section>
    }

    <app-focused-next-steps [inviteLink]="invite" />
  `,
  styleUrl: '../../public-pages/focused-apps/focused-page.css',
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

  protected readonly invite = toolInviteLink();
  /** The panel heading's translation key, by which networks are connected. */
  protected readonly heading = computed(() => {
    switch (this.target()) {
      case 'both':
        return 'focusedTools.crosspost.both';
      case 'fedi':
        return 'focusedTools.crosspost.fedi';
      default:
        return 'focusedTools.crosspost.bsky';
    }
  });
}
