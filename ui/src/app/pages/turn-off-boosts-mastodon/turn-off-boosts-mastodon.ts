import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { BoostsWorkbench } from './boosts-workbench';

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
  imports: [RouterLink, MbButton, MbContentLink, BoostsWorkbench],
  templateUrl: './turn-off-boosts-mastodon.html',
  styleUrl: '../focused-apps/focused-page.css',
})
export class TurnOffBoostsMastodon {
  /** Set on the signed-in route, where the shell supplies header and account menu. */
  protected readonly inShell = inject(ActivatedRoute).snapshot.data['inShell'] === true;
  protected readonly returnHere = { next: '/turn-off-boosts-mastodon' };
}
