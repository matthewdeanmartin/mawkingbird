# Explore mode (November 2026)

Build: the working tree after Explore Sprints 1–4 (2026-11-26). Epic:
[spec/sprint/explore-2026-11.md](../sprint/explore-2026-11.md). Later sprints add
their sections here.

## You need

- A Mastodon account that follows **fewer than 30** accounts and no hashtags (a
  fresh test account is ideal).
- A Mastodon account that follows **a few RSS relay or bot accounts** (news
  feeds, `@…@rss-parrot.net`, weather bots) plus plenty of people.
- An Anonymous session with a few browser-local follows.
- A Bluesky-only session.
- The Native desktop build, signed in to Mastodon, for one pass.

## Sprint 1: the mode

- [ ] The app switcher lists **Explore** third, after Fedi and Blog, with a compass icon.
- [ ] Choosing it lands on `/explore/feed`. The top bar reads Home · Feed · Kits · People · Tags, then the switcher.
- [ ] Each tab opens its page: Feed (the checkup), Kits (people to follow), People (search opens on people even if you last searched posts on `/search`), Tags (followed hashtags).
- [ ] The left rail's who-to-follow and trends are hidden in Explore, and still there in Fedi.
- [ ] Home returns to Fedi.
- [ ] Reload on an Explore tab: still in Explore.
- [ ] Signed-out `/explore` (trending landing) looks exactly as before.
- [ ] Wellness: with discovery windows on and the window closed, every Explore tab shows the discovery-closed page; opening a window lets you in.
- [ ] Old paths still work: `/feed-doctor`, `/find-friends`, `/feeds/tags`, `/search`, `/bundled-starter-kits`.
- [ ] Native: the switcher offers Explore and all four tabs load.

## Sprint 2: the Feed tab

- [ ] Thin account: **Your Home is thin** or **You follow only a few accounts** comes first, with **Browse starter kits** and **Find people** buttons going to the Kits and People tabs.
- [ ] Thin account: **You don’t follow any hashtags.** with **Find hashtags** → Tags.
- [ ] Bot-heavy account: **Automated accounts wrote N% of this sample**, each account listed with its reasons (says it is a bot / fixed schedule / never replies, mostly links).
- [ ] Mute on one automated account mutes only that one (check the server's mutes).
- [ ] Unfollow on one automated account unfollows it **on the server** (check its profile and your following list). Previously this only edited the browser list.
- [ ] Unfollow on an account you don't follow (reached by a boost or hashtag) says so and does **not** follow it.
- [ ] A healthy account: problems are absent; the green lines sit at the bottom.
- [ ] `/feed-doctor` shows the same checks, titled Feed Doctor; `/explore/feed` is titled Feed checkup.
- [ ] Anonymous: the counts use the browser's follows and hashtags.
- [ ] Bluesky-only: no hashtag line at all.
- [ ] False positives: note any human account flagged as automated, and why, under Findings (thresholds are first guesses).

## Sprint 3: the Tags tab

- [ ] Signed-in Mastodon: Suggested shows up to three groups (You post with these, Like the ones you follow, Trending on your server); no hashtag appears twice, none you already follow.
- [ ] Follow on a suggestion: the button turns to Following, and the tag appears in Followed hashtags below without a reload. Check on the server.
- [ ] Clicking a suggestion's name opens its tag page (a peek before following).
- [ ] Below the suggestions: followed hashtags with the peek box, tags.pub, tag bundles and featured hashtags, as on Feeds → Tags.
- [ ] Feeds → Tags looks as before, plus one "Find more hashtags to follow in Explore" link.
- [ ] Anonymous: follows go to the browser list (Feed checkup count goes up).
- [ ] Bluesky-only: one plain line with Open Feeds and Search posts; no suggestions.
- [ ] Native: Follow works, and nothing on the page shows an error that only Native gets.

## Sprint 4: People, Kits, drafts, more ways in

- [ ] People: no Posts/People/Hashtags tabs; `/explore/people?type=statuses` still searches people; a `#tag` query stays on people. Plain `/search` still has its tabs.
- [ ] People, signed-in Mastodon: server suggestions, then the four "More ways to find people" rows.
- [ ] Kits: the Communities and Starter collections links, on `/bundled-starter-kits` too.
- [ ] Drafts card on the right rail in Fedi and Explore when you have drafts; absent in Blog, RSS, Video, Radio, Forum and Unbird, and with no drafts.
- [ ] A local draft in the card opens in the Home composer; All drafts opens Drafts.
- [ ] Moving between pages does not refetch scheduled posts (DevTools → Network).
- [ ] New links: left rail "More in Explore →" and "More hashtags in Explore →"; Find Friends "Open Explore"; Home analytics "Run a feed checkup". With the discovery window closed the rail and Find Friends links are gone.

## Findings

_None yet._
