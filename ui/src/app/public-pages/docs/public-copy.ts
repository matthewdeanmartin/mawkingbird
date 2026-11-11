/**
 * The project's own essays, shared by the in-app virtual tweets (About,
 * Funding) and their prerendered public copies, so search engines index exactly
 * the text a visitor reads in the app. Trusted, hand-authored HTML.
 */
export const DESIGN_BODY = `
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

export const FUNDING_BODY = `
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
