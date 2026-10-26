import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusCard } from '../../status-card/status-card';
import { Status } from '../../models';
import { DESIGN_BODY } from '../docs/public-copy';
import { MAWKINGBIRD_ACCOUNT, virtualTweet } from '../docs/static-status';

// i18n about.title: Design

/**
 * "Design" — the project story, rendered as a single tall virtual tweet in the
 * centre column (inside the app shell). It used to be a bespoke full-page layout
 * outside the shell; now it reads like any other post so the reader never leaves
 * the app. See {@link virtualTweet}.
 */
@Component({
  selector: 'app-about',
  imports: [StatusCard, TranslocoPipe],
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About {
  protected status: Status = virtualTweet({
    id: 'mawkingbird:design',
    content: DESIGN_BODY,
    account: MAWKINGBIRD_ACCOUNT,
  });
}
