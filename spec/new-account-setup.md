# New Mastodon account setup

Status: sprint 1 built 2026-11-18 (see the sprint file for progress). Sprint plan:
[sprint/new-account-2026-11.md](sprint/new-account-2026-11.md).

Two deliverables:

1. **Account setup**: a full-page, low-distraction wizard. It catches a person
   who has **just created a Mastodon account** and walks them through making
   it usable: profile, who can find them, a Home feed with people in it, and a
   first post in their own words.
2. **`/create-mastodon-account/`**: a public SEO landing page for "I want to
   create a Mastodon account". It answers the question and lets the reader pick
   a big, open server in their language. Its button starts the sign-up, which
   returns into (1).

This is **not** the Mawkingbird onboarding wizard
([onboarding-wizard.md](onboarding-wizard.md)). That one is a floating card
that tunes Mawkingbird for people who already have an account. This one is for
an account that is minutes old. The two interact as described under
[Relationship to the onboarding card](#relationship-to-the-onboarding-card).

## Why now

Since Mastodon 5.0, `/oauth/authorize` accepts `prompt=create`. The server
shows its own sign-up form, then finishes the authorization and redirects back
to the app signed in. Mawkingbird already sends this parameter
(`Login.startOAuth(create = true)` in
`ui/src/app/accounts/sign-in/login/login.ts`, with detection in
`ui/src/app/unbird/signup-support.ts`). Today the person lands on an empty Home
with the floating settings card asking "Is this a pseudonymous account?". That
is the wrong first moment for someone who has never posted.

## Decisions (owner, 2026-11-18)

| Topic | Decision |
|---|---|
| Presentation | Full page. Rails, main menu, … menu and mode switcher are all hidden; only the logo shows. A low-key **Exit setup** text link is always visible, so nobody is trapped. |
| What it is | An alternative UI for the account-info parts of Settings (**Public profile**, **Privacy**, **Account**). Steps call the same setters and services those pages use. No parallel implementation. |
| Old floating card | **Absorb and suppress.** Setup covers the day-one cards (pseudonymity, discoverable, locked, default visibility, post language, languages, find people), marks them answered, and the floating card never auto-opens for that account. The rest stays under … → Onboarding. |
| Steps | Profile · Who can find you · Fill the feed · Intro post, plus purpose, languages, movers and done (see [Steps](#steps)). Every step is skippable. |
| Privacy copy | Be honest that most privacy settings cut follower count and interaction sharply. Name the cost on each card; don't scare and don't hide it. |
| Fill the feed | Interests → people. Finding people is the hard part, other than starter packs. Per-person Follow plus "Follow all" per interest, a soft target with a counter, never required. |
| Intro post | **No template.** A blank composer, in their own voice. Prompt questions above it (topics, rough location). Advice: add hashtags for what they'll write about, because people decide whom to follow by what they write. "Everyone is a content creator." After posting, offer to pin. |
| Exit | Exit lands on Home. Resume lives in **Settings**, as an entry on the account-info pages. No Home banner and no nagging. |
| Nth account | Ask the account's **purpose**, offer to **copy from another** signed-in account, take the **shorter path** (skip app-wide and explanatory steps). |
| Movers | One question: "Were you on Twitter or Bluesky?" Twitter → Unbird people matching; Bluesky → the Bluesky ⇄ Mastodon finder. |
| Pending accounts | Do what's possible now (local steps), show a calm waiting state, and resume the server steps once the account works. |
| SEO page | An interactive focused page at `/create-mastodon-account/`. It steers people to **big, open, general servers grouped by language**, 3–5 per language. Small and special-interest servers are for alts. "Pick another server" is the escape hatch. Never show the whole directory. |
| Server list | A **reviewed snapshot**: a script proposes the list from the joinmastodon.org directory, the owner reviews it, and it's committed as JSON. The page live-checks sign-up state and version. |
| Alt server choice | Purpose first. When an existing user adds an account, "What's this account for?" comes before the server step. Topic or alt accounts see special-interest servers; main or pseudonymous accounts see the big general ones. |
| Analytics | GoatCounter, lossy is fine. Every step is its **own route path** so the existing router-driven counter sees it. No new event API. |
| Native | Web first. Native gets the wizard only through account-age detection; native `prompt=create` is later work. |
| Slug | `/create-mastodon-account/` |

## Unverified: check against a real Mastodon 5.0 server first

The Unbird sprint built the `prompt=create` round trip, but **nobody has done a
real sign-up through it yet** (spec/sprint/unbird-2026-11.md). Sprint 1 starts
with a canary sign-up on a real 5.0+ server that has open registrations, and
records what actually happens for:

1. **Email confirmation.** Does the redirect happen before confirmation, after
   it, or only from the confirmation link (new tab)? The localStorage copy of
   the OAuth record (`mockingbird_oauth_signup`, two-hour expiry) assumes the
   new-tab case.
2. **Approval-required servers.** Does the redirect happen at all? If a token
   is issued, what does `GET /api/v1/accounts/verify_credentials` return?
   Expected: 403 with "Your login is currently pending approval", but this
   isn't verified.
3. **`created_at` precision.** Mastodon is believed to truncate
   `account.created_at` to midnight UTC. The fallback detection below assumes
   date precision only.
4. **What the server's own web UI does at the same moment.** Mastodon has its
   own onboarding. If both run, say so in the first card ("You can ignore the
   setup on your server's site").

Write the findings into this file under "Canary findings" before building on
them. If any answer contradicts the design below, stop and ask the owner.

## Detection: when setup starts

Setup is **armed** for an account by either of:

1. **Sign-up flag.** `startOAuth(true)` writes `created: true` into the pending
   OAuth record (`StoredApp`, both the sessionStorage and the shared
   localStorage copy). `handleOAuthCallback` passes it on. After a successful
   `Auth.setToken` + verification, the account's setup record is set to
   `armed`.
2. **Young, empty account (fallback).** Arming happens at the moment
   onboarding-pending is armed today (a new session's first verification, see
   onboarding-wizard.md § Triggers), and only when **all** of these are true:
   - `created_at` is within the last 2 days (date precision, so this is at most
     about 72 hours),
   - `statuses_count === 0`,
   - `following_count === 0`.

   This catches older servers (the welcome-back path), accounts made on
   joinmastodon.org, and Native.

Never arm for re-authorization, account switching or boot-time re-verification:
the same exclusions as the onboarding card.

### Where the callback goes

- Armed, with no explicit `next` → navigate to `/setup` (the first step for
  this account).
- Armed, with an explicit `next` → **still `/setup`** (owner, 2026-11-18).
  Sign-ups always land in setup. A sign-up that began in Unbird is recorded as
  `hint: 'twitter'`, and the movers step preselects Twitter, because setup
  carries Unbird's people matching.
- When setup is armed, the onboarding card's `pending` is **not** set for that
  account (suppression, see below).

## Route and shell

- `/setup` redirects to the first unfinished step. Each step is
  `/setup/<step-id>`, for example `/setup/profile` and `/setup/follow`.
  GoatCounter's `sanitizePath` keeps these paths (it drops queries and only
  redacts known ID collections), so the funnel is readable with no new code.
- Its own layout, outside the main shell's chrome:
  - Top bar: logo (not a link out of setup, to avoid accidental exits) and on
    the right **Exit setup** as a muted text link.
  - Body: one step, centred, max about 640px wide, 16px gutter on phones, no
    horizontal scroll at 320px.
  - Footer: **Back** · **Skip** · **Next** (primary). Progress "Step 3 of 7"
    with a thin bar, recomputed as branches open or close.
- Guard: needs a signed-in Mastodon account. Anonymous or Bluesky → redirect to
  `/home`. Signing out or switching account mid-setup leaves setup.
- Lazy-loaded route. Nothing from setup goes into the initial bundle except the
  tiny store used by the arming hooks (same pattern as
  `onboarding/onboarding-store.ts`).
- **Exit setup** navigates to `/home`. State is saved. Nothing else happens:
  no toast, no banner.

### Resume entry in Settings

On **Settings → Public profile** (and Privacy), the account-info pages, add a
small row at the top while the account's setup isn't `finished`:
"**Set up this account step by step** →". It links to `/setup`. Once finished,
the row reads "Run account setup again" and moves to the bottom of the page.

## Steps

Ids are stable: they're the route segments and the analytics paths.
**First** means the first account on this browser (app-wide onboarding not
completed). **Nth** means any later account.

| # | Id | Shown | Purpose |
|---|---|---|---|
| 1 | `welcome` | First: yes. Nth: merged into `purpose`. | "You're **@name@server**." Copy-handle button. One sentence: this is how people find and mention you. If the server has its own onboarding, one line saying it's optional. |
| 2 | `purpose` | Always | **What's this account for?** Me · A pseudonym · A project or organization · A topic or alt account. All four on every account: even a first Mawkingbird account may be someone's second Mastodon account. Drives defaults below. Replaces the old `pseudonymous` card. |
| 3 | `profile` | Always | Display name, picture and bio (as built: header and profile links stay in Settings, to keep the step short). Bio help: "Say what you'll post about. People decide whether to follow from this." Nth (not pseudonym): "Copy from @other" button that prefills fields; nothing is saved until Next. |
| 4 | `languages` | First only | Languages you read (chips, prefilled from the browser), plus "What language will you mostly post in?" when more than one. Writes app-wide known languages and the server `language`. Absorbs old cards 9 and 15. |
| 5 | `findable` | Always | Who can find you. See [Findable step](#findable-step). |
| 6 | `movers` | Always (Nth: skipped if purpose is pseudonym) | **Were you on Twitter or Bluesky?** Twitter · Bluesky · Neither. Opens 6a or 6b. |
| 6a | `twitter` | movers = Twitter | Embedded Unbird archive drop and people matching (the Unbird people component, not a link out). "No archive yet?" explains how to request one, and offers to continue setup and come back to it in Unbird. |
| 6b | `bluesky` | movers = Bluesky | The Bluesky ⇄ Mastodon finder (`bridge-friends-import`, direction fixed to Bluesky → Mastodon). |
| 7 | `follow` | Always | Fill the feed. See [Follow step](#follow-step). |
| 8 | `intro` | Always | First post. See [Intro step](#intro-step). |
| 9 | `done` | Always | "Your Home feed is ready." Button **Go to Home**. One line: "Change any of this in Settings → Public profile." Marks setup finished. |

Path lengths: first account about 9 screens; Nth account about 6.

### Purpose-driven defaults

| Purpose | Defaults (pre-selected, applied only on Next) |
|---|---|
| Me | Discoverable on, search-engine indexing on, approve followers off, default visibility Public. |
| Pseudonym | Also turns on Pseudonymity (`Pseudonymity.setEnabled`) and its clean-links/media default. Findable step pre-selects **approve followers on** and **hide from search engines**, with their costs shown. No "copy from" offers anywhere. Movers step skipped. |
| Project or organization | Like Me. Bio help mentions linking the website. The Mastodon "bot" flag isn't offered (out of scope). |
| Topic or alt | Like Me. Follow step leads with the interest the person names. "Copy follows" offered. |

### Findable step

One screen, four controls, each with the cost named in one plain line. Copy
direction (final wording in sprint 2):

- **Show me in suggestions and the directory** (`discoverable`). Off: "Far
  fewer people will find you. Most new follows come from here."
- **Let people find my public posts by their words** (`indexable`). This is
  Mastodon's full-text search on servers that offer it, **not** search
  engines: the API has no search-engine (noindex) switch, so setup doesn't
  offer one. Off: "your posts are found only by hashtag".
- **Approve each follower myself** (`locked`). On: "Most people won't wait to
  be approved. Expect far fewer followers and less interaction."
- **Who sees your posts by default** (`source.privacy`): Public · Quiet public ·
  Followers only. Not Public: "Posts that only followers see can't be found or
  boosted. A new account has no followers yet, so almost nobody will see them."

Writes go through the same code as Settings → Privacy (`onboarding-server.ts`
already wraps one-field `updateCredentials` with optimistic revert). Read the
current values first; never assume server defaults.

### Follow step

Goal: a Home feed with posts in it on arrival. Never required.

1. **Pick interests.** Chips for the topics that have starter material in the
   person's languages (`discovery/starter-catalog.generated.json`, the Feed
   Builder topics, and bundled starter kits). Order the chips by how much
   material each has in those languages. "Search for something else" is a free
   text box using the existing interest search.
2. **People per interest.** For each chosen interest, a section with 6–12
   people from the matching kits, merged with the server's own suggestions
   (`Api.followSuggestions`, `/api/v2/suggestions`) where they fit. Each person
   gets an avatar, name, one line of bio and a **Follow** button. Each section
   gets **Follow all N**, with undo.
3. **Also follow the hashtag** toggle per interest (`Api.followTag`), on by
   default.
4. Counter: "12 followed. About 20 makes a lively Home." It's text, not a
   progress gate.
5. Nth account (not pseudonym): a collapsed **Copy from @other** section. It
   lists the other signed-in Mastodon account's follows and followed tags,
   all unchecked, with select-all. It follows the checked ones via the same
   bulk-follow path the starter kits use (rate-limit aware).
6. Twitter or Bluesky follows made in 6a or 6b count toward the counter.

Reuse the bulk-follow machinery from starter kits and Unbird. Don't write a
third follow queue.

### Intro step

- A blank composer with the same `Compose` component as Write, in a minimal
  configuration. It counts toward the server's character limit and attachments
  are allowed. **No prefilled text.**
- Above it, three quiet prompt questions that are **not inserted** into the
  text:
  - What will you post about?
  - Roughly where are you? (A city, region or country is plenty.)
  - Anything people should know before following you?
- Advice block beside or below it, in two sentences:
  - "People decide whom to follow by what they write, so you're a writer
    here."
  - "Add hashtags for the subjects you'll post about. Many people also follow
    #introduction to welcome newcomers."

  Show the person's interest tags from the follow step as **tap-to-insert**
  chips. Nothing is added unless they tap it. **No `#introduction` chip**: it
  appears only in the advice text.
- **Post** publishes with the account's default visibility as chosen on the
  findable step. If that isn't Public, one line warns that an intro only
  followers can see reaches almost nobody, with a one-tap "post this one
  publicly".
- After success: "Pin it to your profile?" **Pin** / **No thanks**. Anyone
  visiting the profile then sees who you are first.
- Pending account: Post is replaced by **Save for later**, which saves to Write
  → Drafts and shows "We'll offer to post it once your account is approved."

## Pending accounts

When verification shows the account can't act yet (pending approval or email
unconfirmed; exact signals from the canary):

- Setup opens anyway, in **waiting mode**. A single calm line at the top:
  "**server** is reviewing new accounts. You'll get an email when it's ready.
  You can get set up meanwhile."
- Steps that need the server are shown but saved locally and applied later:
  profile edits, findable settings, follows (queued), intro post (saved as a
  draft).
- Local steps run normally: purpose and languages.
- On the next app start where verification succeeds, a one-time screen at
  `/setup/ready` says "Your account is approved". It applies the queued
  profile, settings and follows, showing what was applied, then offers the
  saved intro.
- Queued items expire after 30 days. Queued data is per account in the setup
  store, as `private` sensitivity, because it holds draft profile text.

## Relationship to the onboarding card

- When setup is armed for an account, the onboarding card's account `pending`
  flag isn't set, so the floating card never auto-opens for it.
- When setup finishes or exits, the account's onboarding record gets these card
  ids in `answered`, only when the setup step was shown: `pseudonymous` and its
  `pa-*` follow-ups (from purpose and findable), `pa-discoverable`,
  `pa-locked`, `visibility`, `post-language`, `find-people`.
- The app-wide `languages` card is marked answered in the app record only when
  the setup `languages` step was answered.
- The card's remaining questions (theme, posting pace, alt text and so on)
  stay available under … → Onboarding. There's no auto-start for them on a
  setup account. This was the owner's choice: the day-one path stays short.
- No change to onboarding-wizard.md behaviour for any other account.

## State

One new localStorage key, registered in `storage-registry.ts` (`make storage`
fails otherwise):

| Key | Suffix | Sensitivity | Shape |
|---|---|---|---|
| `mockingbird_account_setup` | `account` | `private` | `{ version: 1, state: 'armed' \| 'running' \| 'finished', source: 'signup' \| 'young', answered: string[], purpose?: string, queued?: { profile?, settings?, follows?: string[], expires: number } }` |

- `private`, not `setting`: `queued` holds unsent profile text, and it should
  never travel in a settings export.
- `mockingbird_` prefix as everywhere (storage keys must stay stable; the brand
  name doesn't change them).
- `StoredApp.created?: boolean` is added to the existing OAuth record. Update
  that key's storage-registry note.

## Purpose first in Add account

In `/login/mastodon?intent=need`, when the person **already has** at least one
Mawkingbird account in this browser, show **What's this account for?** before
the server step (same choices as the purpose step). The answer:

- Main or pseudonym → the same big general servers in their language as the
  SEO page.
- Topic, alt, project → special-interest servers from the joinmastodon.org
  directory (`discovery/mastodon-servers.ts`) by category, open registrations
  first, plus the full search.
- Is stored in the pending OAuth record and prefilled into the setup `purpose`
  step.

First-time sign-ups (no account in the browser) skip this question and get the
big general list.

## SEO page: `/create-mastodon-account/`

A focused public page (ops/engineering/seo.md § Focused mini-apps). Unlike the
existing tools, its interactive part is **for signed-out visitors**.

### Search intent

"create mastodon account", "how to create a mastodon account", "mastodon sign
up", "join mastodon", "how to join mastodon". One page per intent: the help
guide `docs/new-to-mastodon/create-an-account.md` becomes the step-by-step
reference that links here, not a competitor (sprint 6).

### Content (prerendered, complete without JavaScript)

1. **H1:** "Create a Mastodon account". One paragraph that answers the
   question right away: pick a server, sign up there (free, with email and a
   password), and your handle is `@name@server`.
2. **Choose a server** (the interactive chooser, below), with a short why:
   - Start on a big general server in your language. It's well run, easy to
     find people from, and unlikely to disappear.
   - Topic and small servers are great for a second account.

   No "you can move later" line, and no other reassurance or warning text.
   People are adults (owner).
3. **What happens when you sign up:** username, email confirmation, rules,
   and possible approval. "Servers on Mastodon 5 send you straight back here
   signed in, and we'll help you set up."
4. **After you sign up:** profile, follow people, introduce yourself. Three
   bullets that preview setup.
5. **Questions:** Is it free? Do I need a phone number? Is there a minimum
   age? Can I use the official app too? Can I have more than one account? Every
   fact here must be verified and dated (house rule). Leave out any row that
   can't be verified.

House rules apply: call it Twitter, never X; lead with getting started, not
with tools.

### Chooser

- Language select, defaulting to the browser's first language that has a list,
  else English.
- 3–5 server cards for that language: name, one-line description from the
  directory, rough active users ("about 40,000 active"), link to rules, and
  **Create an account on {server}**.
- On click (signed out): go to `/create-mastodon-account/go/<server>` (a
  counted route), which live-probes with `probeSignup`:
  - 5.0+ with open sign-ups → `startOAuth(true)` against that server. The
    OAuth code moves into a small service the login page and this page share;
    don't navigate through `/login` visibly.
  - Older server → the existing welcome-back path.
  - Closed or approval-required (state changed since the snapshot) → back to
    the chooser with one line saying so, and that card disabled.
- **Pick another server** → the existing `server-picker` combo, which accepts
  any server, with the warning that small servers suit second accounts.
- Signed-in visitor: the same page; the button reads **Create another
  account**, and it goes through Add account with purpose first.

### Server snapshot

- `ui/scripts/refresh-signup-servers.mjs` fetches
  `https://api.joinmastodon.org/servers` (already used by
  `discovery/mastodon-servers.ts`) and proposes, per language:
  - category general,
  - registrations open, recording whether approval is required. Approval
    servers are **hidden by default** behind a "Show servers that review new
    accounts" toggle on the chooser,
  - sorted by `last_week_users`,
  - top 5, recording `version` and `last_week_users`.

  It writes `ui/src/app/public-pages/create-account/signup-servers.json`
  with a `checkedOn` date and prints a diff against the committed file.
- The owner reviews and commits. Document the refresh in
  `ops/engineering/seo.md` under the new page's section, quarterly or when a
  listed server closes sign-ups.
- Languages offered are only those with at least 2 qualifying servers.
  Others fall back to "Pick another server".

### SEO wiring (keep in sync, per seo.md)

`focused-tools.json` entry (needs a `signIn: 'none'` variant, or equivalent,
for a signed-out tool), route, prerender table in `main.server.ts`,
`ui/public/sitemap.xml`, the `pages` list in `scripts/check-seo-build.mjs`,
`/tools/` listing, `/features/`, links from `docs/index.md`,
`docs/new-to-mastodon/*`, `/for/twitter-exodus/` and the login "I need an
account" path. English only: no translated variants until the per-family
indexing data says so (inbound_info_seo.md § Pace).

## Analytics (GoatCounter)

The router-driven counter already records each path. The funnel is therefore
just paths, and needs no new events:

| Funnel point | Path |
|---|---|
| Landing | `/create-mastodon-account/` |
| Chose a server | `/create-mastodon-account/go/<server>`. Check that `sanitizePath` keeps a server domain. If it shouldn't, by privacy reasoning similar to `tags`, add `go` to its id list and accept the loss. |
| Back from sign-up | `/setup/welcome` (every first account starts here, whichever way it was armed; Nth accounts start at `/setup/purpose`) |
| Each step | `/setup/<step>` |
| Finished | `/setup/done` |

The existing analytics opt-out is respected. Don't record answers.

## Out of scope

- Native `prompt=create`. Native gets setup through young-account detection
  only.
- The bot flag, account migration tools, 2FA setup (it's done on the server's
  site; at most a link in `done` later).
- Translating setup copy. **English only until the whole feature settles**,
  then i18n is done as one pass. No `// i18n` keys in `accounts/setup`. The one
  exception is any string in an already-migrated directory (for example the
  Settings entry), which needs a key.
- Bluesky account creation.
- A Home banner or any reminder after Exit.

## Owner answers (2026-11-18)

1. Sign-ups **always** return to setup, including from Unbird. Unbird is
   integrated into setup through the Twitter step.
2. Ask purpose on the first account too, with all four choices.
3. No `#introduction` chip.
4. No "you can move later": it's scare text.
5. Approval-required big servers are in the snapshot, hidden by default behind
   a toggle.
6. English only until the feature settles.

## Canary findings

_(Sprint 1, task 0. Fill in before building on the detection and pending
design.)_
