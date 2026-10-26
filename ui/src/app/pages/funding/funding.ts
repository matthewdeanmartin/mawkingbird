import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusCard } from '../../status-card/status-card';
import { Status } from '../../models';
import { FUNDING_BODY } from '../docs/public-copy';
import { MAWKINGBIRD_ACCOUNT, virtualTweet } from '../docs/static-status';

// i18n funding.title: Funding

/**
 * "Funding" — where the money comes from and where it goes. A sibling of Design
 * and Credits: same virtual-tweet treatment, its own route so it can be linked
 * to on its own rather than buried at the bottom of the Design essay.
 *
 * Framed as funding rather than a business plan because the money story is not
 * all commercial — donations, grants and charity belong here too, and "business
 * plan" implies a revenue model this project does not have.
 *
 * The nesting in the source outline (roadmap → the two paid ideas → what the
 * second one would bundle) is flattened to `·` / `· ·` bullets, because
 * StatusCard sanitises to Mastodon post markup and real nested `<ul>`s would not
 * survive the trip. This matches how the Design post lists its features.
 */
@Component({
  selector: 'app-funding',
  imports: [StatusCard, TranslocoPipe],
  templateUrl: './funding.html',
  styleUrl: './funding.css',
})
export class Funding {
  // TODO: once the Liberapay account exists, link the donation line above to
  // https://liberapay.com/<handle> (target=_blank rel="noopener noreferrer",
  // matching the external links in the Credits body).
  protected status: Status = virtualTweet({
    id: 'mawkingbird:funding',
    content: FUNDING_BODY,
    account: MAWKINGBIRD_ACCOUNT,
  });
}
