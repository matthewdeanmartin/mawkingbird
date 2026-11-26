# Explore: a mode for crafting your feed (November 2026)

Status: Sprints 1–4 implemented · 2026-11-26 (1–2 pushed for testing, 3–4
uncommitted); the Sprint 5 side quest (the `…` menu) remains. Run two at a time
with light checks between them, then a stop for the owner to push and test
(two-sprint cadence). Manual plan:
[test_plans/explore-2026-11.md](../test_plans/explore-2026-11.md).

### As built (Sprints 3–4)

- **Tags** (`/explore/tags`, `discovery/explore-tags`): suggestions on top, in
  three groups (You post with these: `featured_tags/suggestions`, Mastodon only;
  Like the ones you follow: one tag timeline over up to eight followed tags,
  ranked by co-occurrence; Trending on your server), de-duplicated and with
  followed tags left out, eight per group, each loading and failing on its own.
  Below them the page embeds the Feeds hub's **`Lists` component itself**,
  filtered by the route's `only: 'tags'` data, rather than extracting its tag
  block. Feeds is unchanged and `lists.spec.ts` untouched; `Lists` gained only a
  public `refreshTags()`, called after a suggestion is followed. "Tags from your
  starter kits" became a link to Communities: kit data carries no hashtags, and
  the Feed Builder topic data is lazy per topic.
- **People** (`/explore/people`, `discovery/explore-people`): `/search` itself
  under route data `peopleOnly`, which hides the type tabs and ignores `?type=`
  and `#tag` guessing (plain `/search` is unchanged), then server suggestions
  (signed-in Mastodon) and four Find Friends rows (directory, offsite,
  contacts, import). Misskey primaries still get `MisskeySearch`. The Bluesky
  panel keeps its own posts/people choice.
- **Kits**: `/explore/kits` stays the bundled kits page, which now also links
  Communities and Starter collections, on `/bundled-starter-kits` too.
- **Drafts card** (`publishing/drafts/drafts-rail-card.ts`): rail widget
  `drafts`, Fedi and Explore only, under `@defer (on idle)`. Up to three
  newest drafts (a local draft opens in the Home composer, other kinds open
  `/drafts`) and All drafts. Server sources load once per account per session.
- **More ways in**: links in the left rail's who-to-follow (People) and trends
  (Tags) cards, the Feeds tag section (not on Explore's own Tags page), Find
  Friends (Open Explore), and Home's feed analytics (Run a feed checkup →
  `/feed-doctor`). The discovery-gated ones hide while the window is closed.

### As built (Sprints 1–2)

- Explore sits **third** in the switcher, after Fedi and Blog: Blog keeps second
  place by an earlier decision (`spec/blog-mode.md`).
- `/explore/people` is `Search` with route data `defaultType: 'accounts'`; the
  reader can still switch type. Misskey primaries get `MisskeySearch`.
- The crafting checks run at **both** `/feed-doctor` and `/explore/feed`
  (same page; `data.explore` only changes the title to "Feed checkup").
  With them, verdicts sort worst first.
- **"Never replies" needs "mostly links" too.** Home hides replies to people
  the reader doesn't follow, so a chatty human can look silent in a Home
  sample. The signal is: at least 8 of their posts, none replying to others,
  80% or more carrying a link or link card. This is the RSS-relay pattern.
- **Bug fixed:** signed in, Feed Doctor's Unfollow only edited the browser's
  Anonymous follow list and said "Unfollowed." It now unfollows on the server
  through `FollowState`, after resolving the relationship (toggling an unknown
  relationship would _follow_). An account you don't follow is explained, not
  toggled. Unfollow is hidden for RSS and other `provider:` ids.
- Followed-hashtag count: one `GET /api/v1/followed_tags` for signed-in
  Mastodon (already used by Feeds; Native reads pass through). Anonymous uses
  `AnonymousTags`; Bluesky and Misskey have no tags line.

## Why

The pages that help people find things to read already exist, but they are
scattered. Today you reach them through the side rails (distracting, and gone on
phones and in zen mode), through `/find-friends`, or through the Feeds hub, where
followed hashtags sit among about 20 kinds of feed. Nobody would guess that tags
are a discovery method from a page called **Feeds**.

Explore is a new app mode. Like Forum and Unbird, it is offered in the mode
switcher's dropdown. It gathers those pages into four tabs aimed at one job:
**building a Home feed worth reading**. Then it nudges people to write, by
showing their drafts on the right rail.

```
explore:  Home | Feed  Kits  People  Tags | [Fedi ▾]
```

## Owner decisions (2026-11-26)

| Topic           | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape           | A new `AppMode`, **explore**, in the switcher like Forum and Unbird. Same rules as [top_level_menu.md](../top_level_menu.md): Home first (and back to Fedi), then the tabs, then the switcher; one meaning per icon. Four tabs.                                                                                                                                                                                                                                                                   |
| Labels          | **Feed · Kits · People · Tags**. Explore Kits must not reuse RSS Kits' icon (different meaning).                                                                                                                                                                                                                                                                                                                                                                                                  |
| Additive        | **More ways in, none taken away.** Explore is an experiment and may not work. Every existing path keeps working unchanged: the rails, `/find-friends`, the Feeds hub's tags, `/feed-doctor`, the command bar's Feed Doctor link and its feed CTA card, and `/search`. Features that are hard to find _should_ have several routes to them. Explore adds one more, and Sprint 4 adds links from the old places into it.                                                                            |
| Feed tab        | **Grow Feed Doctor** rather than building a new page. As a standalone page it mostly failed. The bet is that a crafting context, sitting next to the tools that fix what it finds, gives it a reason to be opened. It keeps its flooding, ending and mixing verdicts and gains _following enough people?_, _following enough tags?_ and _automated posts_. Everything stays focused on crafting the feed; the esoteric `AccountAnalytics` tiles are not brought in. `/feed-doctor` keeps working. |
| Automated posts | An account counts as automated when it has (a) its own **bot setting** on, (b) the existing **bot-like** fixed-schedule rhythm (`postingRhythm`), or (c) **never replies to anyone** across a meaningful sample. (c) catches RSS cross-posters: they cannot reply, because they only relay a feed. Fixes are per-account **Mute** and **Unfollow**, like the flooding verdict.                                                                                                                    |
| Wellness        | **Gate the whole mode.** Explore is discovery: while the Wellness discovery window is closed, Explore's tabs show the discovery-closed page. Routes live under `/explore/*`, which `isDiscoveryPath` already treats as discovery.                                                                                                                                                                                                                                                                 |
| Who             | **Everyone, with each tab degrading on its own terms.** Anonymous uses browser-local follows and tags (Feed Doctor already reads them). Bluesky has no followed hashtags, so its Tags tab offers what does exist there or says so plainly. Misskey searches its own server.                                                                                                                                                                                                                       |
| Tags tab        | **Find and manage.** Suggestions with peek-and-follow on top; followed tags, tag bundles and tags.pub below. **Feeds keeps its tag section** (additive), through a shared component, not a copy of the code.                                                                                                                                                                                                                                                                                      |
| Find Friends    | **Left alone.** `/find-friends` stays as it is. Explore's tabs get their own pages.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Drafts rail     | A right-rail **Drafts** widget, shown in **Fedi and Explore** modes only and only when drafts exist. Blog has its own Drafts tab; Radio, Video and Unbird stay clean.                                                                                                                                                                                                                                                                                                                             |

### Standing rules that apply here

- **No mass unfollowing** and no exit tools. Every unfollow is one account, one
  button. No "unfollow all bots".
- **No notification features.** The drafts widget is a quiet rail card: no dots,
  badges, toasts or reminders.
- **Twitter, never X**, in copy. English strings only (`// i18n` comments, then
  `npm run i18n:extract` and `check:i18n`); no per-feature locale pass.
- View switchers inside a page use `mb-toolbar` / `mbToolbarButton`, never a row
  of pills.
- **Never edit `native/`.** Every endpoint a tab calls must be in the Native
  lists, or the control is hidden in Native and added to
  `spec/native-transport-gaps.md` (see each sprint's Native note).
- Copy is reader-facing. Rationale stays in code comments.

## Routes

| Tab            | Route             | Built from                                                                                               |
| -------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| Feed (landing) | `/explore/feed`   | `FeedDoctorPage`, grown in Sprint 2. `/feed-doctor` routes to the same component and stays in Fedi mode. |
| Kits           | `/explore/kits`   | `BundledStarterKits`, plus section links (Sprint 4)                                                      |
| People         | `/explore/people` | Account search locked to people (Sprint 4)                                                               |
| Tags           | `/explore/tags`   | Sprint 1: `Lists` with `only: 'tags'`. Sprint 3: the new Tags page.                                      |

- **`/explore` itself is unchanged.** It is the Mastodon-compatible trending
  landing for signed-out visitors (outside the shell), and stays a Fedi page.
  `modeForUrl` maps `/explore/<anything>` to `explore` and leaves exact
  `/explore` as `mastodon`.
- The switcher's Explore entry lands on `/explore/feed`.
- Tabs need dedicated routes because the shared pages (`/search`, `/feeds/tags`)
  would flip the mode back to Fedi on arrival. This is the same pattern as
  `/videos/fedi` reusing Home through route `data`.
- These are in-app pages, not public SEO pages. They are not added to the
  sitemap or server routes, but they do go through the deep-link audit.

---

## Sprint 1: the mode, wired to pages that already exist

Goal: Explore is in the switcher and every tab opens a working page, using the
pages that already exist. Nothing new on screen yet beyond the menu.

- `platform/build/app-mode.ts`: add `'explore'` to `AppMode` and `APP_MODES`
  (right after `mastodon`, the mode people come from). `modeForUrl`:
  `/explore/…` → `explore`; exact `/explore` stays `mastodon`.
- `shell/mode-nav.ts`: `MODE_NAV.explore` (Feed, Kits, People, Tags) and
  `MODE_ENTRIES.explore` (a compass glyph, landing `/explore/feed`), with
  `// i18n` declarations. Four new glyphs; `mode-nav.spec.ts` enforces that an
  icon has one meaning across the app.
- `app.routes.ts`: the four `/explore/*` routes inside the shell, each with
  `discoveryWindowGuard`. `/explore/feed` → `FeedDoctorPage`. `/explore/kits` →
  `BundledStarterKits`. `/explore/people` → `Search` with route data that opens
  the accounts view (or `MisskeySearch` for a Misskey primary, as `/search`
  does). `/explore/tags` → `Lists` with `only: 'tags'`. Routes go above any
  route that could swallow them.
- `shell/rail-widgets.ts`: `RAIL_HIDDEN.explore = DISCOVERY`. In Explore the
  page _is_ the finder, and rail finders would only repeat it.
- Find every place that lists modes (`grep -rn "unbird" ui/src/app`:
  `auth.guard.ts`, `login-destination.ts`, `session-teardown.ts`,
  `focused-apps/open-app.ts`, shell) and add `explore` where it applies.
  Anonymous visitors may open every Explore route.
- Tests: `app-mode.spec.ts` (the `/explore` vs `/explore/x` split),
  `mode-nav.spec.ts` (labels exist, unique icons, four tabs), `rail-widgets.spec.ts`
  (discovery hidden in Explore), a shell/switcher case, the discovery guard on an
  Explore route with the window closed, and a Misskey-primary case for People.
- Native: no new endpoints; these pages already run there. Confirm that the
  switcher entry appears in Native.
- Gates: targeted specs, prettier and `ng lint` on touched files. The deep-link
  audit (`audit_deep_links.py`) because routes changed. Re-audit the design
  inventory (shell markup moves).

## Sprint 2: the Feed tab (Feed Doctor grows up)

Goal: one page that says whether your Home is well built, and puts a fix button
beside every problem. A healthy check still collapses to one line.

New pure verdicts in `feeds/feed-doctor.ts`, each separately tested:

- **`diagnoseFollowing`: too few people.** Uses the follow count
  (`following_count`; Anonymous: browser-local follows; Bluesky: the profile's
  follows) and how far back the Home sample reaches. A sample of N posts that
  covers only minutes means plenty is arriving; one that covers days means the
  feed is thin. The action links to **Kits** and **People**.
- **`diagnoseTags`: few or no followed hashtags.** Says that tags bring in posts
  from people you don't follow yet, and links to **Tags**. Skipped for Bluesky
  (no followed hashtags), with no warning shown.
- **`diagnoseAutomated`: automated accounts in Home.** Per author in the sample:
  the bot flag, the bot-like rhythm (`postingRhythm` over that author's posts),
  and **never replies** (zero replies to others among at least _K_ of their own
  posts). Reports each account's share of the feed, which signals fired, and
  **Mute** and **Unfollow** buttons (one account each). Reuse `BotSignals`
  badges for the "why".
- Existing flooding, ending and mixing verdicts stay. The page orders verdicts
  by severity. Page title and heading: a feed checkup, not "Doctor", once inside
  Explore. `/feed-doctor` keeps its current title.

**Proposed thresholds** (owner to confirm or calibrate; see
`spec/analytics-calibration.md` for how earlier ones were fitted):

| Signal                       | Notice                             | Warn   |
| ---------------------------- | ---------------------------------- | ------ |
| People followed              | < 100                              | < 30   |
| Home sample span (200 posts) | > 12 h                             | > 48 h |
| Followed hashtags            | < 5                                | 0      |
| Never replies                | ≥ 8 own posts in sample, 0 replies |        |
| Automated share of Home      | ≥ 15 %                             | ≥ 30 % |

- Sampling is unchanged: Feed Doctor's existing Home sample, with no per-author
  profile lookups (the bot flag is on `status.account`).
- Tests: a spec for each verdict covering edge cases (a self-reply thread is
  not a reply to others; boosts are attributed to the content author per
  `feedSubject`; Anonymous and Bluesky paths). Page spec: fix buttons call
  mute/unfollow for that one account, and a healthy page collapses.
- Native: mute and unfollow are already in `mastodon_write.rs`. Verify the
  exact paths; anything missing is hidden in Native and logged in the gaps file.
- Manual plan: `test_plans/explore-feed-checkup.md` (a thin account, a
  bot-heavy account, Anonymous, Bluesky).
- **Stop after Sprint 2** for the pair-level checks (`make test-changed`,
  `check:i18n`, `check:dead-code`, deep-link audit, `design:inventory-check`
  with its review). The owner then pushes and tests.

## Sprint 3: the Tags tab

Goal: make hashtags a visible way to find content, and manage them in the same
place.

- Extract the followed-tags block from `feeds/lists` (list, peek box, unfollow,
  bulk import link, tags.pub check, tag bundles) into a shared component. The
  Feeds hub renders it unchanged; `lists.spec.ts` must stay green without edits
  to what it asserts.
- New `discovery/explore-tags` page at `/explore/tags`:
  - **Suggested** (top): tags you post with but don't follow (Mastodon
    `featured_tags/suggestions`), tags similar to ones you follow (reuse
    `similar-hashtags` / `mastodon-similar-hashtags`), the server's trending
    tags, and tags from your starter kits. Each suggestion has a usage
    sparkline where the API gives history, plus **Peek** (opens `/tags/:tag`)
    and **Follow**. Followed tags drop out of suggestions. Sources load
    independently; one failing doesn't blank the others.
  - **Yours** (below): the shared followed-tags component.
  - Sections switch with `mb-toolbar` only if the page needs a switcher at all.
    The default is one scrolling page.
- Anonymous: browser-local tags (`AnonymousTags`); suggestions from trending
  tags and kits only. Bluesky-only: one plain line saying Bluesky has no
  followed hashtags, then links to Bluesky feeds and search. Misskey: the
  hashtag sources Misskey offers, or hide what it lacks.
- Native: check `featured_tags/suggestions`, `followed_tags`,
  `tags/:tag/follow|unfollow` and `trends/tags` against `public_mastodon.rs` and
  `mastodon_write.rs`. Any source that is missing is hidden in Native and logged
  in `native-transport-gaps.md`; the owner extends the Rust list separately.
- Tests: the page spec (each source failing alone, de-duplication against
  followed tags, Anonymous, Bluesky-only), and the shared component spec.
- Manual plan: `test_plans/explore-tags.md`.

## Sprint 4: People, Kits, and drafts on the rail

Goal: finish the two remaining tabs and add the writing nudge.

**People** (`/explore/people`):

- Account search on top, locked to people (no post or tag toggles), for
  Mastodon, Bluesky (`bluesky-search-panel`) and Misskey.
- Under the box, when it's empty: **suggested by your server**
  (`ServerSuggestions`, signed-in Mastodon only), the profile directory,
  offsite directories, and "look for your contacts" / import follows, as
  one-line links. Results reuse `account-result-card` with its follow button
  and bot badges.

**Kits** (`/explore/kits`):

- `BundledStarterKits` with a short header of links: starter packs,
  collections, Communities (the Feed Builder hub), and Bluesky starter packs.
  Each link keeps its own page; nothing is merged. `/find-friends` is not
  touched.

**Drafts rail widget:**

- New `RailWidget` `'drafts'`, `RAIL_ONLY.drafts = ['mastodon', 'explore']`,
  rendered in the right rail only when there is at least one draft.
- Shows the count and up to three most recent drafts (first line, age), each
  linking to resume where the draft lives, plus **All drafts** → `/drafts`.
  Encouraging, one line of copy at most; no nag text.
- Cost: local sources (compose drafts, Write drafts, pastes) render
  immediately. Server sources in `DraftSources` (parked schedules, self-notes)
  load at most once per session, after the page is idle, and are never re-fetched
  on navigation. They are never loaded for Anonymous.
- Hidden with the rails in zen mode and on phones, like every rail widget, so
  nothing depends on it.
- Native: `scheduled_statuses` and the self-scan of the account's own statuses
  are already used by `/drafts`. Confirm they are in the lists.
- Tests: `rail-widgets.spec.ts` (shows only in Fedi and Explore), the widget
  spec (hidden when empty; local drafts with the server failing; the once-per-
  session load), and a People spec for each account kind.
  **More ways in** (links only; nothing old is moved or removed):

- The Feeds hub's tag section gets a one-line "Find more hashtags" link to
  Explore → Tags.
- `/find-friends` gets a short link to Explore. Its rows stay as they are.
- The Fedi left rail's who-to-follow and trends cards get a quiet "More in
  Explore" link to People and Tags.
- Feed Doctor's existing entry points (command bar, feed CTA card) keep going to
  `/feed-doctor`, which is now the grown page. Home's in-feed analytics panel
  links to it.
- Each link is one line, uses existing link styles, and respects the discovery
  window (hidden while it is closed, since its target would be gated).

- Manual plan: `test_plans/explore-people-kits-drafts.md`.
- **Stop after Sprint 4** for the pair-level checks. Full gates go to GitHub
  Actions on the owner's push: `make test`, `npm run build:mockingbird` (the 1 MB
  initial budget; Explore pages stay lazy and out of root imports), SEO
  unchanged, `make design-verify`, and `make test-deep-links-browser` once,
  because routes changed.

---

## Sprint 5 (side quest, after Sprints 1–4): "Even more" and a locked `…` menu

Why: the `…` menu (`shell/shell.html`, `details.more-menu`) is full. New
features don't fit in its height, and other developers have added and removed
rows without asking the owner. (Its comments record about six rows that were
squeezed out: Lists, Tags, Pastes, Links, Feed Doctor, Storage Diagnostics.)

- **Even more** is a new `…` row that opens a dialog (`mb-dialog`, the app's
  existing dialog pattern; Esc closes it and focus comes back to the menu). It is
  also linkable, so it works on phones and can be shared:
  `?dialog=even-more`, or a route if dialogs here are routed. Pick whichever the
  shell's other dialogs already use.
- **Top: lesser-used functions**, moved from `…` into the dialog:
  Observability, Onboarding (the setup wizard) and the Screen share toggle.
  Turning screen share _off_ stays one click from anywhere through the header's
  `app-screen-share-badge`. Turning it on takes two clicks.
- **Below: sections of direct links**, starting small so the owner can judge
  the shape: **Explore** (Feed, Kits, People, Tags), then the rows that were
  squeezed out of `…` (Lists, Tags, Feed Doctor, Pastes, Links, Storage
  Diagnostics) where their features are on. Each section is data (a typed
  table like `MODE_NAV`), so the owner can grow it into a full list of
  direct links without touching markup. Links respect feature flags, account
  kind and Native (no control that can only fail).
- **Locking the `…` menu:** a spec asserts the exact ordered row list for each
  case (signed in, Anonymous, foreign primary, canary, staff, mock tooling) and
  fails on any change. A comment at the top of the menu and in the spec says
  that rows change only with the owner's say-so, and that new features go in
  Even more. Any test that disappears is declared in `ui/test-removals.md`.
- Tests: the dialog spec (sections hide per flag and account kind; open and
  close; deep link), the menu-inventory spec, and the design inventory (new
  dialog controls).
- Manual plan: `test_plans/even-more.md`.
- **Stop after Sprint 5** for the pair-level checks.

---

## Open questions (none block Sprint 1)

1. The thresholds in Sprint 2: whether to guess and ship, or calibrate against
   a few real accounts first.
2. After a few weeks of use: did Explore work? Either way, nothing is removed
   without a separate owner decision; the old paths stay as alternatives.
3. `NATIVE_CHANGELOG.md`: list Explore once it has been verified in Native, per
   `ops/NATIVE_CHANGELOG_RUNBOOK.md`.
