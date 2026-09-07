import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusCard } from '../../status-card/status-card';
import { Status } from '../../models';
import { MAWKINGBIRD_ACCOUNT, virtualTweet } from '../docs/static-status';

// i18n about.title: Design

/**
 * "Design" — the project story, rendered as a single tall virtual tweet in the
 * centre column (inside the app shell). It used to be a bespoke full-page layout
 * outside the shell; now it reads like any other post so the reader never leaves
 * the app. See {@link virtualTweet}.
 */
const DESIGN_BODY = `
<p><strong>Why I asked a bot to create this.</strong></p>
<p>I miss 2018 twitter. It was before the redesign that still is on the renamed twitter. So goal one is to bring back the proper design. You used to be able to do that with a browser plugin, but eventually Twitter broke that. This first of all, fixes that.</p>
<p><strong>Other things this client has:</strong></p>
<p>· Twitter Blue features, but for free.<br>
· Give everyone a blue check, or a check to everyone with more followers than you.<br>
· No infinite feed — it eventually stops; click to get the next page. Touch grass.<br>
· Bookmarks tacked on to the end of the finite feed. Bookmarks are to be revisited.<br>
· The algorithm isn't evil: no injected rage or stranger content you didn't ask for. It's your tags and feed sorted by the product of likes, replies and retweets.<br>
· Failwhale is back.<br>
· Follow everyone on a collection.<br>
· House endorsements for my other projects.<br>
· Cyber-begging links for the Mastodon network and your instance — this stuff isn't free, go help them out.<br>
· Bsky and RSS as feed providers.<br>
· Twitter-style Analytics (on a little data).<br>
· Modern search: saved searches, facets, and so on.</p>
<p>Why "mawkingbird"? Because mockingbird as a domain is taken. I started this while building a mock mastodon server to integration-test my other mastodon projects.</p>
<p><strong>Implementation.</strong> Written in Angular, latest signals patterns, tested against a mock mastodon instance and real instances. I've been daily-driving it and now like it better than elk.zone.</p>
`;

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
