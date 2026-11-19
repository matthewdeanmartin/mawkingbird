# New account setup + /create-mastodon-account/: six sprints

Status: sprints 1–2 built 2026-11-18 (uncommitted; the owner pushes every two sprints). See [Progress log](#progress-log) at the end. Design and every decision:
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
