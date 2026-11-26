import { Component, ChangeDetectionStrategy } from '@angular/core';
import { UnbirdDrop } from '../../../unbird/unbird-drop';
import { UnbirdPeople } from '../../../unbird/unbird-people';

/**
 * Unbird inside setup: drop the Twitter archive, then follow the people found
 * on Mastodon. The same components as /unbird, so the archive stays in Unbird
 * afterwards for posts and profile.
 */
@Component({
  selector: 'app-setup-twitter',
  imports: [UnbirdDrop, UnbirdPeople],
  template: `
    <p class="setup-aside">
      No archive yet? Ask Twitter for it in its settings; it can take a day. Carry on with setup,
      and find your people later under Unbird.
    </p>
    <app-unbird-drop />
    <app-unbird-people />
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './setup-steps.css',
})
export class SetupTwitter {}
