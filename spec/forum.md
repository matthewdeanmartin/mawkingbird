# Forum: find the people talking to each other

Status: specified · 2026-10-27. Sprint plan:
[forum roadmap](../sprint/forum-roadmap-2026-10.md). Follows the mode pattern
in [top_level_menu.md](top_level_menu.md) (Video, Radio).

## Problem

A timeline shows posts, not conversations. The discussions in it are spread
across replies whose roots you never see, threads that started on servers your
feed only partly knows about, and quiet back-and-forths that never trend.
Mastodon Is My Blog (MIMB, `../mastodon_is_my_blog`, `/#/forum`) solves this
with a 1 GB local cache: `routes/forum.py` and `duck.forum_thread_summaries`
group every cached post by `root_id` and hand the UI ready-made discussions,
filters and facets. Its client-only "lite" forum (`web/src/lite/lite-forums.ts`)
only groups what is already loaded, and never fetches a missing root or
reply, so most of what it shows is partial. That makes it too thin.

Mawkingbird has no cache. It must **start from a feed, sample it, and spend
API calls to grow candidate posts into whole discussions**, as Algo and feed
analytics already do: a small default budget and an explicit "spend more".

## Owner decisions (2026-10-27)

| Topic           | Decision                                                                                                                                                                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape           | A fifth app mode, **Forum**, with its own top-line menu, like Video and Radio.                                                                                                                                                                                                                                        |
| Top menu        | Filters become tabs: `Home \| Talk  Asked  Friends  Mine  Joined \| [switcher]`. Recent / Popular is a sort inside each tab.                                                                                                                                                                                          |
| Sources (v1)    | Home timeline, a list, a hashtag, and **Me** (my own posts plus mention notifications).                                                                                                                                                                                                                               |
| Starting budget | About 5–10 API calls. The reader can ask for more, in steps.                                                                                                                                                                                                                                                          |
| Root hunt       | Walk back to the root. When my server's ancestors stop short of the real root, ask my server to resolve it, then try the origin server's public context, all within the budget. If that still fails, mark it **partial**. Revised in sprint 2 to the origin server only (see The scan, step 5); pending owner review. |
| Layout          | Facets in the left rail; discussions in the center (close to today's thread view); a new **Members** widget in the right rail ("who is in this discussion") in place of ads and server cards.                                                                                                                         |
| Persistence     | Session only for v1: in memory, lost on reload. **No new storage keys.** An IndexedDB cache is a later candidate.                                                                                                                                                                                                     |
| Budget ceiling  | **50 calls per scan**, hard. Even that is a lot.                                                                                                                                                                                                                                                                      |
| Interrupt       | Prioritised spending only makes sense with a **Stop** button. Stopping keeps and shows everything found so far.                                                                                                                                                                                                       |
| Not discussions | Tweet storms (self-reply monologues) and lone posts, even ones asking a question, are not discussions.                                                                                                                                                                                                                |
| Facets          | **No uncommon or topic words.** A short browser function cannot stand in for spaCy.                                                                                                                                                                                                                                   |
| Members actions | **Follow everyone** and **add everyone to a list** are in scope (the existing `bulk-actions` flow).                                                                                                                                                                                                                   |
| Anonymous       | Out of scope; the experience would be rough.                                                                                                                                                                                                                                                                          |

## Vocabulary

- **Discussion**: a root post plus its replies, containing at least 2 posts
  by at least 2 distinct accounts. This is MIMB's `HAVING COUNT(*) >= 2 AND
COUNT(DISTINCT author_acct) >= 2`. Self-reply threads (monologues, Radio
  playlists) and lone posts, even ones with a `?`, are excluded. The Asked
  tab therefore lists only discussions whose root asks a question.
- **Root**: the post with no `in_reply_to_id`. A discussion is keyed by the
  root's **`uri`**, not its id, because ids are per server and the root hunt
  may meet the same post under several ids.
- **Partial**: the root, or part of the reply tree, could not be fetched. Show
  it with a badge, never hide it. This is MIMB's `root_is_partial`.
- **Scan**: one budgeted run over a source. **Scan deeper** continues the same
  scan from its cursors; it does not restart.

## Menu

```
forum: Home | Talk  Asked  Friends  Mine  Joined | [Fedi ▾]
```

| Tab     | Route                   | Filter (MIMB `top_filter`)                              |
| ------- | ----------------------- | ------------------------------------------------------- |
| Talk    | `/forum`                | every discussion (`recent` / `popular` by sort)         |
| Asked   | `/forum?filter=asked`   | `questions`: the root asks a human question             |
| Friends | `/forum?filter=friends` | `friends_started`: I follow the root's author           |
| Mine    | `/forum?filter=mine`    | `mine`: I wrote the root                                |
| Joined  | `/forum?filter=joined`  | `participating`: I replied, but someone else started it |

- Sort: `?sort=recent` (the default, by latest activity) or `?sort=popular`.
  Popular follows MIMB: replies from accounts I follow, then total replies,
  then latest activity.
- Source: `?source=home | list:<id> | tag:<name> | me`, which makes it
  shareable and restores it on reload, while the results themselves are not
  restored.
- A discussion opens at `/forum/d/<rootId>`. `rootId` is any id the thread
  page already accepts: a local id, or its remote public-post reference when
  only the origin server had the root.
- `modeForUrl`: `/forum` and `/forum/…` → `forum`. The mode switcher gains a
  Forum entry. Icons must be unique per meaning (`mode-nav.spec.ts`).
- Labels follow the short-label rule: one short word each.
- Mine and Joined require sign-in. For v1 the whole mode requires a Mastodon
  token (see Out of scope).

## The scan

A scan is a pipeline. Every network request goes through a single metered
`budget()` (the `algo-feed.ts` `BudgetFetch` pattern), and the page shows
calls used out of calls allowed.

1. **Sample** (1 call per page). Page the source backwards with `max_id` at
   40 posts per page. Sources:
   - Home: `api.homeTimeline` (the server timeline, not the merged synthetic
     Home, which can't be paged; see `feed-sample.ts`).
   - List: `api.listTimeline`. Hashtag: the tag timeline.
   - Me: `getAccountStatuses(me, { exclude_reblogs })` interleaved with
     `notifications` filtered to `mention`. This is the cheap way to fill
     Mine and Joined, which a Home sample mostly misses.
2. **Candidates** (0 calls). Unwrap reblogs. A post is a candidate when it
   has `in_reply_to_id` or `replies_count ≥ 1`. Group what is already known
   locally (the `buildLiteThreads` rule from MIMB lite), so that two replies
   to the same root become one candidate.
3. **Rank candidates** (0 calls). Spend calls on the most promising
   candidates first. Score them in order: my involvement, then friends
   involved, then reported `replies_count`, then a question, then recency. A
   candidate already resolved to a known discussion key costs nothing.
4. **Find the root** (1 call). `getContext(candidate)`. If `ancestors[0]` has
   no `in_reply_to_id`, it is the root. If the candidate has no parent, it is
   its own root, and this step costs nothing.
5. **Widen** (1 call, a discussion whose anchor lives on another server).
   Ask the anchor's own server for its public context
   (`anonymousPublic.getContext`, unauthenticated). Replies are delivered to
   the author's server, so it holds replies mine never received. It also
   holds the parent mine never fetched, which matters because Mastodon shows
   such a reply as `in_reply_to_id: null`: a gap my server cannot even report.
   Widening goes first to known gaps (partial), then to the biggest shortfall
   between the anchor's `replies_count` and the replies seen, then to anchors
   that start with a mention. One slot per wave goes to widening while
   candidates remain. A refusal (signed fetch, timeout) leaves the discussion
   as it was. Partial means no server we asked could reach further.
   (2026-10-27: this replaces "resolve on my server, then origin". Resolving
   costs 2 calls and cannot find a parent that my server reports as a root.)
6. **Load the tree**. The probe of a root, or the widening of an anchor,
   returns its whole subtree (`treeLoaded`). Context on a reply returns only
   that reply's own subtree. A discussion whose tree was not loaded is loaded
   by the thread page when it is opened, outside the scan budget, like
   opening any post.
7. **Qualify** (0 calls). Apply the 2-posts / 2-people rule, dedupe by root
   `uri` (my server's copy wins; replies are re-pointed at the kept copy),
   match people by profile URL (account ids are per server), merge any posts
   that newly join, and compute derived fields:
   question, hashtags, root instance, language, participants with post
   counts, friend reply count, me as author or participant, and latest
   activity.

### Budget

- **First scan: 10 calls.** At the default that is 2 sample pages (80 posts)
  and 8 root, gap or tree calls. Later pages are fetched only once the
  candidates run out.
- **Scan deeper**: `+10` or `+25`, capped by the ceiling. Each step continues
  from where the last one stopped.
- **Hard ceiling: 50 calls per scan** (owner, 2026-10-27). That also bounds
  paging, so a feed that pages forever can't burn the budget.
- **Stop is mandatory.** Prioritised spending is only worth it if the
  impatient can interrupt. Stop cancels any requests in flight and keeps and
  shows every discussion found so far. A 429 stops the scan the same way (the
  existing `rate-limit.interceptor` applies). At most 3 requests are in
  flight. Results appear progressively, and the list never reorders under the
  reader's pointer: new discussions are appended with an "N new" pill to
  reveal them.
- Follow state for Friends and Popular comes from `/accounts/relationships`
  on the participants of found discussions (starters first, 40 ids a call),
  with one call per step reserved for it. That is cheaper than paging the
  whole following list the way Algo does.
- Provenance line: "From Home · 120 posts · 18 discussions · 34 calls".

## Layout

### Center: the discussion list, then the discussion

- Header: a source picker (Home / List ▾ / #tag / Me), a sort toggle, the
  provenance line, and Scan deeper / Stop.
- Each card shows: root author and instance, a root excerpt (with the
  content warning respected), a **?** badge for questions, a partial badge,
  avatars of up to 5 participants (friends first), "3 friends replied ·
  12 replies · 6 people", and latest activity. Activating the card opens the
  discussion.
- Discussion view (`/forum/d/<rootId>`): the unchanged thread page, in
  Forum mode. When the scan holds the whole tree, it is handed over in
  reading order through `ThreadPreload` (no request, and replies from other
  servers included). Otherwise the thread page loads it as usual. Forum adds
  only a back link to the list (query and scroll restored) and a notice when
  the root could not be reached.
- Empty and thin states explain what was scanned and offer Scan deeper.
  Showing zero discussions after 10 calls is normal, not an error.

### Left rail: facets

Ported from MIMB, with the same semantics: counts are computed over the
current tab's discussions **before** facet choices (a stable denominator),
choices combine with AND across facet types and OR within a type, and each
facet shows its top 20. MIMB's uncommon-words facet is **not** ported: it
depends on spaCy, and nothing short enough to run in the browser can stand in
for it (owner, 2026-10-27).

| Facet         | Source                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Hashtags      | Union of `status.tags` across the discussion (fallback: hashtag links in the content, as in lite). |
| Root instance | Domain of the root author's `acct`.                                                                |
| Language      | The root's declared language, as a base code (`en-GB` → `en`); nothing is detected.                |
| People        | Set by choosing a member in the right rail: discussions that person is in.                         |

Choices live in the URL (`?tag=…&instance=…&lang=…&person=…`), so
Back works and a view can be shared.

### Right rail: Members

"Who is in this discussion" replaces the default right rail in Forum mode.
Ads, house endorsements, the Just My Server card and the server card do not
appear there. They remain everywhere else.

- **In a discussion**: every participant, with avatar, display name and
  handle, and badges for _Started it_, _You_ and _Following_. It also shows
  each participant's post count and last post time, with a follow button
  (the existing `follow-button`). Sort by post count, with the starter
  first.
- **In the list**: "Most active", the top participants across the visible
  discussions, with how many discussions each person is in.
- **Follow everyone** and **Add everyone to a list**, through the existing
  `bulk-actions` / `bulk-follow-confirmation` flow (with confirmation and
  progress, skipping you and accounts already followed).
- Choosing a member toggles the **People** facet, which narrows the list to
  discussions that member is in. A separate link opens their profile.
- Hidden accounts (mutes, blocks, `local-moderation`) are dropped from
  discussions, members and facets alike (MIMB drops muted root authors).

### Rail outlet

Today the rails are global (`<app-left-rail/>`, `<app-right-rail/>` in
`shell.html`). Add a `RailOutlet` service like `radio-outlet.ts`: lazy
`left` and `right` component references that the shell renders in place of
the default rail while they are set. Forum's route sets them and clears them
on leave. The facet and member components stay in the lazy Forum chunk,
outside the startup bundle (`npm run build:mockingbird` size report). The
service is generic, but in v1 only Forum uses it.

Below each rail's breakpoint (right at 1240px, left at 1000px) that rail
disappears, and the page offers the same component in a disclosure above its
content: **Filters** on the list, **People** on the list and beside a
discussion.

## Code layout

```
ui/src/app/forum/
  discussion.ts        pure: grouping, qualifying, keys, derived fields, filters, sorts
  discussion-facets.ts pure: facet counts, AND/OR selection
  question.ts          pure: port of MIMB has_human_question (strip tags and URLs)
  forum-scan.ts        budgeted pipeline (sample → candidates → root → gap → tree)
  forum-sources.ts     Home / List / Tag / Me samplers on the PagedFeedSource shape
ui/src/app/pages/forum/  list page, discussion page, facets rail, members rail
ui/src/app/pages/read/thread-preload.ts  one-shot hand-off read by ThreadLoader
```

`ForumScan` is provided on the lazy `forum` parent route, so it lives for the
session while staying out of root. Signals throughout, following `algo-feed.ts`.

## Out of scope for v1 (candidates later)

- **IndexedDB cache** of discussion summaries per account, so each scan adds
  to what is already known, which is closer to MIMB. This needs a registered
  storage key, caps and eviction, and the key names are permanent.
- **Anonymous** use. This is dropped rather than deferred: without a home
  server, the root hunt and the Friends, Mine and Joined tabs fall apart.
- **Bluesky** threads (`app.bsky.feed.getPostThread`): a different graph.
- Notifications that a watched discussion has moved. Saved sources.

## Open questions

1. Where should "Forum" sit in the mode switcher's order, and does Fedi's
   switcher suggest Forum or keep suggesting RSS? (Default: list order
   mastodon, rss, video, radio, forum; the suggestion is unchanged.)
