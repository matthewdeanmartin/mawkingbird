import { Component, computed, inject, input } from '@angular/core';
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';
import { TwitterFriendDiscovery } from '../settings/import-export/twitter-friend-discovery';

/** The next-step cards, held back until a search has run. */
@Component({
  selector: 'app-twitter-import-next-steps',
  imports: [FocusedNextSteps],
  template: `
    @if (attempted()) {
      <app-focused-next-steps
        [inviteLink]="signedIn() ? '/twitter-to-mastodon/invite' : '/invites'"
      />
    }
  `,
})
export class TwitterImportNextSteps {
  private readonly discovery = inject(TwitterFriendDiscovery);
  /** Signed in, the invite builder is the mini-app's own tab. */
  readonly signedIn = input(false);
  protected readonly attempted = computed(() => this.discovery.callCount() > 0);
}
