# Audience analytics (November 2026)

Status: Sprints 1–3 pushed. Sprints 4–6 implemented locally 2026-11-23
(uncommitted, web and native).

Owner asks: an interaction decay curve ("when has everyone seen it?") and
follower analytics for creators (best time to post, language split, active vs
inactive, and other audience composition).

## Owner decisions (2026-11-23)

- **Decay source: notifications.** Mastodon puts no timestamp on likes or
  boosts. Only the signed-in account's own notifications carry one, so the
  decay curve is for **your own account only**. It covers as far back as the
  server keeps notifications, and the panel says how much it covered.
- **Decay shape: cumulative %.** For each post, the share of its interactions
  that had arrived by hour X. The chart shows the median across posts. Reads as
  "90% of likes arrive within 6 hours", and quiet posts weigh the same as viral
  ones.
- **Decay scope: the last 40 originals.** Click to run, with a stop button,
  because paging notifications back to the oldest post costs one request per
  80 notifications.
- **Best time and language come from the people who interact.** A follower
  account has no language and no active hours. Timed notifications are free
  and describe your _engaged_ audience, so the label says "people who
  interact", not "followers".
- **Composition: all four.** Server split, account-size tiers, account age and
  posting cadence, and mutuals and overlap. Everything comes from the follower
  and following lists the existing effective-audience scan already pages, so
  **one scan feeds both panels**. Web runs to completion by default; stopping
  early keeps a sample and labels it (newest followers first).
- **Placement: your own analytics only** for decay and best time.
  Composition rides on the existing scan, which already runs on any account's
  analytics.

## Sprint 1 — Interaction decay

- `accounts/interaction-decay.ts` (pure):
  - Classifies notifications: `favourite` = like, `reblog` = boost, `mention`
    whose status replies to one of the target posts = reply. Quotes and
    anything else are ignored.
  - Per post: the delay from the post to each interaction, by kind.
  - The curve: checkpoints at 15 m, 30 m, 1 h, 2 h, 4 h, 8 h, 12 h, 24 h, 48 h,
    72 h and 7 d. At each checkpoint, the median across posts of
    (interactions by then ÷ interactions seen). Only posts with at least one
    interaction of that kind count. A post contributes to a checkpoint only
    when it is at least that old (right-censoring). Four series: likes,
    boosts, replies and all.
  - Headline per series: the median time-to-50% and time-to-90%.
  - Coverage: interactions seen against the posts' own counters
    (`favourites_count + reblogs_count + replies_count`). The counters include
    people you muted and filtered notifications, so coverage below 100% is
    normal and is stated rather than hidden.
- `accounts/interaction-decay-scan.ts` (root service, like `AudienceScan`):
  pages `/api/v1/notifications?types[]=favourite&types[]=reblog&types[]=mention`
  until the oldest target post is passed, the server runs out, the 60-page cap
  is hit, or the person stops. It keeps only the fields the model needs.
- `accounts/interaction-decay-panel/`: shown on the analytics page for the
  signed-in account (Mastodon, not Bluesky, not anonymous). Before running it
  states the cost. It has a progress bar and a Stop button. The result is a
  4-line SVG chart with a legend, direct labels and a hover crosshair with a
  tooltip, followed by a table view, the headline tiles and (?) help for each
  figure. Posts younger than 7 days are left out ("still collecting").
- Specs for the model and the scan's stop conditions.

## Sprint 2 — Audience composition

- `accounts/audience-composition.ts` (pure, mergeable per page like
  `tallyAudience`):
  - **Servers**: count per host (`acct` domain, or the home host when there
    is no domain), your own server's share, the top 8 with the rest as Other,
    and the number of distinct servers.
  - **Size tiers** by the account's own `followers_count`: under 50, 50–499,
    500–4,999 and 5,000+. Plus bot (`bot`) and group (`group`) accounts.
  - **Account age** by `created_at`: under 90 days, 90 days–1 year, 1–3 years,
    3+ years.
  - **Cadence** by lifetime posts per day (reusing `lifetimePostsPerDay`):
    under 0.1, 0.1–1, 1–5, 5+, and unknown.
- `AudienceScan` tallies composition alongside the existing tally, page by
  page, and keeps the id set per side (it already builds it for dedupe) so
  that, once both sides are read, **mutuals** = followers ∩ following,
  "follow you, you don't follow back" and "you follow, they don't follow
  back". Mutual counts appear only when both sides were read completely,
  because a partial intersection undercounts.
- The analytics audience section gains a composition block per side: server
  bars, tier, age and cadence bars, and mutual tiles, all with (?) help. Each
  is labelled as a sample when the scan was stopped early.

## Sprint 3 — Engaged audience: best time and language (after owner test)

- Reuse the decay scan's notification pages (or run its own on click). A 7×24
  heatmap in local time of when people interact, with each person counted at
  most once per slot so one fan can't dominate. Shown next to "when you
  posted", because people react to posts, so reaction hours lean toward your
  posting hours. The (?) says this.
- Language: the detected language of replies (`detectLanguageMix`, strong
  signal), plus the bio language of the people who reacted (weak, labelled).
- Native: the archive's notification history, when present, removes the
  server-retention limit.

## Checks

Lightweight between sprints: `make test-changed`, `check:i18n`, lint,
prettier. The owner runs the full gates on GHA.

## Progress

### Sprint 1: interaction decay (2026-11-23)

- `accounts/interaction-decay.ts`, `interaction-decay-scan.ts` and
  `interaction-decay-panel/` as planned. The panel sits above the effective
  audience section and shows only when the signed-in Mastodon account views
  its own analytics (`isOwnMastodonAccount`). Targets come from the page's
  already-loaded sample, so the 7-day-old posts must be in the sample. A
  daily poster's last 100 posts reach back far enough.
- When the walk doesn't get back past the oldest post (server end, page cap
  or Stop), posts older than the oldest notification read are **left out**
  and counted ("N older posts left out"). They would otherwise show only
  their late interactions.
- Chart: validated palette slots 1–3 (light and dark), with All in text ink;
  a legend, end labels, a pointer crosshair with a tooltip, and a table view
  with half and 90% rows.
- `Account.group` added to the model (optional).

### Sprint 6: new people to meet (2026-11-23)

Owner ask: find _humans_ among recent followers you don't follow, on honest
signals; the bot flag alone is a lie for malicious bots.

- `accounts/new-people.ts` (pure): three separate verdicts with reasons, no
  score. **Human**: vouched (2+ people you follow follow them _and_ they talk
  with 3+ people _and_ get replies), likely, not enough evidence, says it's
  automated, group. Behavior alone stops at likely; a clockwork poster never
  passes; bio, avatar and follower counts give nothing; the bot flag is
  believed only when on. **Lively**: talking (3+ people in 30 days), posting,
  quiet, not enough evidence. **Spam**: warning, worth a look, nothing found,
  not enough evidence. Warnings: 500+ follows at 50+ a day; 1,000+ follows
  with under a tenth following back and no reply to you; 30%+ repeated text;
  mostly bare links to one unverified site; naming people without replying.
  Arriving with 3+ other young accounts from one server is only a caution.
- `accounts/new-people-scan.ts`: followers page, relationships (via
  `FollowState`), and the new batched `Api.familiarFollowersOf`: about 5
  requests for 80 followers. Posts are read on request, 20 people a click, one
  request each. Unknown relationships are left out. "Replied before following"
  uses the notification read when it has run.
- "Check their own server" appears only with Settings → Privacy → Fetch from
  the original server on, because it contacts a server the reader didn't pick.
- `accounts/new-people-panel/`: on your own Followers tab, linked from own
  analytics.
- Known limits: follow counts and join dates of remote accounts are as their
  server reports; "others reply to them" is the reply count on their posts,
  not a read of each thread; name similarity in batches was not built.

### Sprint 5: native timed reactions (2026-11-23)

- The archive already stored timed notifications. New command
  `archive_reactions` returns them (≤ 365 days, ≤ 20,000), with each person and
  post once and trimmed. No migration.
- **Collector gap fixed.** It refreshed only the newest two pages per session,
  so more than 160 notifications while the app was closed left a permanent
  hole. It now reads until it meets `notifications:newest` (a new
  `archive_cursor` row), up to 20 pages; if it can't, the backfill restarts
  there. Existing installs re-read their notification history once, which
  also fills the post links missing from before migration 6.
- `archive_reactions` returns only the unbroken stretch and how far back it
  goes; until the collector has connected, nothing, and the client reads the
  server as on the web.
- `InteractionDecayScan` uses the archive in the native app: up to 10 s for a
  check for new notifications, then the archive. All four panels share it.

### Sprint 4: discovery rate and top boosters (2026-11-23)

- **Paging fix:** the notification read treated any page under 80 as the end.
  Now only a page with nothing new is; repeats are counted once.
- `accounts/reaction-log.ts` (pure), from the same read plus `follow`
  notifications. Discovery = a reaction from someone who doesn't follow you,
  or who followed later. Overall, by kind, by post (5+ reactions) and hashtag
  (also 2+ posts).
- `accounts/discovery-check.ts`: who follows you, by relationships in batches
  of 40 (Mastodon answers only 40), up to 1,000 people, with Stop.
- `accounts/discovery-panel/`, `accounts/top-boosters-panel/`.

**Rendered for the first time** (temporary story, deleted): all six panels at
640 px light and dark and 375 px. Fixed: decay chart text about 5 px on phones
(now drawn at its real width), bold tile subtext, "1 older posts", "1 automated
accounts".

Checks run (lightweight, Sprints 4–6): `make test-changed`, `check:i18n`,
eslint, prettier, `design:inventory-check`, `check:dead-code`, deep-link audit,
`build:mockingbird`; native `cargo test` (113 passed), clippy (0 warnings),
fmt, frontend build. **Not run:** the full gates, design-verify, native smoke
tests, `make deploy-source`, and any real account or real archive.

### Sprint 3: engaged audience (2026-11-23)

- `accounts/engaged-audience.ts`: `EngagedAccumulator` takes every like,
  boost and mention the decay scan reads (not just those on target posts).
  It keeps a set of weekday-hour slots per person, a set of days per person,
  up to 500 mention texts and one bio per person (up to 2,000). The summary
  has the distinct people per slot (7×24, local time), the top 3 slots,
  people per weekday, and the reply and bio language mix
  (`detectLanguageMix`, min share 2%).
- `InteractionDecayScan` feeds it and stores `engaged` on the state. With no
  posts old enough for a decay curve, it now reads the last 30 days
  (`FALLBACK_WINDOW_MS`) instead of refusing. The decay panel stays quiet in
  that case.
- `accounts/engaged-audience-panel/`, under the decay panel, on own analytics
  only. A run from either panel fills both. It shows People who interact,
  Reactions read, Busiest times (in the viewer's time zone, named), a
  "People reacting" weekday-by-hour grid beside "Your posts in the same
  period" (the posting-hour bias, made visible), people by weekday, and reply
  and bio languages, with the bio caveat. Weekday, hour and language names
  come from `Intl` in the active UI language. The grid uses one hue
  (validated blue) in 4 steps.
- Native: not changed; its panels read the server like web. Correction
  (2026-11-23): an earlier note here said the archive has no per-event times.
  It does. `archive_interaction` keeps person, kind, `occurred_at` and (since
  migration 6) `status_remote_id`, and `archive_collect_notifications`
  backfills it. `archive_engagers` only aggregates by month. What is missing is
  a command that returns the timed rows, and the panels using it.

Checks run (lightweight): `make test-changed` (14 affected spec files, 132
tests pass), `check:i18n`, eslint on the touched files, prettier,
`design:inventory-check` (ledger entry plus consolidation note),
`check:dead-code`, and `build:mockingbird`, which succeeds with the same 4
NG8102 and NG8107 warnings in existing files. **Not run:** the full gates,
native, and a real-account check.

### Sprint 2: audience composition (2026-11-23)

- `accounts/audience-composition.ts` (pure, merged per page) and
  `audience-composition-panel/`, shown under the effective-audience tiles
  after a scan: servers (top 8 + Other, distinct count, share on the
  analyzed account's server), account size, bots and groups, account age,
  and cadence. Followers come first.
- `AudienceScan` state gains `composition`, `overlap` and `accountId`. Mutuals
  appear only when both sides were read in full.
- **Behaviour fix:** the analytics page now shows scan results only for the
  account that was scanned. Before, the shared service showed the last scan
  on every account's analytics.

Checks run (lightweight): `make test-changed` (925 files pass; the model
change touched everything), `check:i18n`, eslint on the touched files,
prettier, `design:inventory-check` (two new ledger entries plus a
consolidation note), and `build:mockingbird`, which succeeds. Its 4 NG8102
and NG8107 template warnings are in existing files. **Not run:** the full
gates, native, and a real-account check.

## Proposed next: creator analytics (2026-11-23, not yet agreed)

Ideas for people who post for a living (podcasters, YouTubers, journalists,
artists). Ranked by value against cost. Each is limited to what Mastodon
exposes.

1. **Discovery rate.** The share of reactions from people who _don't_ follow
   you, per post and per hashtag. Engager ids (notifications) against the
   follower id set (audience scan). Free once both have run.
2. **Follows after a post.** `follow` notifications are timed, so new
   followers can be attributed to the post they followed after (within 24 h).
   One more notification type in the same read.
3. **Amplifiers.** Top boosters by audience (booster-lookup), returning
   boosters, and the boosts that reached a new server.
4. **What works, by format.** Median engagement and decay for image, video,
   audio, link, thread, poll and text posts, and for links to your own
   domains (YouTube, podcast host, site). Free from the sample.
5. **Launch report.** For one post (an episode, video or article): its decay
   against your typical curve, reach, amplifiers, discovery rate and follows
   gained.
6. **Clicks.** Tracked links (Plus) are the only real click-through number.
   Clicks per post, per platform, and clicks against likes.
7. **Audience interests.** Keywords and link hosts from engagers' bios and
   profile fields (Patreon, Ko-fi, YouTube, newsrooms, "illustrator").
8. **Evergreen posts.** Old posts still collecting interactions, from
   notifications on posts outside the recent sample. They are candidates to
   share again.
9. **Media-kit card.** An exportable summary for sponsors and editors:
   followers, effective followers, engaged people, median reach, top
   servers, languages and best times.
10. **Native: use the notification archive.** Timed notifications are already
    stored (`archive_interaction`). Add a read command and feed decay, best
    times and discovery rate from it. Not a new archive.
11. **Journalists: pickup.** Quote notifications (Mastodon 4.5) and mentions
    from large or institutional accounts, plus `/api/v1/trends/links` on major
    servers to see whether a story is trending.
