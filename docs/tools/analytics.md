# How the analytics numbers work

Mastodon does not publish view counts. Every number on the analytics pages comes
from public data: follower counts, posts, favourites, boosts, replies and
quotes. This page explains how each one is calculated.

## What gets counted

- **Sample.** Account analytics reads an account's latest posts, about 100 of
  them (more if you fetch more pages), along with the boosts in between. In the
  desktop app it reads the local archive instead. Feed analytics reads the posts
  in that feed. The numbers describe this sample, not the account's whole
  history. Boosts count toward the activity mix, style and liveliness. Their
  favourites and boosts belong to someone else, so they are left out of the
  engagement and reach figures.
- **Thread.** One post plus the author's own replies chained under it. A reply
  to someone else is not part of the author's thread and does not count toward
  their reach.
- **Counts** are what the account's server reports when the page loads.
  Favourites from servers it has never heard from are missing.

## Reach

**Est. reach** is the number of people who probably saw a thread.

**Could have reached** is everyone the thread could have reached: the author's
followers, plus the followers of each person who boosted it.

The estimate uses the method published by
[FediWings](https://rstockm.github.io/fediwings/?view=methodik). That method is
fitted to view counts from 510 Instagram stories:

```
min(G, max(0.0165 × G × (1 + 2B + 2Q)^0.7314 × (1 + L + R)^0.2214, L + B + Q))
```

G is Could have reached, B is boosts, Q is quotes, L is favourites and R is
replies. A boost or a quote counts as two shares. The result is never more than
G and never fewer than the people who reacted.

There are two ways to work out G:

|           | Quick reach                                                 | Full reach                                                                          |
| --------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Boosters  | Each boost counts as one typical booster with 268 followers | The real boosters' follower counts, each counted once per thread                    |
| API calls | None                                                        | One per boosted post (up to five pages in the desktop app)                          |
| Where     | Everywhere, by default                                      | Web: after you click **Refine reach**. Desktop app: automatic, saved in the archive |

The 268 comes from a calibration on five public accounts of different sizes.
Each account's median booster audience was taken, then the median of those
five. Boosts whose booster the server does not list also count as 268.

People who follow both the author and a booster are counted twice in Could have
reached. For accounts with more than about 100,000 followers, the estimate
reaches the upper limit, so Est. reach equals Could have reached.

## Account analytics

| Stat                                 | How it is calculated                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Favourites, Boosts, Replies received | Sum over the posts in the sample                                                                             |
| Engagements per post                 | Favourites + boosts + replies received, divided by posts                                                     |
| Replies given                        | Share of the account's own posts that reply to someone else; continuing their own thread does not count      |
| Shortest / longest post              | Visible characters, including any content warning                                                            |
| Posts per day                        | Posts divided by the days between the newest and oldest post in the sample                                   |
| Liveliness                           | 0–100 from how recently and how often they posted or boosted; 40+ is Active, 10–39 Slowing, under 10 Dormant |
| Recent posts / day                   | Posts in the last 30 days, divided by 30                                                                     |
| Effective followers                  | Optional scan of the follower list: followers who posted recently                                            |

### Style and signals

| Stat                                       | How it is calculated                                                                                                                                                                                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Own vs boosted                             | Their own posts (new posts, thread posts, replies) against boosts, out of everything in the sample                                                                                                                                                                          |
| New posts, Thread posts, Replies to others | Each as a share of everything in the sample                                                                                                                                                                                                                                 |
| Link-only posts                            | Share of their own posts that are a link or preview card with under 40 characters of their own text                                                                                                                                                                         |
| Style                                      | The first that fits: Curator (boosts ≥ 50%), Conversationalist (replies to others ≥ 50%), Link sharer (link-only ≥ 50% of own posts), Thread writer (thread posts ≥ 30% of own posts), Broadcaster (replies < 10% and boosts < 30%), otherwise Balanced. Needs 20 statuses. |
| Posting rhythm                             | Human, Partly scheduled or Bot-like (see below)                                                                                                                                                                                                                             |
| Bot setting                                | The account's own "This is an automated account" setting                                                                                                                                                                                                                    |

**Posting rhythm** looks for posts that arrive on a clock. A run is 4 or more
posts in a row with the same gap between them, to within 2 minutes or 1%
(every hour, every 24 hours). Thread posts and boosts are left out, because
people produce even gaps when writing a thread or boosting in one sitting, and
gaps under 5 minutes do not count. With no runs, the account is **Human**. With
60% or more of its posts in runs, it is **Bot-like**. In between, it is
**Partly scheduled**: a scheduler alongside live posting. The profile page
shows a **Bot-like** or **Partly scheduled** label next to the official **Bot**
label, judged from the posts loaded there. It needs at least 8 posts.

### People who react (desktop app, your account)

Counted from your notifications for the last 90 days: favourites, boosts,
quotes, replies and mentions.

| Stat        | How it is calculated                                                |
| ----------- | ------------------------------------------------------------------- |
| People      | Different accounts that reacted                                     |
| Servers     | Different servers those accounts are on                             |
| Returning   | People who reacted in two or more of the last three calendar months |
| Top 5 share | Share of all reactions from the five most active people             |

On the web, after **Refine reach**, **Different boosters** shows how many
different people boosted the threads in the sample, and on how many servers.

## Post analytics

Open **More tools → Post analytics** on any Mastodon post. The page reads the
post and its conversation (two requests). **Replies** is the server's count.
**Visible here** is the number of replies by other people that your server
shows.

In the desktop app, the page also shows when the boosts and favourites of your
own posts arrived. This comes from your notifications. Notifications collected
before this feature existed are not linked to a post.

## Desktop app history

The desktop app keeps your posts in a local archive. Each time you open
analytics, it reads new posts and re-reads the last 14 days so the counts stay
current. It reads at most 10 pages, one a second. If it stops early, it
continues from the same place next time.

- **Last 30 days vs the 30 before** adds up the threads started in each window.
- **By month** covers the last 12 months. Months the archive only partly covers
  are marked.
- **Followers** records your follower count once a day and counts new follows
  from your follow notifications. Servers do not report unfollows.

## Feed analytics

Hashtag, list and Home analytics describe the sampled posts. Every section
says what it counts. **Top 5 authors' share** is the share of the sampled posts
written by the five most frequent authors. **No engagement** is the share of
posts with no favourites, boosts or replies that your server has seen.
