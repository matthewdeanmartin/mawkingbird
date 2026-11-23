# Audience analytics (November 2026)

Status: Sprints 1–2 implemented locally 2026-11-23 (uncommitted). The owner
pushes and tests by hand before Sprint 3.

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
