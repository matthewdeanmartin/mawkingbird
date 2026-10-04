# Onboarding wizard

Status: implemented (v1) · 2026-09-27. Where the build differs from the first draft, this document now describes the build.

## Problem

A new user has to find about 20 switches across 25 Settings pages to make
Mawkingbird feel like their own. Some are urgent: a pseudonymous account should
lock down before its first post. Most people will never find them.

## Summary

A short question-and-answer wizard. It shows **one question per card**, and
each answer **takes effect immediately**. It runs automatically the first time
an account is used, and anyone can rerun it from the **… (More) menu →
Onboarding**. Questions are split into **app-wide** ones (asked once per
browser) and **per-account** ones (asked once for each account). Answers can
lead to follow-up questions, for example the language questions for people who
read several languages. The last card introduces **Mawkingbird Plus**.

English only. No i18n machinery (see [i18n](#i18n)).

## Decisions already made (owner, 2026-09-27)

| Topic | Decision |
|---|---|
| Presentation | Floating, **non-blocking** card over the live app, so theme and text changes show behind it as the user answers. |
| Server-side settings | The wizard may change Mastodon server settings (locked, discoverable, default visibility). Each such card carries a small neutral tag: **"Mastodon server setting"**. Local cards say **"Mawkingbird setting"**. No warnings, no explanations. |
| Auto-start | Signed-in accounts **and** the Anonymous account. |
| Plus card | Shown only when the `mawkingbird-plus` feature flag is on. When it is off, **no card at all**. |
| i18n | None for wizard content. Hardcoded English. |

## User experience

### The card

- Desktop: docked bottom-right, about 360px wide, above page content. It doesn't
  cover the feed column on screens 1280px and wider.
- Phones (up to 800px): a bottom sheet, full width with a 16px gutter, at most
  about 60% of the viewport height. It must not cause horizontal scroll at
  320px.
- No backdrop, no focus trap on the page. The app behind it stays usable.
- `role="dialog"`, `aria-modal="false"`, labelled by the question heading. Focus
  moves into the card when it opens. Escape does the same as **Quit**.

Card anatomy, top to bottom:

1. Progress: "3 of 18" plus a thin bar. The total is recomputed as branches
   open or close, so it's allowed to change.
2. Scope tag: `Mawkingbird setting · all accounts` (app-wide),
   `Mawkingbird setting · this account`, or `Mastodon server setting`.
3. Question: one line, a heading.
4. Help: **at most 1–2 short sentences.** Plain words. No implementation terms
   (no "localStorage", "CORS", "scope", "API").
5. The control: radio tiles, a toggle, a language chip picker, or a colour
   swatch row. Selecting applies the setting **immediately**. The **current
   value is preselected** (it's never a blank form).
6. Footer: **Quit** (left, text button) · **Skip** · **Next** (primary). On
   cards after the first there's also a **Back** arrow.

Button meanings:

- **Next**: keep the current selection (already applied) and advance. If the
  user never touched the control, Next still counts as "answered" with the
  preselected value.
- **Skip**: leave the setting as it was when the card opened and advance. If
  the user changed it on this card, Skip **reverts** it. Skip means "don't
  decide this now".
- **Back**: go to the previous card. Its value stays applied.
- **Quit**: close the wizard. Everything already applied stays applied.
  Progress is saved, so reopening from the menu resumes at the next unanswered
  card (see [State](#state)).

A server-setting card applies optimistically, the same way
`pages/settings/privacy` does. If the server refuses, the card shows one line
("Your server didn't accept this change.") and reverts the control. Next stays
enabled.

### Triggers

1. **First use of an account (auto-start).** Mark an account *onboarding
   pending* at the moments it becomes new to this browser. As built, these
   hooks sit in the services, not the several login pages:
   - Mastodon: `Auth.setToken` adds a new session, and that token's first
     `Auth.setAccount` (verification) in the same page load arms the stable
     account scope. This covers OAuth, pasted tokens and registration. It
     excludes re-authorisation, switching and boot-time re-verification.
   - Bluesky: `saveBlueskyIdentity` now returns whether the DID was new.
     `BlueskySession.loginAsIdentity` and `finishOAuthIdentity` arm the DID
     scope when it was.
   - Anonymous: the first ever `AnonymousAccount` activation in
     `Auth.enterAnonymous`. For a stranger, that's the first-run preview.
   - Arming is a no-op if the account already has an onboarding record.

   The card opens the next time that account is on `/home`. It never opens over
   login, OAuth callbacks, the first-run modal, or the starter-kit page the
   anonymous path lands on. Using a pending flag (not "no onboarding record
   exists") means **existing users are not ambushed** when this ships. Only
   accounts that sign in after the release are auto-onboarded.
2. **Manual.** In the … menu, add **Onboarding** directly under Settings. It
   opens the card on the current page:
   - With unanswered cards for this account or browser, it resumes there.
   - Otherwise it starts a full rerun (app-wide and this account) from card 1,
     each preselected with current values.
3. Switching accounts (`location.assign` reload) while a card is open closes it.
   Pending status is per account, so the other account's own pending flag
   applies after the switch.

### Flow order

```
[Account: identity & safety]  → pseudonymity first, because it is urgent
[App-wide: look & feel]       → skipped if app-wide onboarding is already done
[App-wide: languages]            (branches)
[App-wide: reading & posting]
[Account: the rest]
[Plus]                        → only if flag `mawkingbird-plus` is on
[Done]
```

Rules:

- For a second account in the same browser, all app-wide sections are skipped.
  That account sees only its account cards, Plus and Done (about 5–8 cards).
- A manual rerun includes app-wide sections even when they're done. That's the
  only way to revisit them.
- Cards whose condition is false (for example a server card on Bluesky) are
  left out and not counted in progress.

## Question catalogue

Scope: **B** = app-wide (this browser), **A** = per account, **S** = per
account, stored on the Mastodon server.

Networks: **M** Mastodon, **Bs** Bluesky, **Anon** the Anonymous account.

Copy is final-draft. Keep it within these lengths.

### Section 1: identity and safety (A)

| # | Id | Scope | Shown when | Question / help | Control → setter |
|---|---|---|---|---|---|
| 1 | `pseudonymous` | A | M, Bs (not Anon) | **Is this a pseudonymous account?** A name that isn't linked to your real identity. We'll help keep it that way. | Yes / No → `Pseudonymity.setEnabled()` |
| 1a | `pa-locked` | S | M and #1 = Yes | **Approve new followers yourself?** People have to ask before they can follow you. | Toggle → privacy `locked` via `update_credentials` |
| 1b | `pa-discoverable` | S | M and #1 = Yes | **Keep this account out of suggestions and trends?** | Toggle (on = hidden) → `discoverable = !value` |
| 1c | `pa-clean` | A | #1 = Yes | **Strip hidden details from links and photos you post?** Removes trackers from links and location data from photos. | Toggle, preselected on → `setCleanLinks()` + `setCleanMedia()` together |
| 1d | `pa-reminder` | A | #1 = Yes | **Remind you before each post?** A quick check that you're posting as the right person. | Toggle → `Pseudonymity.setReminder()` |

Pseudonymity writes nothing under Anon, because `Pseudonymity.write` refuses
there, so the card is never shown there.

### Section 2: look and feel (B)

| # | Id | Question / help | Control → setter |
|---|---|---|---|
| 2 | `theme` | **Light or dark?** Automatic follows your device. | Automatic / Light / Dark → `ClientPrefs.setThemeMode()` |
| 3 | `accent` | **Pick a colour.** | `ACCENT_PRESETS` swatches → `setAccent()` |
| 4 | `images` | **Show pictures in your feed?** Text-only shows a small icon and the description instead. | Show / Text-only → `setShowImages()` |
| 5 | `likes` | **Stars or hearts?** | ⭐ / ❤️ → `setFavStyle()` |
| 6 | `post-noun` | **What do you call a post?** Just a word. Change it any time. | post / toot / skeet / tweet (from `POST_NOUNS`, leave out `custom`) → `setPostNoun()` |
| 7 | `zen` | **Would you like Zen mode?** Less visual clutter, with more features behind menus. | Zen / Keep features in view → `setZenMode()` |

### Section 3: languages (B, branching)

| # | Id | Shown when | Question / help | Control → setter |
|---|---|---|---|---|
| 9 | `languages` | always | **Which languages do you read?** | Language chips, prefilled from the browser's languages → `setKnownLanguages()` |
| 9a | `ui-language` | chosen languages include one other than the current UI locale | **Use Mawkingbird in another language?** | Choice list: "Same as my device" plus each shipped locale by its own name (`LOCALE_ENDONYMS`) → `ClientPrefs.uiLocale` |
| 9b | `hide-foreign` | always after 9 | **Hide posts in languages you don't read?** | Toggle → `setHideForeignLangPosts()` |
| 9c | `learning` | ≥2 languages chosen, or the user taps "I'm learning a language" on #9 | **Learning a language?** We'll never hide posts in it. | Language chips → `setLearningLanguages()` |
| 9d | `learning-help` | 9c non-empty | **Add a translation under posts in {language}?** Handy while you're learning. | Toggle for each learning language (one card, max 3 rows) → `setAppendTranslation()` |
| 9e | `auto-translate` | any language other than the UI locale chosen, or 9c non-empty | **Translate posts automatically?** | Off / As they appear / When I point at them → `setAutoTranslateMode()` |

UI locale and pack or post languages are separate systems (see AGENTS.md). 9a
changes only the app's interface language. Nothing in this wizard touches
starter-pack translations.

Card #9 gets one small extra link, "I'm learning a language", so a monolingual
learner can reach 9c.

### Section 4: reading and posting (B)

| # | Id | Question / help | Control → setter |
|---|---|---|---|
| 10 | `auto-refresh` | **Load new posts on their own?** Off keeps your place while you read. | Toggle, recommend off → `setAutoRefreshTimeline()` |
| 11 | `posting-pace` | **How careful should posting be?** | Post right away / Ask "are you sure?" / Wait 30 seconds so I can cancel / Save to drafts first → mutually exclusive: `setConfirmBeforePost`, `setDelayedSend`, `setThoughtfulPosting` (the others off) |
| 12 | `alt-text` | **Require a description on every image?** It helps people who can't see pictures. | Toggle → `setRequireAltText()` |

On #11, if the user's current prefs have more than one of the three on (this is
possible today), preselect the strongest one: thoughtful > delayed > confirm.
Applying the choice normalizes them to at most one.

### Section 5: the rest of this account (A / S)

| # | Id | Scope | Shown when | Question / help | Control → setter |
|---|---|---|---|---|---|
| 14 | `visibility` | S | M | **Who sees your posts by default?** You can change it on each post. | Public / Quiet public / Followers only → privacy `privacy`. Preselect Followers only if #1 = Yes and the server value is still Public; otherwise the server value. |
| 15 | `post-language` | S | M and ≥2 languages known | **What language do you usually post in?** | Single pick from known languages → privacy `language` |
| 16 | `content-warnings` | A | all | **Open content warnings for people you follow?** Warnings from strangers stay closed. | Only people I pick / Everyone I follow / Everyone I follow and what they boost / Keep them all closed → `TrustedAccounts.setLevel()` |
| 17 | `networks` | A | ≥2 providers connected for this account | **Which networks go in your Home feed?** | One chip per provider → `hiddenProviders` via `toggleProvider()` |
| 18 | `connect` | — | fewer than 2 networks connected, and the relevant `connector-*` flag on | **Also read Bluesky (or Mastodon) here?** | Action card: "Connect" goes to `/settings/connections` and closes the wizard with progress saved; "Not now" = Skip |
| 19 | `find-people` | — | the account follows nobody (the same "empty" test Home uses) | **Follow a few people to fill your feed?** | Action card: "Show me starter packs" goes to `/bundled-starter-kits` (progress saved) |

Cards 18 and 19 have no setting. They count as answered when either button is
pressed.

### Section 6: Mawkingbird Plus (flag `mawkingbird-plus` only)

The Plus card is app-wide: it's shown once per browser, not once per account.

| # | Id | Content |
|---|---|---|
| 20 | `plus` | **Mawkingbird Plus.** Your feeds, lists and settings on every device, plus better connections to other websites, like RSS feeds and reading articles here. List the benefit rows from `visiblePlusBenefits()` (title + `plus` text only). Buttons: **Set up Plus** → `/settings/mawkingbird-plus` (finishes the wizard), **See plans** → `/plans`, **Maybe later** → Done. If the user already has Plus, replace the body with "You're a Plus member. Thank you!" and a link to its settings. |

Take the benefit text from `plus-benefits.ts`, not new prose. That file exists
because hand-written Plus copy drifted and stopped being accurate.

### Done card

"**You're all set.** Change any of this in Settings, or run Onboarding again
from the … menu." One button: **Close**.

### Path lengths (sanity check)

- New Mastodon user, one language, not pseudonymous: 1, 2–8, 9, 9b, 10–14, 16,
  18, 19, 20 → about **19**.
- Pseudonymous multilingual learner on Mastodon: about **27**.
- Second account in the same browser: about **5–8**.
- Anonymous: 2–13 (with branches), 16, 18, 19, 20 → about **17**.

## State

Two new localStorage keys. Register both in `storage-registry.ts`; `make
storage` fails otherwise.

| Key | Suffix | Sensitivity | Shape |
|---|---|---|---|
| `mockingbird_onboarding_app` | `none` | `setting` | `{ version: 1, answered: string[], completed: boolean }`: app-wide card ids that were Next'd or Skipped. `completed` is set once every app-wide card in a run is answered, or on Done; later accounts then skip the app-wide sections. |
| `mockingbird_onboarding_account` | `account` | `setting` | `{ version: 1, pending: boolean, answered: string[], finished: boolean }` |

- A card counts as done when its id is in `answered`, whether by Next or Skip.
  Quit saves nothing about the current card.
- `pending` is set by the triggers above and cleared when the wizard first
  opens for that account. Quitting doesn't re-arm auto-start; the menu entry
  resumes instead.
- `finished` is set on Done, and on Plus "Set up Plus".
- `version` lets future question sets add cards. New card ids not yet in
  `answered` can later be offered through the menu entry. Don't re-trigger
  auto-start for them in v1.
- Both keys are `setting`, not `private`: they record which questions were
  asked, never the answers (the answers already live in their own keys). If
  someone imports a settings file, their app-wide questions are considered
  answered, which is correct, because the file brought the answers.
- The app key is named `_app`, not bare `mockingbird_onboarding`, so neither
  base is a prefix of the other.
- Portable config only carries `suffix: 'none'` keys, so the account key never
  leaves the browser. The app key travels with settings.
- Account records use the `_anonymous` suffix for Anon, and aren't written at
  all when signed out (no scope).

## Architecture

- Directory `src/app/onboarding/`, as built:
  - `onboarding-store.ts`: the two keys and `markOnboardingPending(scope)`. No
    Angular. It's the only onboarding module imported by always-loaded code
    (`Auth`, `BlueskySession`, via the launcher).
  - `onboarding-launcher.ts`: a root service holding whether the card is open
    (`auto` or `menu`), plus the Home-only auto-open check. Eager, and tiny.
  - `onboarding-questions.ts`: the catalogue as **data** (id, scope,
    `when(ctx)`, copy, control, `read`, optional `suggest`, `apply`). Adding
    a question means adding a row.
  - `onboarding-flow.ts`: a DOM-free run of the wizard (card list, resume,
    Next/Skip/Back, progress, saving). It's unit-tested directly.
  - `onboarding-server.ts`: `verify_credentials` once, then one-field
    `Api.updateCredentials` writes with the same form keys as Settings →
    Privacy. It's optimistic and reverts on failure.
  - `onboarding-card.ts|html|css`: the floating card. The controls (tiles,
    chips, switch, swatches) are inline in its template, not a separate
    directory.
- `suggest` is a preselection that differs from the current setting, for
  example "approve followers" for a pseudonymous account. It's applied when
  the user presses Next, never silently.
- **Bundle budget.** The card is loaded with a dynamic `import()` and
  `NgComponentOutlet` when the launcher opens it. It isn't loaded with
  `@defer`, because `@defer` makes `Shell`'s metadata asynchronous and breaks
  every synchronous `TestBed.createComponent(Shell)`. Verify with
  `npm run build:mockingbird`.
- **Shell integration.** The card sits in `shell.html` and is suppressed while
  `firstRun()` is true. The auto-open check runs on every `NavigationEnd`. The
  … menu entry is a button under Settings that closes the menu and opens the
  card.
- **No extra network traffic.** Reading current values uses signals and caches
  already loaded. The only request the wizard may add is one
  `verify_credentials` (or reuse of the Privacy page's load) when a Mastodon
  server card is shown, plus the PATCH on change. No polling.

## i18n

- Wizard copy lives in `src/app/onboarding/` as plain English strings. **Don't**
  add `// i18n` comments or transloco keys, and **don't** add the directory to
  `MIGRATED` in `scripts/check-i18n.mjs`.
- `shell` *is* a migrated directory, so the one menu label must be a key:
  `// i18n shell.menu.onboarding: Onboarding`, then `make i18n-extract`. That's
  the only i18n change.
- Add a header comment to `onboarding-questions.ts` saying the English-only
  status is deliberate. When `check-i18n` inverts to an EXEMPT list
  (ui-i18n-5), `onboarding` must be listed there until the feature settles.

## Out of scope for v1

- Custom post noun text, custom colours, reader typography, RSS, blog
  connectors, filters, muted words, bulk moderation, PKM vocabulary, publish
  wizard steps.
- A bot-account question.
- Bluesky-side server settings (Bluesky has no locked or discoverable
  equivalent here).
- Translating the wizard.
- Analytics events for wizard funnel steps. Don't add any without the owner's
  approval, because Analytics is itself a question in the wizard.

## Tests

Colocated `*.spec.ts`, targeted during development, then the full `cd ui &&
make test`. Don't skip or weaken existing tests, and keep the test inventory
checks passing.

- **State:**
  - App-wide answers persist across accounts, so a second account sees no
    app-wide cards.
  - Per-account answers are isolated.
  - Resume lands on the first unanswered visible card.
  - Quit saves progress but not the current card.
- **Triggers:**
  - The pending flag is set by each of the three entry points.
  - The card opens only on `/home`.
  - It's suppressed while the first-run modal is up.
  - Existing accounts without a pending flag never auto-open.
- **Buttons:**
  - Next keeps the applied value.
  - Skip reverts a change made on that card.
  - Back keeps the value.
- **Branching:**
  - Pseudonymous yes/no opens or closes 1a–1d.
  - Server cards are hidden on Bluesky and Anon.
  - Language branches follow the rules in section 3.
  - The progress total updates.
- **Plus:**
  - Absent when the flag is off.
  - Uses `visiblePlusBenefits()`.
  - Shows the member variant for subscribers.
- **Server cards:**
  - Send a PATCH with only the changed field.
  - Revert with the one-line error on failure (mirror `settings-privacy.spec.ts`).
- **Posting pace:** results in at most one of confirm, delayed or thoughtful.
- **Layout:** no horizontal overflow at 320, 390, 800 and 1280px. Check in a
  browser as well as with unit tests.
- `make storage` and `make i18n` pass. `npm run build:mockingbird` passes with
  no new eager chunk in the initial bundle.

## Acceptance criteria

1. A new Mastodon sign-in lands on Home with the card open at "Is this a
   pseudonymous account?".
2. Choosing Dark on the theme card turns the app dark behind the card
   immediately.
3. Quit, then … → Onboarding, resumes at the same card.
4. Signing in a second account shows only that account's cards.
5. Choosing two known languages shows the learning and auto-translate
   follow-ups. Choosing one language doesn't.
6. With `mawkingbird-plus` off, the last card before Done is not the Plus card.
7. Existing users who were signed in before the release see nothing until they
   choose it from the menu.

### Tour choice wording (2026-10)

AI visibility and page-view counting are configured in Settings, outside the tour.
Zen mode presents the choice between less clutter and keeping shortcuts visible.
Other feature choices name the cost as well as the benefit: follower approval
adds waiting, reduced discovery limits reach, privacy cleanup removes referral
and location details, reminders add a step, language filtering reduces discovery,
translations add text or replace originals, image descriptions require writing,
and opening warnings exposes sensitive content. Appearance and language identity
questions remain personal preferences, rather than claims that one answer is better.
