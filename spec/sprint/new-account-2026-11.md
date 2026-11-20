# New account setup + /create-mastodon-account/: six sprints

Status: sprints 1–7 built and final gates run 2026-11-18 (results at the end). Still open: owner canary, server-list review. See [Progress log](#progress-log) at the end. Design and every decision:
[../new-account-setup.md](../new-account-setup.md). Read it first. This file is
the order of work, the files to touch and the gates.

## Handoff notes

- Work on `main`; leave commits to the owner. Nothing is published externally.
- Maintained client: `ui/`. `mastodon_mock/ui` is a frozen fork; don't touch
  it.
- Gate cadence (AGENTS.md): iterate with `make test-changed`,
  `npm run test:subset -- <dir>`, `npx prettier --check` and
  `ng lint --lint-file-patterns` on touched files. Run the **full gates once at
  the end of each sprint pair** (after 2, 4 and 6), cheapest first:
  static checks, `make test`, `npm run build:mockingbird`, the SEO gates where
  relevant, then `make design-verify` where relevant. Report which gates ran.
- Put logs in `L=$(node ui/scripts/artifacts.mjs logs)`. Put screenshots under
  OS temp/mawkingbird.
- **Canary stops** after sprints 2, 4 and 6: the owner tries it on a phone
  before the next pair starts.
- Method lesson from the onboarding epic: before planning a fix, render the
  component in a throwaway spec and assert on real runtime values. Static
  reading of this codebase has misled planners before.
- Every new route is lazy. Don't raise bundle budgets. Check with the build's
  size report.
- New storage keys go into `platform/storage/storage-registry.ts`
  (`make storage`).
- If a canary finding contradicts the spec, stop and ask. Don't redesign
  quietly.

---

## Sprint 1: plumbing, detection, empty wizard shell

**Goal:** a real sign-up lands on `/setup/welcome` in a distraction-free shell
with working Back, Skip, Next and Exit, over placeholder steps.

0. **Canary (blocking).** Do a real `prompt=create` sign-up on a 5.0+ server
   with open registrations (the owner may need to do the email step), and,
   if one can be found, on an approval-required one. Answer the four
   "Unverified" questions in the spec and write them under "Canary findings".
   **Stop for the owner if anything contradicts the design.**
1. `StoredApp.created?: boolean` in `accounts/sign-in/login/login.ts`. Set it
   in `startOAuth(true)` on both copies, and read it in `handleOAuthCallback`.
   Update the storage-registry note for `mockingbird_oauth_signup`.
2. `src/app/account-setup/setup-store.ts` (no Angular, tiny):
   - the `mockingbird_account_setup` key,
   - `armSetup(scope, source)`,
   - `isYoungEmptyAccount(account, now)`: pure, unit-tested, including the
     date-precision `created_at`.
3. Arming hooks in the same place onboarding arms today (`Auth.setToken`
   followed by first verification). When setup arms, **don't** arm onboarding
   `pending` for that account.
4. Callback destination: armed with no `next` → `/setup`. Armed with `next` →
   also `/setup` (owner decision: sign-ups always land in setup).
5. Route `/setup` and `/setup/:step` (lazy). Guard: signed-in Mastodon only.
   Redirect `/setup` → first unfinished step.
6. Setup layout, outside the shell's chrome:
   - logo, a muted **Exit setup** link, a centred body, a footer with Back,
     Skip and Next, and a progress bar,
   - 320/390/800/1280px with no horizontal scroll,
   - focus moves to each step's heading on navigation,
   - Escape does nothing (Exit is explicit).
7. `setup-flow.ts`: a DOM-free step list driven by data (`when(ctx)`),
   Next/Skip/Back, answered tracking, and progress. It mirrors
   `onboarding/onboarding-flow.ts` and reuses it where that's clean.
8. Placeholder components for every step id, so routes and analytics paths
   exist from day one.
9. Check `sanitizePath` on `/setup/<id>` (kept verbatim). Add a spec.

**Tests:**
- Arming from the created flag.
- Arming from a young, empty account; no arming for old accounts, accounts
  with posts or follows, re-authorization, or switching.
- Onboarding card not armed when setup is.
- The guard.
- Exit saves state and lands on `/home`.
- Resume goes to the first unanswered step.

**Done when:** a manual sign-up (or the mock server with a forced young
account) ends on `/setup/welcome`, and Exit then `/setup` resumes.

## Sprint 2: welcome, purpose, profile, languages, findable

**Goal:** steps 1–5 work end to end against the server, using Settings' code.

1. `welcome`: handle, copy button, the optional "your server has its own
   setup" line (from canary finding 4).
2. `purpose`: four choices (the fourth only on Nth accounts). Store it in
   setup state. Pseudonym → `Pseudonymity.setEnabled(true)` and the
   clean-links/media default, applied on Next.
3. `profile`: reuse **Settings → Public profile** pieces
   (`settings/profile/*`, `profile-bio-dialog`, `profile-link-dialog`,
   avatar/header upload). If they're page-bound, extract shared pieces rather
   than copying them. Unbird's `profile-plan.ts` and `unbird-profile.*` are the
   other existing editor; pick one source of truth and note it in the spec.
   Nth and not pseudonym: "Copy from @other" prefills; save only on Next.
4. `languages` (first account only): known languages and posting language.
   Write via `ClientPrefs` and the server `language`, as the onboarding cards
   do.
5. `findable`: four controls with cost lines (wording in the spec, final copy
   here). Writes go through `onboarding-server.ts` / the Settings → Privacy
   path, optimistic with revert. Purpose-driven preselection is applied only
   on Next.
6. Absorption: mark the onboarding ids listed in the spec as answered when
   their setup step is shown and answered.
7. Resume entry on Settings → Public profile and Privacy ("Set up this account
   step by step" / "Run account setup again").

**Tests:**
- Each step reads current values and writes only changed fields.
- Server refusal reverts.
- Pseudonym defaults.
- Nth account skips `welcome` and `languages`.
- Absorption ids.
- The Settings entry shows and hides correctly.

**End of pair (1+2): full gates once**, then a canary stop.

## Sprint 3: movers and fill the feed

**Goal:** after `follow`, Home has posts.

1. `movers`: Twitter / Bluesky / Neither. Skipped for a pseudonym.
2. `twitter`: embed Unbird's drop and people matching (`unbird/unbird-drop`,
   `unbird/unbird-people`, `unbird-matcher`) in the setup body. Fit the
   component rather than forking it. Explain that there's no archive yet and
   offer to continue.
3. `bluesky`: embed `settings/import-export/bridge-friends-import.ts` with the
   direction fixed.
4. `follow`:
   - interest chips ranked by starter material in the person's languages
     (`discovery/starter-catalog.generated.json`, bundled starter kits, Feed
     Builder topics), plus free-text interest search,
   - per-interest people (6–12) merged with `Api.followSuggestions`,
   - per-person Follow, Follow all N with undo, hashtag toggle
     (`Api.followTag`), soft counter ("about 20"),
   - reuse the starter-kit / Unbird bulk-follow queue. Don't write a new one.
5. Nth (not pseudonym): a collapsed "Copy from @other", with follows and
   followed tags from another signed-in Mastodon account, all unchecked.
6. Follows from steps 6a and 6b count toward the counter.

**Tests:**
- Interest ranking by language.
- Merge and dedupe with suggestions, excluding self and already-followed.
- Follow-all and undo.
- Copy-from hidden for a pseudonym.
- Counter includes mover follows.

## Sprint 4: intro, done, pending accounts, purpose-first Add account

1. `intro`:
   - blank composer (`Compose`, minimal config), the three prompt questions,
     the two-sentence advice, and tap-to-insert interest-tag chips (no
     `#introduction` chip, owner decision),
   - warning for non-public visibility, with one-tap public,
   - Post, then the Pin offer (`pin` status API).
2. `done`: marks finished, sends to Home, Settings pointer line.
3. Pending accounts, using the canary findings:
   - detect, show waiting mode, queue profile, settings and follows in the
     setup store (`private`), save the intro to Write → Drafts,
   - `/setup/ready` applies the queue on the first verified start,
   - 30-day expiry.
4. Purpose first in `/login/mastodon?intent=need` when the browser already has
   an account. Topic or alt purposes show directory servers by category
   (`discovery/mastodon-servers.ts`). The purpose is carried in the OAuth
   record and prefilled in setup.

**Tests:**
- No prefilled text in the composer.
- Chips insert only on tap.
- Pin after post.
- Pending: queue written, then applied once, expiry.
- Purpose question only when an account already exists; carried through
  OAuth.

**End of pair (3+4): full gates once**, then a canary stop. The owner does a
full real sign-up through to `done`.

## Sprint 5: `/create-mastodon-account/` page and chooser

1. `ui/scripts/refresh-signup-servers.mjs` writes
   `public-pages/create-account/signup-servers.json`, with `checkedOn` and a
   printed diff. Add a Make target (`make signup-servers`; owner rule: every
   command gets a target). **The owner reviews the first output before it's
   committed.**
2. Extract the OAuth start (register app, PKCE, state, both storage copies,
   authorize redirect) from `Login.startOAuth` into a shared service, so the
   page can start a sign-up without visiting `/login`. `Login` uses the same
   service. Existing login specs must stay green unchanged.
3. Page component and content (spec § Content). Prerendered copy is complete
   without JavaScript. Facts in the questions section are verified and dated.
4. Chooser:
   - language select, 3–5 cards,
   - `/create-mastodon-account/go/<server>` with a live `probeSignup`,
     dispatching to `prompt=create`, welcome-back, or back to the chooser with
     the reason,
   - "Pick another server" (`server-picker`),
   - signed-in variant: "Create another account" via purpose first.
5. Focused-tool plumbing: `focused-tools.json` entry with a signed-out mode
   (extend the `signIn` field), the route, the prerender table in
   `main.server.ts`, the sitemap and its date, the `check-seo-build.mjs` pages
   list, `/tools/` and `/features/`.
6. Check `/go/<server>` in `sanitizePath` (spec § Analytics).

**Tests:**
- Snapshot script on a fixture directory (filters, sort, top 5, languages
  with fewer than 2 servers dropped).
- Chooser default language.
- Go route dispatch for each probe result.
- Prerender content asserted by `check-seo-build.mjs`.

## Sprint 6: links, help guide, polish, release gates

1. Rewrite `docs/new-to-mastodon/create-an-account.md` as the step-by-step
   reference. Remove the outdated "come back and sign in" text. Link the page
   and describe setup. Update `docs/start/first-ten-minutes.md` if it overlaps.
   Then run `make help-site-test` and `make help-site`.
2. Link the page from `docs/index.md`, `docs/new-to-mastodon/*`,
   `/for/twitter-exodus/`, the login "I need an account" path, and welcome-back.
3. Update `ops/engineering/seo.md` with a section for the page and the
   snapshot refresh routine. Add a note to `spec/onboarding-wizard.md`
   pointing here for the suppression rule.
4. Design system: if setup introduced reusable controls (step footer, progress,
   interest chips, person row), consolidate them with the existing `Mb*`
   components. Run the design inventory review (`design:audit-controls`,
   06-consolidation.md, 11-reconciliation.json) and add stories for any shared
   widget.
5. Browser checks: no overflow at 320/390/800/1280 on every setup step and the
   SEO page; keyboard-only path through setup.
6. CHANGELOG `[Unreleased]` via `kaclm`.

**End of pair (5+6): full gates once:**
- static checks,
- `make test`,
- `npm run build:mockingbird` (size report: setup and page lazy),
- `make test-seo` and `npm run test:seo:browser`,
- `make test-deep-links-browser` (new public route),
- `make design-verify`,
- `make help-site-test`.

Then a canary stop. After release: add `/create-mastodon-account/` to the
weekly Search Console check (opus_SEO.md §3.5).

---

## Progress log

### After sprints 1–2 (2026-11-18)

**Built** (all in `ui/src/app/accounts/setup/` unless noted):

- `setup-store.ts`: the `mockingbird_account_setup` key (registered,
  `private`, per account), `armSetup`, `isYoungEmptyAccount`, a module-level
  sign-up hand-off (`noteSignupReturn`/`takeSignupReturn`), and
  `setupRedirectFor`.
- Arming is in `Auth.setAccount` (`platform/session/auth.ts`), at the same
  fresh-token moment onboarding used. A sign-up return or a young empty account
  arms setup **instead of** onboarding `pending`.
- Login (`accounts/sign-in/login/login.ts`):
  - `StoredApp.created` is set by `startOAuth(true)`,
  - the callback notes the sign-up, with `hint: 'twitter'` when `next` was an
    Unbird page,
  - `submit()` goes to `/setup` when the account is armed, whatever `next`
    was.
- Shell: a Home `NavigationEnd` on an armed account redirects to `/setup`.
  This covers sign-in paths other than the login page.
- Routes: `/setup` and `/setup/:step`, outside the shell, with an eager tiny
  `setup.guard.ts` and a lazy page.
- `setup-steps.ts` (catalogue as data), `setup-flow.ts` (DOM-free),
  `setup-state.ts` (page-scoped: record, flow, shared
  `MastodonOnboardingServer`, the commit hook `onSetupNext`, and `absorb()`
  into the onboarding store).
- `account-setup.*`: logo, Exit setup, progress, Back/Skip/Next, a focused
  heading per step, and a one-line error that keeps the person on the step
  when the server refuses.
- Steps `steps/setup-purpose`, `setup-profile`, `setup-languages`,
  `setup-findable`. `welcome` and `done` are inline in the page template. The
  rest are placeholders ("This step is still being built").
- The onboarding `ServerSettings` gained `indexable` (shared adapter, also
  used by the card).
- `languageOptions`/`PICKER_ORDER` are now exported from
  `onboarding-questions.ts`.
- Settings → Public profile: a "Set up this account step by step →" / "Run
  account setup again" link, Mastodon accounts only. i18n keys
  `settings.profile.setup.*` (settings is a migrated directory). Not added to
  Privacy, because one entry point was enough.

**Decisions made while building** (read before sprint 3):

- **Skip never applies anything.** Steps hold choices locally and write only
  on Next, through `state.commit`. This is simpler than the onboarding card's
  apply-then-revert, and Skip truly means "leave it as it was".
- **Purpose** is asked of every account, with all four choices (owner).
  Pseudonym → Pseudonymity on, plus clean links and media. Changing away from
  pseudonym turns only `enabled` off again.
- **Findable** has no "search engines" control. `indexable` is full-text
  search, and the API has no noindex switch; the spec is corrected.
- **Profile** step: name, picture and bio only. "Copy from @other" copies
  name and bio. Copying the avatar would need a cross-origin image fetch, so
  it was left out. Copy is never offered to a pseudonym.
- `welcome` shows for every first account, so `/setup/welcome` doesn't tell
  sign-ups apart from young accounts in analytics. Accepted as lossy.

**Not done, carried forward:**

- **Sprint 1 task 0, the canary, is still open.** An agent can't do a real
  email sign-up. The owner needs to run one `prompt=create` sign-up on a 5.0+
  server and fill in "Canary findings" in the spec. Pending-approval handling
  (sprint 4) depends on it.
- The `movers` step is a placeholder. Sprint 3 must preselect Twitter when
  `record.hint === 'twitter'`.
- Setup has no profile-header or links editing. Revisit if the owner wants them.

**Gates run** (light, per owner):
- prettier and `ng lint` on every touched file,
- `npm run check:i18n`,
- `npm run test:subset` on `accounts/setup` (store, flow, triggers, page,
  steps), `accounts/onboarding`, `settings/profile`, `accounts/sign-in/login`,
  `platform/session`, `platform/storage/storage-registry.spec.ts`,
  `shell/shell.spec.ts`, `app.routes.spec.ts` and `platform/diagnostics`.
  All green.

**Deferred to the final full gate** (owner: no full gates until the end):
`make test` (including the test manifest, knip and design inventory, which
**will** be stale: new controls in `accounts/setup`), `npm run
build:mockingbird` (check that setup is lazy and only `setup.guard.ts` and
`setup-store.ts` are eager), `make storage`, `make design-verify`, the SEO
gates, and the browser overflow checks at 320/390/800/1280.

### After sprint 3 (2026-11-18)

**Built:**

- `steps/setup-movers`: preselects Twitter from `hint`; writes `movers` only
  on Next.
- `steps/setup-twitter`: embeds `UnbirdDrop` and `UnbirdPeople` unchanged.
- `steps/setup-bluesky`: embeds `BridgeFriendsImport` with
  `connectInline`.
- `steps/setup-follow`:
  - interests are the starter kits in the languages the person reads (largest
    first, English as the fallback), led by "Popular on your server"
    (`/api/v2/suggestions`),
  - choosing an interest lists its people, deduped and without self, all
    ticked; they can untick anyone,
  - **Follow N** appends rows to `ImportFollows` (the starter-kit queue,
    rate-limit aware, with its bulk-follow confirmation) and starts it,
  - a counter of follows plus queued follows, against "about 20".

**Cut from sprint 3, still to do:**

- Hashtag follow per interest: starter kits carry no tags. It needs a
  kit → tag map, or the Feed Builder topics.
- "Copy follows from @other" for Nth accounts: it needs the other session's
  token to list its follows.
- Free-text interest search.
- No per-person Follow button: ticking a person in or out and pressing
  **Follow N** does the same job.

**Gates:** prettier and lint on `accounts/setup`, and setup specs (31) green.
The embedded Unbird and Bluesky components have **not** been checked inside
the setup layout at phone width; do that at the final browser pass.

### After sprint 4 (2026-11-18)

**Built:**

- `steps/setup-intro`:
  - a blank textarea (500 characters) with three prompt questions above it,
    never inserted into the text,
  - the hashtag advice (`#introduction` appears only in the advice text),
  - an explicit **Post** button; Next never posts,
  - after posting, **Pin it**,
  - if the default visibility is followers-only or direct, a one-tap
    "Post this one publicly".
- `done` and the finished state were already done in sprint 1.
- **Pending accounts, minimal version:** `SetupState.checkAccount()` treats a
  403 from `verify_credentials` as "awaiting approval". The page shows a calm
  banner, and the intro becomes **Save for later**, which saves to Write →
  Drafts.

**Deviations, read before sprint 5:**

- **The intro uses a plain textarea, not `Compose`.** It has no attachments,
  and a fixed 500-character counter rather than the server's limit. Switching
  to `Compose` in a minimal configuration is still open if the owner wants
  media or the real limit.
- **No interest-tag chips:** starter kits carry no hashtags (see sprint 3).
- **The approval queue** (profile, settings and follows saved while pending,
  then `/setup/ready`) is **not built**. It waits on the canary findings: the
  403 signal is assumed, not verified. Today a pending account's profile and
  findable writes simply fail with the one-line error, and they can Skip.
- **Purpose-first in Add account is moved to sprint 5.** Which servers it
  shows depends on the server snapshot that sprint 5 builds.

**Gates:** prettier and lint on `accounts/setup`, and setup specs (35)
green.

### After sprint 5 (2026-11-18)

**Built:**

- **`ui/scripts/refresh-signup-servers.mjs`** (`make signup-servers`) writes
  `ui/src/app/public-pages/create-account/signup-servers.json`:
  - per language, up to 5 open general servers plus up to 3 that require
    approval, by `last_week_users`,
  - a language is offered only when it has at least 1 open server,
  - it prints a per-language diff.

  **The first output (checked 2026-11-18) is a proposal for the owner to
  review:** en, de, fr, es, it, ko, zh. Japanese and Dutch dropped out because
  every big general server there requires approval. Many listed servers are
  still Mastodon 4.x, so the "straight back here" sign-up only happens on the
  5.x ones (mastodon.social, ieji.de, rivals.space, and others).
- **`/create-mastodon-account/`** (`public-pages/create-account/`):
  - complete answer copy, prerendered with the English list,
  - in the browser: a language select defaulting to the browser's language,
    and the "Show servers that review new accounts (N)" toggle, off by
    default,
  - server cards with domain, description, rounded weekly active users and a
    rules link,
  - "Pick another server" goes to `/login/mastodon?intent=need`,
  - a dated questions section with plain facts only, and no "you can move
    later".
- **`/create-mastodon-account/go/:server`** is a counted hop to
  `/login/mastodon?intent=need&server=…&go=1` (plus `add=1` when already signed
  in). Non-domains go back to the page.
- **Login `go=1`:** once `probeSignup` shows `prompt=create` support and
  registrations aren't closed, `startOAuth(true)` starts by itself. Older or
  closed servers stay on the login page's existing sign-up options, including
  welcome-back.
- **SEO wiring:**
  - route in `app.routes.ts` and the prerender table in `main.server.ts`
    (`create-account-meta.ts` holds the description),
  - `public/sitemap.xml`,
  - the `pages` list in `scripts/check-seo-build.mjs`.

**Changed from the plan:**

- **Not a `focused-tools.json` entry.** Focused tools are signed-in tools with
  nav tabs and translations; this page is for people with no account. It's a
  standalone public page like `/about/`, so it isn't listed on `/tools/`.
  Link it from the help site and `/for/twitter-exodus/` in sprint 6 instead.
- **No OAuth extraction from `Login`.** The page hands off to the login page
  with `go=1`, which reuses the existing, tested flow at the cost of one
  visible redirect.
- **Purpose-first in Add account is still not built** (moved twice). Setup
  already asks purpose. The remaining piece is showing topic servers to alt
  accounts at server choice. Do it in sprint 6 or drop it.

**Not verified yet (final gates):**

- `make test-seo` and `test:seo:browser`: the sitemap may need a date entry,
  and the share image or other per-page checks may expect fields this page
  doesn't set yet.
- The prerendered HTML: the page reads `navigator` only in the browser.
- No login spec for `go=1` yet.

**Gates:** prettier and lint; page, go-hop, login and routes specs (69)
green.

### Owner change between sprints 5 and 6: one sign-up button

The login page's "I'm new here" block showed two identically labelled buttons,
each with explanatory text, which the owner called confusing and full of
scare text. It now shows **one** button, "Create an account on {server}":

- **While the version probe is in flight:** the button is disabled.
- **Mastodon 5+:** `startOAuth(true)`, and the person comes straight back.
- **Older server, or the probe fails:** the same button links to
  `/welcome-back` (bookmark us and return).
- **Registrations closed:** just the one-line message.

The keys `pages.login.signup.createOn`, `.createHereNote` and `.approval` were
removed from `en.json` and pruned from all 17 locales.

**Purpose-first in Add account is dropped** (owner: "too many questions on the
path to sign up"). Setup's purpose step is the only place purpose is asked.

### After sprint 6 (2026-11-18)

**Done:**

- `docs/new-to-mastodon/create-an-account.md` rewritten: it points to the
  page, describes the come-back behaviour and the setup steps, and drops the
  outdated "come back and sign in" as the only path.
- `docs/index.md` links `/create-mastodon-account/`.
- `/for/twitter-exodus/` guides list it (`audience-content.ts`).
- `ops/engineering/seo.md` has a section for the page, the snapshot refresh
  routine and the funnel paths.
- `spec/onboarding-wizard.md` notes that setup suppresses the card.
- **No changelog entry:** this repo has no web changelog (only
  `NATIVE_CHANGELOG.md`). A news post, if wanted, is the owner's call.

**Not done:**

- **Design-system consolidation** is owner-deferred ("if space is left, design
  system work"). Candidates for shared `Mb*` widgets:
  - the setup step footer (Back/Skip/Next),
  - the person row in `setup-follow`,
  - the file-pick button in `setup-profile`,
  - the page's native `select` and checkbox (`create-account.html` uses raw
    controls, because it prerenders outside the app).

### Sprint 7: design system (2026-11-18)

Owner rule: use design-system elements, because hand-rolled ones forget
padding and the rest. Swaps made, with no new `Mb*` component needed:

| Where | Was | Now |
|---|---|---|
| Follow step, person rows | hand-styled `li` + `img` | `div[mbIdentityRow]` with `.suggestion-avatar` / `.suggestion-name` (Unbird's pattern) and an `mb-checkbox` labelled "Follow" |
| Profile picture | label wrapping a hidden `input[type=file]` | `mb-file-drop presentation="link"` |
| Setup waiting banner, Next error, intro error | styled `p` | `mb-notice` (`tone="error" announcement="alert"` for errors) |
| SEO page language picker | bare `select` | `mb-field` + `select[mbControl]` |
| SEO page approval toggle | bare checkbox | `mb-checkbox` |
| SEO page server cards | hand-styled `li` | `div[mbDiscoveryCandidate]` with `[data-candidate-actions]` |
| SEO page Create / Pick another server | plain links | `a[mbButton]` (solid / outline) |

The matching hand-written CSS was deleted. Already on the design system before
this sprint: the setup footer (`mbButton`), progress (`mb-progress`), radio
choices (`mb-radio-group`), checkboxes and text fields (`mb-field`).

**Left as is, deliberately:**
- The login page's sign-up button keeps `class="btn signup-btn"` like every
  other button on that page. Moving the whole login page is a separate job.
- The interest list's `fieldset`/`legend` grid is layout only, with no
  control styling.

**Expect the design inventory to change.** `design:inventory-check` will
report new and removed candidates in `accounts/setup/**` and
`public-pages/create-account/**`. Reconcile it in the final gates as
AGENTS.md describes. Nothing was added to `design-system/`, so
`design-verify` is only needed for the login stories.

**Gates:** prettier and lint, plus setup and page specs (41) green.

## Final gates (handoff, not yet run)

The owner may delegate this. Run once, cheapest first. On a failure, fix it
and rerun that gate plus the affected specs.

1. **Static checks:**
   - `cd ui && npm run check:i18n` (green at sprint 6),
   - `make storage` (new key `mockingbird_account_setup`),
   - `npm run check:libs`,
   - `python -B -X utf8 ui/scripts/audit_deep_links.py` (new routes `/setup/:step`
     and `/create-mastodon-account/go/:server`).
2. **`cd ui && make test`.** Expect three things to need work:
   - **Design inventory (`design:inventory-check`) will be stale.** New
     controls are in `accounts/setup/**` and `public-pages/create-account/**`.
     Follow AGENTS.md: `npm run design:audit-controls`, review
     06-control-inventory.json, update 06-consolidation.md, reconcile
     11-reconciliation.json.
   - **Test manifest:** new specs were added, none removed.
   - **knip (dead code):** `create-account-meta.ts` and the exports
     `SIGNUP_SERVERS_CHECKED_ON` and `interestsFor` are used. Check that nothing
     was orphaned by the login template change.
3. **`npm run build:mockingbird`.** Setup and the create-account page must be
   lazy chunks. Only `setup.guard.ts` and `setup-store.ts` (plus
   `create-account-meta.ts`) should reach the initial bundle. **Check that
   setup's embedded Unbird and `BridgeFriendsImport` didn't pull anything
   eager.**
4. **`make test-seo` and `npm run test:seo:browser`.** The new page may need a
   sitemap date entry, a share image (`seoImage`) or a content assertion in
   `check-seo-build.mjs` (an `articles`-style regex). Add what the checks ask
   for; don't weaken them.
5. **`make test-deep-links-browser`** (new public route).
6. **`make design-verify`** (stories: grep `design_system/stories` for
   `Login` / `signup` because the sign-up block changed).
7. **Browser pass** at 320/390/800/1280:
   - every `/setup/<step>` (especially the embedded Unbird and Bluesky steps),
   - `/create-mastodon-account/`,
   - the login "I'm new here" block.
8. **The owner's canary** (still open): one real `prompt=create` sign-up on a
   5.x server (mastodon.social or ieji.de are in the list). Fill in "Canary
   findings" in `spec/new-account-setup.md`, then build or drop the
   approval queue (sprint 4 deviation).

## Final gate results (2026-11-18)

| Gate | Result |
|---|---|
| `check:i18n`, `make storage`, `check:libs` | green |
| `audit_deep_links.py` | green after classifying `setup/:step` and `create-mastodon-account/go/:server` as not-shareable (`SERVER_OR_LOCAL`) |
| `make test` | green (final run): 10517 tests in the manifest, 55 added, 0 missing; dead code clean |
| `npm run build:mockingbird` | green. Initial bundle 932.34 kB, against 929.59 kB earlier the same day (+2.75 kB raw, +0.6 kB gzip, from `setup-store`, `setup.guard` and `create-account-meta`). The 900 kB *warning* budget was already exceeded before this work; the 1 MB error budget is fine. |
| `make test-seo` | green after fixes |
| `npm run test:seo:browser` | green (JavaScript on and off, desktop and mobile) |
| `npm run test:deep-links`, `make test-deep-links-browser` | green (32 journeys) |
| `make design-verify` | static parts green. 6 browser tests failed in the full parallel run (adoption-17-18 final batch, adoption-7 Privacy rollback, adoption-9 translation dismiss, adoption toolbar layout); **all 27 tests in those files pass alone** (`DESIGN_BROWSER_WORKERS=1`). Load flakiness, already known in AGENTS.md. |

**Fixes made during the gates** (the owner said "you own all the issues"):

- **Design inventory:** regenerated and reviewed. The 9 new candidate files were
  reconciled as adopted scope in `11-reconciliation.json` (appended, file
  order kept). Each line-shift review has its own note in
  `06-consolidation.md`.
- **The handle generator's "Open the app" header link** (English and 17
  translations) had lost its `next` return path in the pushed "unbird"
  commit. That failed 17 `translated-pages.spec` tests. Each page now passes
  `[queryParams]="{ next: '/<its path>' }"`.
- **`prepare-seo-index.mjs`:** a lastmod source for
  `create-mastodon-account/` (its directory).
- **The create-account page:**
  - gained the shared public-page footer (MbContentLink to help, features,
    every `/for/` page and communities), as `check-seo-build` requires of
    public pages,
  - its links into the app (`go/…` and "Pick another server") are now
    `rel="nofollow"`.
- **`profile-misskey.spec`** failed once in a full run and passed alone (flaky,
  untouched).

**Still the owner's:**
- the canary sign-up (spec, "Canary findings"),
- reviewing `signup-servers.json`,
- committing.
