# Analytics metrics evaluation (2026-11-20)

Written after analytics Sprints 1–6 ([plan](sprint/analytics-reach-2026-11.md)).
Question: do the current metrics measure something useful, do they measure
what their labels say, and what is missing? The owner's framing questions
follow. Each answer separates **measured** (counted from data) from
**modelled** (an estimate).

1. Are my messages reaching anyone?
2. Of what I've written, what does my audience say is good?
3. Is the person I'm looking at a bot?
4. Are they a zombie? ("Is anyone home? Am I talking to myself?")
5. Am I flooding the timeline? Will this person flood mine?
6. Is this person's content mostly theirs, or mostly someone else's?
7. Does this account have a style: broadcaster, chatter, balanced?

## Verdict, question by question

| Question                       | Today                                                                                      | Verdict                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Reaching anyone?            | Est. reach / Could have reached (modelled), engagements per post, effective-followers scan | **Partly answered.** Reach is plausible (owner testing) but modelled. The strongest measured answer, _how many different people reacted_, is not shown. |
| 2. What does my audience like? | Top 3 posts by raw engagement                                                              | **Weak.** Raw counts favour old posts and the post that went viral; nothing says _what kind_ of post does well.                                         |
| 3. Bot?                        | Nothing explicit. The self-declared `bot` flag is not shown on the analytics page.         | **Not answered.** The signals exist in data we already load.                                                                                            |
| 4. Zombie?                     | Liveliness (recency × cadence), last-posted line                                           | **Mostly answered, with a hole.** The sample excludes boosts, so an account that only boosts looks Dormant.                                             |
| 5. Flooding?                   | Posts per day, recent posts/day; feed analytics' top-author share                          | **Undercounted.** Boosts are excluded, and boosts are most of a flood. No "share of _my_ timeline" figure.                                              |
| 6. Theirs or someone else's?   | Not measured (boosts are excluded from the sample)                                         | **Not answered.**                                                                                                                                       |
| 7. Style?                      | Replies given, talks to most                                                               | **Ingredients only.** No summary, and replies given was wrong until today (it counted self-threads; fixed).                                             |

## The current metrics, one by one

Rating: **Keep** (useful and labelled truthfully), **Fix** (useful but measures
something slightly different from its label), **Demote** (true but rarely
useful).

### Account analytics

| Metric                                              | Rating                     | Note                                                                                                                                                 |
| --------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Est. reach, per thread, Could have reached          | Keep                       | Modelled and labelled as an estimate. See [zombies and reach](#do-zombie-followers-lower-reach). Large accounts reach the cap (open owner decision). |
| Favourites / Boosts / Replies received              | Keep                       | Measured. Remote interactions the server never saw are missing (documented).                                                                         |
| Engagements per post                                | Fix                        | A mean: one viral post moves it a lot. Show the median beside it, or replace it.                                                                     |
| Replies given                                       | Fix → **fixed 2026-11-20** | Counted continuing your own thread as a reply. Now replies to others only.                                                                           |
| Shortest / longest post                             | Demote                     | Trivia. The median length and the share of long posts (> 500 characters) say more about style.                                                       |
| Posts per day                                       | Fix                        | Divides by the sample's span, so a burst followed by silence reads as a steady rate. Boosts are excluded.                                            |
| Liveliness, recent posts/day                        | Fix                        | Good method (anchored to now), but blind to boosts. Should also use `account.last_status_at`, which includes boosts and costs nothing.               |
| Followers / Following                               | Keep                       |                                                                                                                                                      |
| When they post (week/month/weekday/hour)            | Keep for cadence           | Shows when they post, not when posts _do well_. See question 2.                                                                                      |
| Languages, hashtags, link domains, talks to most    | Keep                       |                                                                                                                                                      |
| Effective friends / followers (scan)                | Keep                       | The only measured zombie answer. Costly (one call per 80 accounts), so it is opt-in. Defines "active" as _posted_ recently.                          |
| Top posts                                           | Fix                        | Raw engagement. See question 2.                                                                                                                      |
| Native: last 30 vs previous 30, by month, followers | Keep                       | Coverage is marked. New follows are counted, unfollows are not (the server does not report them).                                                    |

### Post analytics

| Metric                            | Rating | Note                                                            |
| --------------------------------- | ------ | --------------------------------------------------------------- |
| Reach, Could have reached, counts | Keep   |                                                                 |
| Replies vs visible here           | Keep   | The gap is real and useful: replies your server never received. |
| Who boosted (with followers)      | Keep   |                                                                 |
| Native arrival windows            | Keep   | Only for notifications collected since migration 6.             |

### Feed analytics (hashtag, list, Home, starter collection)

| Metric                                                         | Rating | Note                                                                                                                |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| Posts, authors, instances, Top 5 share, composition, languages | Keep   | Measured and labelled.                                                                                              |
| Avg. favourites                                                | Fix    | A mean; skewed by one popular post.                                                                                 |
| No engagement                                                  | Fix    | Includes posts minutes old that have not had time. Exclude posts younger than a few hours, or say "older than 6 h". |
| Median post age                                                | Keep   | Answers "how fast does this feed move".                                                                             |

## Do zombie followers lower reach?

Short answer: **implicitly and in general, yes; for your account specifically,
no.**

- The net curve's base rate (1.65% of the potential audience) was fitted to raw
  follower counts. Those include inactive followers, so a typical share of
  inactive followers is built into the estimate. Your account's actual share
  is not used.
- If 50% of your followers are inactive and the fitted data had fewer, the
  estimate runs high for you.
- **"Zombie" here means "has not posted".** Mastodon reports no "last seen".
  The effective-followers scan uses `last_status_at`, so a reader who never
  posts counts as a zombie. Some of the 50% are readers. Cutting reach in half
  would undercount them.

**Recommendation:** keep the headline estimate as it is. When an effective-
followers scan exists, show a second figure next to it: "**Active-audience
reach**", the same model with followers replaced by recently-posting followers.
Present it as a lower bound with a one-line (?) ("counts only followers who
posted in the last 30 days"). Readers then see a range (active-only to all
followers) rather than a single number of false precision. In native, the
follower list could be collected once and kept fresh like the following list,
which makes the scan free after the first run.

## Missing metrics, by question

Cost: **free** means it uses data the page already loads; **archive** means it
uses data native already collects; **calls** means it needs new requests.

### 1. Are my messages reaching anyone?

- **People who reacted** (measured): distinct accounts that favourited,
  boosted, replied or quoted, per month. _Native: archive_ (notifications).
  This is the honest version of "is anyone listening".
- **Returning engagers**: people who reacted in two or more of the last three
  months, which is your actual audience core. _Archive._
- **Posts nobody reacted to**: share of your posts older than 2 days with zero
  favourites, boosts and replies. _Free._ Feed analytics has this; account
  analytics does not.
- **Active-audience reach** (see above). _Free_ once a scan exists.

### 2. What does my audience say is good?

- **Relative performance**: each post's engagement divided by your median for
  posts of similar age. Score posts only after 48 hours, so new posts are not
  judged early. Rank top posts by this instead of raw totals. _Free._
- **What works**: median engagement by post type (with image, link, thread,
  hashtag, content warning, length bucket, hour of day). Feed analytics already
  has "engagement by type"; reuse it for accounts. _Free._
- **Conversation starters**: posts with the most replies from _different_
  people. _Calls_ on web (context per post); _archive_ if replies are kept.

### 3. Is this a bot?

Show evidence and leave the conclusion to the reader. A label like "Bot: 87%"
would claim more than the data supports.

- The self-declared **bot flag**. _Free_ (on `Account`).
- **Clockwork posting**: how regular the gaps between posts are (coefficient of
  variation), and posts in all 24 hours with no daily rest. _Free._
- **Never replies** (replies given ≈ 0%) together with a high link share or the
  same link domain on nearly every post. _Free._
- **Repeated text**: near-identical posts (same template, different link).
  _Free_ (cheap text shingling).
- **Posting app**: `status.application` where the server exposes it (feed
  readers and cross-posters name themselves). _Free where present._

### 4. Is anyone home? (zombie)

- Use **`account.last_status_at`** (includes boosts), not only the
  boost-excluded sample. _Free._ This fixes accounts that only boost.
- **Last reply to anyone**: someone who posts but never replies is "home but
  not talking". _Free._
- **Have they ever interacted with you**: native knows from notifications.
  _Archive._ It answers "am I talking to myself" for one specific person.

### 5. Flooding

- **Daily volume including boosts**, plus **burstiness**: the busiest hour and
  the share of posts that come in bursts. _Free_ if the sample includes boosts.
  Today it excludes them, which needs a separate count rather than a second
  fetch: Mastodon has no boosts-only filter, so include them in the sample and
  separate them in code.
- **Share of your Home timeline**: their daily posts ÷ your Home's daily posts.
  "Following them would add about 1 in 12 posts to your Home." _Free_ in native
  (archive knows your Home volume). On web, it uses the Home feed analytics
  sample.
- For yourself: your daily volume against your followers' typical Home volume
  is unknowable. The useful version is "posts per day, and your busiest hour".

### 6. Theirs or someone else's?

- **Own words vs passed along**: shares of original posts, replies, boosts,
  quotes, and link-only posts (a link with little text of their own). _Free_
  with boosts included in the sample.
- **Cross-posted**: posts carrying a Bluesky or Twitter bridge marker, or an RSS
  bot's posting app. _Free where visible._

### 7. Style

A one-line summary, with the shares that decided it shown underneath. It is a
description, not a score:

| Style             | Rule of thumb (on the shares above)                    |
| ----------------- | ------------------------------------------------------ |
| Broadcaster       | Replies to others < 10%, original posts > 60%          |
| Conversationalist | Replies to others > 50%                                |
| Curator           | Boosts > 50%                                           |
| Link sharer       | Link-only posts > 50%                                  |
| Thread writer     | > 30% of original posts are part of multi-post threads |
| Balanced          | None of the above dominates                            |

Supporting figures: how many different people they reply to (one friend vs.
many), the follower/following ratio, and replies received against replies
given (do people answer them?).

## Owner response and status (2026-11-20)

- Boosts vs originals, the bot flag and bot-like rhythm, the diversity of
  people reached, and a style classification: **built** in
  [Sprint 7](sprint/analytics-reach-2026-11.md).
- Relative performance / age scaling: **declined**. Posts get their feedback
  quickly and then stop, so raw totals are fine.
- Viral posts: already covered by Top posts.
- Still open from this document: medians beside means, "no engagement"
  ignoring very fresh posts, "what works" by post type and hour, repeated-text
  and posting-app bot evidence, flooding (daily volume with boosts,
  burstiness, share of your Home), last reply to anyone, and active-audience
  reach.

## Suggested next sprints

| Sprint                   | Contents                                                                                                                                                                                                           | Cost                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 7 — Fix the base         | Include boosts in the account sample and split them in code; use `last_status_at` in liveliness; medians beside means; "no engagement" ignores posts < 6 h; top posts by relative performance (≥ 48 h)             | Free; no new requests on web (same pages, boosts kept) |
| 8 — Who is this?         | Account-page "Profile" panel: style summary, own-words vs passed-along, automation signals (bot flag, clockwork, never replies, repeated text, posting app), "is anyone home" (last post incl. boosts, last reply) | Free                                                   |
| 9 — Is anyone listening? | People who reacted, returning engagers, posts nobody reacted to, what works (by type/hour), active-audience reach next to Est. reach                                                                               | Free / archive                                         |
| 10 — Flooding            | Daily volume with boosts, burstiness, share of your Home (native exact, web from Home sample); the same figures on the follow button's preview                                                                     | Free / archive                                         |

Each new figure gets a (?) under the same rule: what it is, how it is
calculated, and what data it used, briefly.
