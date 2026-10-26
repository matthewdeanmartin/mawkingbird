var e=`
<p><strong>Why I asked a bot to create this.</strong></p>
<p>I miss 2018 twitter. It was before the redesign that still is on the renamed twitter. So goal one is to bring back the proper design. You used to be able to do that with a browser plugin, but eventually Twitter broke that. This first of all, fixes that.</p>
<p><strong>Other things this client has:</strong></p>
<p>\xB7 Twitter Blue features, but for free.<br>
\xB7 Give everyone a blue check, or a check to everyone with more followers than you.<br>
\xB7 No infinite feed \u2014 it eventually stops; click to get the next page. Touch grass.<br>
\xB7 Bookmarks tacked on to the end of the finite feed. Bookmarks are to be revisited.<br>
\xB7 The algorithm isn't evil: no injected rage or stranger content you didn't ask for. It's your tags and feed sorted by the product of likes, replies and retweets.<br>
\xB7 Failwhale is back.<br>
\xB7 Follow everyone on a collection.<br>
\xB7 House endorsements for my other projects.<br>
\xB7 Cyber-begging links for the Mastodon network and your instance \u2014 this stuff isn't free, go help them out.<br>
\xB7 Bsky and RSS as feed providers.<br>
\xB7 Twitter-style Analytics (on a little data).<br>
\xB7 Modern search: saved searches, facets, and so on.</p>
<p>Why "mawkingbird"? Because mockingbird as a domain is taken. I started this while building a mock mastodon server to integration-test my other mastodon projects.</p>
<p><strong>Implementation.</strong> Written in Angular, latest signals patterns, tested against a mock mastodon instance and real instances. I've been daily-driving it and now like it better than elk.zone.</p>
`,t=`
<p><strong>Funding.</strong></p>
<p>Mawkingbird is free and open source. Nothing below is a revenue model \u2014 it's a list of who pays for what.</p>
<p>\xB7 I may sign up for Liberapay donations.<br>
\xB7 Donations, grants and sponsorship are all welcome. None are in place today.<br>
\xB7 GitHub hosting is free, hopefully forever. This would be trivial for someone to fork and host somewhere else.<br>
\xB7 I pay for the domain out of pocket.</p>
<p><strong>How it's built.</strong> The code is written with an LLM on three $20-a-month plans. If that bothers you, you don't have to use it. Quality is assured with an enormous number of unit tests and manual testing. Code deploys to a canary site first, then gets promoted to production. Feature flags hold back some features until the flag is enabled. At the moment, I accept merge requests from no one.</p>
<p><strong>What things cost you.</strong></p>
<p>\xB7 The connections cost money. You pay them directly to the third party, or use their free tier.<br>
\xB7 Some free APIs will not work without a CORS proxy. It is not a VPN, but it is similar to one in that some of your network traffic passes through a third party.<br>
\xB7 Connectors to the third-party Twitter API are accomplished through screen scraping. No claims are made about the legal status of screen scraping; I presume it is fair use. The Mawkingbird static client hosts no third-party content.</p>
<p><strong>Roadmap.</strong> Possibly someday, a paid option for:</p>
<p>\xB7 CORS proxying.<br>
\xB7 A non-federating, accountless posting experience.<br>
\xB7 \xB7 Possibly with integrated link shortener and paste support.</p>
<p>These features can't be provided on a static-only website, and the free options have a lot of drawbacks.</p>
`;export{e as a,t as b};
