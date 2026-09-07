import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusCard } from '../../status-card/status-card';
import { Status } from '../../models';
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
const FUNDING_BODY = `
<p><strong>Funding.</strong></p>
<p>Mawkingbird is free and open source. Nothing below is a revenue model — it's a list of who pays for what.</p>
<p>· I may sign up for Liberapay donations.<br>
· Donations, grants and sponsorship are all welcome. None are in place today.<br>
· GitHub hosting is free, hopefully forever. This would be trivial for someone to fork and host somewhere else.<br>
· I pay for the domain out of pocket.</p>
<p><strong>How it's built.</strong> The code is written with an LLM on three $20-a-month plans. If that bothers you, you don't have to use it. Quality is assured with an enormous number of unit tests and manual testing. Code deploys to a canary site first, then gets promoted to production. Feature flags hold back some features until the flag is enabled. At the moment, I accept merge requests from no one.</p>
<p><strong>What things cost you.</strong></p>
<p>· The connections cost money. You pay them directly to the third party, or use their free tier.<br>
· Some free APIs will not work without a CORS proxy. It is not a VPN, but it is similar to one in that some of your network traffic passes through a third party.<br>
· Connectors to the third-party Twitter API are accomplished through screen scraping. No claims are made about the legal status of screen scraping; I presume it is fair use. The Mawkingbird static client hosts no third-party content.</p>
<p><strong>Roadmap.</strong> Possibly someday, a paid option for:</p>
<p>· CORS proxying.<br>
· A non-federating, accountless posting experience.<br>
· · Possibly with integrated link shortener and paste support.</p>
<p>These features can't be provided on a static-only website, and the free options have a lot of drawbacks.</p>
`;

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
