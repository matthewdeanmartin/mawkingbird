# Forum roadmap, October 2026

Status: planned · 2026-10-27. Spec: [Forum](../spec/forum.md). The owner
decisions are recorded there; this file holds the sprints and their evidence.

Each sprint ends with a user trial. As with Radio, translations wait until the
mode is complete: new keys get `// i18n` declarations as they are added, and
the locale pass happens in sprint 4.

## Sprint 1: the mode and the scan engine

Goal: Forum appears in the switcher, scans Home, a list or a hashtag within a
budget, and lists discussions in the center. Opening one goes to the existing
thread page for now.

1. **Mode.** `AppMode` gains `forum`, and `modeForUrl` sends `/forum…` to it.
   Add `MODE_NAV.forum` (Talk, Asked, Friends, Mine, Joined) and a
   `MODE_ENTRIES.forum` with unique icons. Routes `/forum` (lazy) and
   `/forum/d/:id` (a placeholder that redirects to `/statuses/:id`).
2. **Pure model** (`forum/discussion.ts`, `forum/question.ts`). Grouping,
   discussion keys by root `uri`, the 2-posts / 2-people rule, derived fields,
   the five filters and the Recent / Popular sorts. Port the MIMB rules, with
   specs that use MIMB's own cases where they exist (`has_human_question`, the
   `forum.py` filters).
3. **Scan engine** (`forum/forum-scan.ts`, `forum/forum-sources.ts`). Sample,
   then candidates, then ranking, then root, then tree, all through one
   metered budget. The first scan is 10 calls; Scan deeper adds 10 or 25
   up to a 50-call ceiling. At most 3 requests in flight. **Stop** keeps and
   shows everything found so far; 429s stop the same way, and
   a gap is marked **partial** for now; the
   cross-server hunt comes in sprint 2. Sources: Home, a list, a hashtag.
4. **List page.** Source picker, sort, provenance line ("posts · discussions
   · calls"), cards (author, instance, excerpt with the content warning
   respected, ? badge, partial badge, participant avatars, reply and people
   counts, latest activity), progressive results with an "N new" pill, and
   empty and thin states.

Acceptance: from Home with the default 10 calls, the list shows the
discussions those calls can reach; each card's root is the true root or is
marked partial; Scan deeper continues without duplicates; and the counter
never exceeds the budget. Specs: `discussion.spec.ts`, `question.spec.ts`,
`forum-scan.spec.ts` (budget arithmetic, ranking order, dedupe by `uri`, Stop,
429), `app-mode.spec.ts` and `mode-nav.spec.ts` cases.

### Sprint 1 progress (2026-10-27): ready for a user trial

- **Mode.** `forum` is a fifth `AppMode` (`/forum…`). `MODE_NAV.forum` has
  Talk, Asked, Friends, Mine and Joined, each a `?filter=`, with Mine and
  Joined requiring sign-in. The switcher gains a Forum entry. Every icon is
  new and unique. The `/forum` route is lazy and anonymous-guarded; a
  Bluesky-only session gets a "needs Mastodon" state instead of a scan.
- **Model** (`forum/discussion.ts`, `forum/question.ts`). A discussion is
  two posts by two people, keyed by root `uri`. `has_human_question` is
  ported, URLs dropped first. The five filters and the Recent and Popular
  sorts follow MIMB.
  Candidates are grouped under their top-most sampled post, so one call
  covers a thread. Ranking: me, replies to someone else, reported replies,
  people, question; storms sink.
- **Scan** (`forum/forum-scan.ts`, root-provided, session only). It runs
  10 calls first, then Scan deeper +10 or +25, up to a 50-call ceiling. Each
  page holds 40 posts, and a second page is read only when candidates are
  short. At most 3 contexts are in flight. **Stop** cancels in-flight
  requests and keeps the results, a 429 stops the same way, and a failed
  probe is skipped. Discussions are joined whenever they connect, so a root
  found later swallows the partial threads beneath it.
- **Friends and Popular.** Follow state comes from
  `/accounts/relationships` on discussion participants, starters first, 40
  ids a call, with one call per step reserved for it. This replaces paging
  the whole following list, which costs a call per 80 follows.
- **Page.** It has a source picker (Home, your lists, a hashtag), the sort
  toggle, and the progress line ("posts · discussions · calls of
  allowance"), with Stop / Scan deeper. Rows keep their place as results
  land, and **Sort the list again** restores the order. Cards reuse
  StatusCard for the root, with Question and Partial badges, up to five
  faces (friends first), counts, and latest activity.
- **Deferred to sprint 2, as planned:** the cross-server gap hunt (gaps are
  marked partial for now), the Me source, and `/forum/d/:id`. Cards open
  `/statuses/:id`, today's thread page.
- **Model change:** `Status.uri` is now declared (optional), and
  `api.homeTimeline` takes an optional `limit`.
- Translations wait for sprint 4, as with Radio; the English keys are
  extracted.

## Sprint 2: the root hunt, the Me source, and the discussion view

1. **Shared cross-server context.** Extract the resolve-then-public-context
   path from `pages/read/thread-loader.ts` into `forum/thread-context.ts` (or
   a neutral shared location), and switch `ThreadLoader` over to it. Thread
   page behavior and specs must stay unchanged. Forum uses it for gaps, with
   every request metered.
2. **Me source.** My statuses (no reblogs) interleaved with mention
   notifications. This fills Mine and Joined.
3. **Discussion view** at `/forum/d/:id`. First investigate hosting `Thread`
   and `ThreadLoader` with a handoff of the already-fetched context (the
   `radio-handoff.ts` pattern), so there is no refetch and no fork. Add Back
   to the list (keeping scroll, filters and source) and "Load full discussion"
   (one call) when the tree was not fetched during the scan.
4. ~~Friends and Popular follow state~~: done in sprint 1 with batched
   relationships for participants.

Acceptance: a reply whose root lives on a server mine does not fully know
resolves to the real root through my server or the origin, or is shown as
partial with the furthest ancestor reached. The discussion opens without
refetching what the scan already holds. The thread page's own specs are
unchanged and passing.

### Sprint 2 progress (2026-10-27): ready for a user trial

- **Widening instead of resolve-then-context** (decision, recorded in the
  spec). One unauthenticated call to the anchor's own server, metered and
  ranked: known gaps, then reply shortfall, then anchors that open with a
  mention. It finds parents my server shows as roots (`in_reply_to_id:
null`), which no resolve can detect, and the replies only the author's
  server received. `ThreadLoader`'s resolve path is untouched, so item 1 (the
  extraction) was dropped as unneeded.
- **Across servers.** Origin posts come back with namespaced ids and parent
  ids. `combine()` keeps one copy per `uri` (mine wins), and re-points
  replies at it. The origin's copy of the anchor is rebuilt with
  `adaptAnonymousStatus` so its replies attach. People are matched by
  profile URL, so following, Mine and Joined hold whichever server's copy
  was found. Relationships are asked only for my server's account ids.
- **Me source** (`?source=me`). My statuses (no boosts) and mention
  notifications (`types[]=mention`, 40 a page) take turns as one source.
  `api.notifications` gained optional `types` and `limit`.
- **Discussion view** at `/forum/d/:id`: the unchanged thread page.
  (Follow-up after trial: while Forum is the current mode, `forumThreadGuard`
  sends any `/statuses/:id` link there too, so opening a post or reply from
  Forum keeps Forum's menu and rails. Members recognise a reply inside a
  scanned discussion.)
  `ThreadPreload` hands it the scan's tree in depth-first reading order, so
  there is no request. A discussion without its tree loads as any post would
  (the planned "Load full discussion" button is unnecessary). The back link
  restores the list's query; the list restores its scroll. A notice explains
  a partial root.

## Sprint 3: the rails (facets and Members)

1. **Rail outlet.** A `RailOutlet` service like `radio-outlet.ts`, with lazy
   `left` and `right` components that the shell shows in place of the default
   rails. Forum sets them on entry and clears them on leave. Shell spec cases
   cover set, clear and zen modes. Verify that the facet and member code
   stays out of the startup bundle.
2. **Facets** (`forum/discussion-facets.ts` plus the left-rail component).
   Hashtags, root instance and
   language (no uncommon words; see spec). Counts come before choices; choices combine with AND across
   types and OR within a type; the top 20 of each are shown. Choices live in
   the URL.
3. **Members widget** (right rail). In a discussion: participants with post
   counts, last post time, the Started it / You / Following badges, a
   follow button, and **Follow everyone** / **Add everyone to a list** through
   the bulk-actions flow. In the list: Most active across the visible discussions.
   Choosing a member toggles the People facet. Mutes and blocks are dropped
   everywhere.
4. **Narrow screens.** A Filters button opens the facets in a popover or
   sheet, and Members collapse above the discussion.

If the rail cards or chips change a shared design-system widget, run
`make design-verify`, including the browser assertions.

Acceptance: facet counts match a hand-computed fixture. Choosing a member
narrows the list to discussions that person is in. Forum mode never shows
ads or server cards in the right rail, and every other mode is unchanged.

### Sprint 3 progress (2026-10-27): ready for a user trial

- **Rail outlet** (`rail-outlet.ts`). Pages claim the shell's rails as lazy
  components with their own `aria-label`. Only the current owner can release
  them, because the router creates the next page before destroying the last.
  The default rails come back everywhere else.
- **Facets** (`forum/discussion-facets.ts`, `pages/forum/forum-facets.ts`).
  The facets are hashtags, starting server, and declared root language (base
  code; nothing is detected). Counts are taken over the tab before any
  choice, choices combine with AND across facets and OR within one, and
  each facet shows its top 20. Choices live in `?tag=&instance=&lang=&person=`;
  a choice made beside a discussion lands on the list with its source and tab
  kept. `ForumView` carries the tab, the choices, and the open discussion from
  the pages to the rails, which sit outside the router outlet.
- **Members** (`pages/forum/forum-members.ts`). Beside a discussion it lists
  everyone, starter first, with Started it / You / Following badges, posts and
  last time, a profile link, and the shared FollowButton (other servers'
  people go through webfinger). **Follow everyone** reuses the bulk-actions
  dialog and progress through a new `discussion` target kind, which carries
  its accounts so nothing is re-read. **Add everyone to a list**
  (`forum-list-dialog.ts`) checks follow state first, because Mastodon lists
  only hold followed accounts, and says how many can go in. It adds to an
  existing list or a new one, in batches, falling back to one at a time.
  Beside the list it shows Most active (by discussions, then posts) with no
  group actions. Choosing a person toggles the People facet.
- **Moderation.** People muted or blocked in Mawkingbird are left out of
  discussions, facets and members, and a discussion they started is dropped.
  My server already filters its own mutes from context. Posts read from other
  servers are filtered only by Mawkingbird's local list.
- **Narrow screens.** When the window hides the left rail, the list shows a
  Filters disclosure. When it hides the right rail, the list and the
  discussion show a People disclosure. Each holds the same components.

## Sprint 4: completion

1. **Help page** in `docs/` (Forum: what a scan costs, what partial means,
   facets, Members), added to the `mkdocs.yml` nav. Run `make help-site-test`
   and `make help-site`.
2. ~~i18n pass~~: English only (owner, 2026-10-27). Translation waits until
   the feature is settled and joins one global pass, as Radio's keys do.
3. **Accessibility.** Cards are a list of links with readable names; facets
   are toggle buttons with `aria-pressed`; progress is announced politely;
   Stop is reachable by keyboard.
4. **Browser checks.** A Playwright script against the mock API: scan, Scan
   deeper, partial root, facet AND/OR, member filter, and the mobile layout.
5. **Decide on the later candidates** in the spec (IndexedDB cache and
   Bluesky).

### Sprint 4 progress (2026-10-27)

- **Owner review of the rails** (screenshot): pill buttons were used for data,
  widgets touched their containers' edges, and member rows stacked one fact per
  line. Fixed:
  - Facets are rail rows in the default rails' trend shape: a link per value
    with its count, `aria-current` and an accent edge when chosen, and the
    count spoken as "N discussions". There are no buttons.
  - Members are two-line rows. The avatar links to the profile; the name,
    badges and counts form one row toggle for the People facet; counts come
    before the truncating handle. Follow and the group actions stay as
    buttons.
  - The list has a 16px inset, in line with the post cards. Badges move into
    each card's footer, and the footer's stats line is now the link into the
    discussion (the separate "Open discussion" pill is gone).
  - Counts are singular or plural ("1 friend replied", "in 1 discussion").
  - The list re-sorts by itself when a scan step ends and the reader has not
    scrolled.
- **Help page** `docs/reading/forum.md`, in the nav under Reading, and linked
  from the Forum header ("How Forum works"). `make help-site-test` (9 tests)
  and `make help-site` (60 guides) pass.
- **Accessibility.** The progress area was a polite live region that would
  read out every call. One persistent `sr-only` status now speaks only at a
  scan's start and end, with the count found. Facets use `aria-current`, the
  People toggles `aria-pressed`, and Stop is a button.
- **Browser check** `npm run test:forum:browser` (`scripts/check-forum-browser.mjs`
  with `forum-browser-fixture.mjs`, against the production build). It checks:
  the scan within its allowance; storms and lone questions left out; 16px and
  14px insets; no buttons in the facets; compact member rows; facet links and
  Clear; the People facet; opening a scanned discussion with no request;
  `/statuses/:id` redirecting into Forum; the 1100px (People inline) and
  800px (Filters inline, no sideways scroll) layouts; and no page errors.
  Screenshots go to `.test-results/forum-*.png`.
- **Root hunt settled** (owner, 2026-10-27: resolve whatever ActivityPub can
  find, and give other servers their own budget). After widening on the
  origin, a foreign anchor is resolved through my server (`search` with
  `resolve`, then its context: 2 calls), so the thread carries my server's
  ids. Every server has its own budget under the same allowance and ceiling.
  The progress line adds "N more on M other servers". Skipped with a separate
  search server, as in ThreadLoader.
- **Found, not fixed (shared shell):** at 800px the top menu's icons overlap
  the next tab's label in every mode (Mastodon and Video too), not only Forum.

## Gates (every sprint)

Targeted specs while working, then `cd ui && make test`, which includes
`design:inventory-check`. Every new HTML, TS or CSS file moves the inventory,
so when it is stale run `npm run design:audit-controls`, review it, and
reconcile `06-consolidation.md` and `11-reconciliation.json`. Also run
`npm run build:mockingbird` (check the size report: Forum must be a lazy
chunk, and the 1 MB initial budget must not be raised), `check:storage` (it
should report no new keys), `ng lint`, and the applicable `.github/workflows`
checks. Slow browser gates run once, at the end of each sprint. Report exactly
which gates ran.
