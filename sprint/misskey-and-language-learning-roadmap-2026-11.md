# Misskey-first, translate-as-you-go and language-learner roadmap (2026-11)

Status: owner decisions recorded 2026-11-09. **M0 and M1 code complete
2026-11-09, live trial not run** (`test_plans/misskey-m1-sign-in-and-read.md`);
see "M0/M1 progress" at the end. Everything else is not started.

Three goals, one reader in mind: someone who signs in to a Japanese Misskey
server, does not read Japanese, and wants to start learning it from the feed.

1. **Misskey-first.** Sign in *as* a Misskey account (like the Bluesky-first
   identity), not only as a connector under a Mastodon account.
2. **"I don't speak this."** Translation everywhere and automatically, including
   paid AI, with costs the reader can see and limit.
3. **"I am learning this."** Look up a word by tapping it; turn the feed into
   flashcards.

Goals 2 and 3 work on every network. Misskey is where the Japanese content is,
but nothing in phases B and C may depend on Misskey.

## What exists today (reuse, don't rebuild)

| Area | Where | Notes |
| --- | --- | --- |
| Second first-class network | `providers/bluesky/*`, `auth.ts` (`AccountKind = 'mastodon' \| 'bluesky' \| 'anonymous'`) | The template for Misskey. Adapter maps network posts to Mastodon-shaped `Status`. Cost: `kind() === 'bluesky'` appears **90 times in 37 files**. |
| Provider caps | `providers/provider.ts` (`PROVIDER_CAPS`, `serverKnowsStatus`) | Add `misskey` to `ProviderId`. |
| Translation chain | `translation/` (router, engines, pair catalogue, source resolver) | Server → Browser → MyMemory → Apertium → OpenRouter. Done 2026-11-08; live checks not run yet. |
| AI | `providers/openrouter/*`, `ai-translate.ts` | Bring-your-own OpenRouter key (PKCE). Mawkingbird does not pay for any AI today. |
| Budgets | `translation-usage.ts` | Daily soft/hard limits per engine, counted in **calls or characters**, not dollars. |
| Learner mode | `client-prefs.ts` `learningLanguages`, `appendTranslation`; onboarding questions | Learning languages are auto-translated, never hidden, and shown original + translation. |
| Dictionary | Reader "Define" (`readerDictionary`, custom `{word}` template) | Opens an external site in the reader only. No in-feed word tap. |
| Language detection | `language-detect.ts`, `language-detection/` | Needed everywhere for Misskey (see below). |

### Reference folders

- `REFERENCE/misskey` is Misskey **2026.11.0-beta.1** source (backend, frontend,
  `misskey-js`). It is **AGPL-3.0**: read it for API facts, never copy code from
  it into the client. `misskey-js` and `mfm-js` on npm are MIT and may be used.
- `REFERENCE/client-build-mock` is a Vite/Vue dev harness that imitates
  Misskey's SSR page shell. It is **not an API mock** and is of no use to us.
  Tests need our own Misskey fixtures (and maybe a mock server; see questions).

## Misskey API facts that shape the plan (verified in the reference source)

- **Every call is `POST /api/<endpoint>`** with a JSON body; the token goes in
  the body as `i` (or `Authorization: Bearer`). No REST resources.
- **CORS is `origin: '*'`** on `/api` (`ApiServerService.ts`). The browser
  calls the server directly; no CORS proxy, no Plus proxy. Drive uploads go
  browser → server (house rule: no media through the proxy).
- **Sign-in, two options:**
  - **MiAuth**: open `https://host/miauth/<uuid>?name=…&icon=…&callback=…&permission=read:account,write:notes,…`,
    then `POST /api/miauth/<uuid>/check` returns the token. No app
    registration; works on every Misskey version and most forks. Recommended
    first.
  - **OAuth 2.0 (IndieAuth style)**: `client_id` must be an HTTPS URL whose page
    publishes an `h-app` microformat or a client-metadata JSON listing the
    `redirect_uri`s (`OAuth2ProviderService.ts`). Needs a static page on
    mawkingbird.com and is newer-server-only. Later.
- **Notes have no language field.** Detection decides everything. Kana makes
  Japanese easy; kanji-only short notes (Japanese vs Chinese) are the hard case.
- **Server translation**: `notes/translate {noteId, targetLang}` uses the
  server's DeepL key; free for the reader. Fails with `UNAVAILABLE` if the
  admin set no key or the role policy `canUseTranslator` is off. It translates
  `cw + "\n-----\n" + text` as one string, so the result must be split back.
- **Misskey-only concepts**: emoji reactions (custom server emoji), MFM markup
  (`$[x2 …]`, `$[ruby 漢字 かんじ]`, mentions, emoji), visibility
  `public/home/followers/specified` plus `localOnly`, renote vs quote,
  timelines home / local / social (hybrid) / global, channels, antennas,
  clips, Drive, chat (rooms and 1:1), streaming over one WebSocket with
  channels (`main`, `homeTimeline`, `hybridTimeline`, `channel`, …).
- **Forks** (Sharkey, CherryPick, etc.) speak the same API, and some also
  expose a Mastodon API. Detect with NodeInfo `software.name`.

## Recommended order

Interleaved so there is something useful at each step: Misskey reading first
(it supplies the Japanese content), then translation, then writing, then
learner tools, then the rest of Misskey.

| # | Sprint | Phase | Why here |
| --- | --- | --- | --- |
| 1 | M0 Network seam | Misskey | Stops a third network from adding another 90 branches. |
| 2 | M1 Sign in and read | Misskey | Produces the feed every later sprint uses. |
| 3 | T1 Pervasive free translation | Translate | Biggest win for the "don't speak it" reader, no new costs. |
| 4 | T2 Paid AI translation with a dollar budget | Translate | Quality where free engines fail (slang, net-speak, kanji-only). |
| 5 | M2 Write and react | Misskey | Makes Misskey-first a real account, not a reader. |
| 5b | T3 Write in English, post in CJK | Translate | Moved up 2026-11-09: the owner will post in Japanese. |
| 6 | L1 Tap a word | Learn | First learner tool; reuses translation and detection. |
| 7 | L2 Word bank and flashcards from the feed | Learn | The headline learner feature. |
| 8 | M3 Misskey-native surfaces | Misskey | Streaming, antennas, channels, clips, search. |
| 9 | L3 Graded feed (optional) | Learn | Uses review data from L2. |
| 10 | M4 Chat and connector mode (optional) | Misskey | Parity work, lower priority. |

Ground rules for every sprint (same as the Bluesky roadmap):

- English only: `// i18n` keys and `npm run i18n:extract`, no locale pass.
- Lazy: Misskey, dictionary and flashcard code live in lazy chunks. Nothing in
  root imports or route guards; check the build size report. Do not raise the
  1 MB initial budget.
- Every new storage key goes in `storage-registry.ts` with a sensitivity.
- Third-party and model output is plain text; never `innerHTML`.
- Gates per AGENTS.md: targeted specs while working, then `cd ui && make test`,
  `npm run build:mockingbird`, `design:inventory-check`, and `make design-verify`
  only for shared widget changes. Browser gates once at the end of a sprint.
- A manual live-account test plan per sprint in `test_plans/`.

---

## Phase A: Misskey-first

### Sprint M0: network seam (refactor, no visible change)

Goal: adding a network means implementing an interface, not editing 37 files.

- Inventory the 90 `kind() === 'bluesky'` checks and group them by question
  (has a Mastodon token? where does home come from? which compose path? which
  login page? which profile URL?).
- Replace each group with a capability on a small `NetworkDescriptor` registry
  keyed by `AccountKind` (e.g. `homeSource`, `composeTarget`,
  `profileUrl(account)`, `hasMastodonToken`). Bluesky and Mastodon fill it in
  first, with **no behaviour change**; existing specs must pass untouched.
- Add `'misskey'` to `ProviderId` and `AccountKind` behind a feature flag
  (`feature-flags.ts`), with every capability off.
- Decide the client: a thin hand-written `MisskeyApi.call(endpoint, body)` with
  local types (the Bluesky precedent), plus `mfm-js` for MFM parsing.
  `misskey-js` brings typed endpoints and streaming but tracks every Misskey
  release; recommend hand-written types for the ~40 endpoints we use.
- Fixtures: capture real JSON from a public server (`notes/local-timeline`,
  `notes/show`, `users/show`, `meta`, `emojis`) into spec fixtures.

Risk: this is the riskiest sprint for regressions. It can be skipped and the
branches copied instead, at a growing cost per later feature.

### Sprint M1: sign in and read

- **Login page** `login-misskey/` and an entry in `login-chooser/`. Server
  field with suggestions; verify with NodeInfo (`misskey`, `sharkey`,
  `cherrypick`…) and `POST /api/meta`.
- **MiAuth** with a callback route (`misskey-callback/`), minimal permissions
  for reading first (`read:account`, `read:following`, `read:notifications`,
  `read:reactions`), extended in M2. Token stored like Bluesky identities
  (`misskey-identity-store.ts`), multiple identities, account switcher entries.
- **Adapter** `misskey-adapter.ts`: Note → `Status`.
  - MFM → safe HTML via `mfm-js`: text, mentions, hashtags, links, custom
    emoji, `$[ruby]` → `<ruby>`, bold/small/center. Animated `$[fn]`
    effects render as plain text (decide later whether any are worth it).
  - CW → `spoiler_text`; files (Drive) → `media_attachments` with
    `isSensitive`; poll; renote vs quote; reply.
  - **Reactions** shown as a read-only reaction bar (counts per emoji, custom
    emoji images from the note's `reactionEmojis`).
  - Custom emoji in display names.
- **Timelines**: Home, Local, Social, Global (each only if the server enables
  it in `meta.policies`), user notes, thread (`notes/conversation`,
  `notes/children`), profile, notifications, hashtag.
- Translation: none new yet; posts get the existing chain (detection handles
  the missing language tag).

Tests: adapter table tests per note shape; MFM renderer escapes everything
(an injected `<script>` appears literally); MiAuth check flow with
`HttpTestingController`; identity store classification.

### Sprint M2: write and react

- Extend MiAuth permissions (`write:notes`, `write:reactions`,
  `write:following`, `write:drive`, `write:mutes`, `write:blocks`). Existing
  identities are asked to re-authorise once.
- Compose: visibility (public / home / followers / direct), **local-only**
  switch, CW, poll, Drive upload direct to the server, reply, renote, quote,
  delete. Character limit from `meta.maxNoteTextLength`.
- **Reactions**: picker with server custom emoji (`emojis`) and Unicode;
  react / un-react; the like button maps to the server's default reaction.
- Favourites, follow / unfollow (with follow requests), mute, renote-mute,
  block, report.

### Sprint M3: Misskey-native surfaces

- **Streaming**: one WebSocket (`/streaming?i=…`), channels `main` and the
  active timeline. Honour the existing "timeline may hold a streaming
  connection" preference.
- Antennas and channels as feeds in the existing feed list; clips as
  collections; lists; trending hashtags (`hashtags/trend`); featured notes;
  search (`notes/search`, which some servers disable); announcements; a basic
  Drive browser.

### Sprint M4 (optional): chat and connector mode

- Chat rooms and 1:1 (`chat/*`) on the existing chat surface (Bluesky chat
  precedent).
- Misskey as a **connector** under a Mastodon or Anonymous account, and as a
  cross-post target.

---

## Phase B: "I don't speak this"

### Sprint T1: pervasive free translation

- **New engine `misskey`** at the head of the chain for Misskey notes:
  `notes/translate`. Free to the reader (server's DeepL). Learn
  `UNAVAILABLE` once per server per session. Split the `-----` CW joiner back
  into CW and body. Counted in `translation-usage.ts`.
- **Translate everything a reader needs, not only bodies**:
  CW, poll choices, image alt text, display names and bios, profile fields,
  channel / antenna / list names, link-card titles, notification snippets,
  and custom-emoji names in reaction tooltips (many are Japanese). Each is a
  small text unit routed through the same chain.
- **Language detection before the chain**, since Misskey has no tag. Add a
  short-text rule for kanji-only notes (Japanese vs Chinese): use the author's
  recent notes and the server's main language as tie-breakers.
- **"Translate as I scroll" on by default for a Misskey-first account whose
  UI language differs** (asked once at sign-in). Free engines only, as today.
- **Cache** translations in IndexedDB keyed by note URI + target + engine
  (federated notes repeat across servers and renotes).

### Sprint T2: AI translation with a dollar budget

- **Batching**: translate the next N visible units (e.g. 10–20 notes plus
  names) in one model call with JSON output; translate ahead of the scroll.
  Far cheaper per note than one call each.
- **Prompt for social Japanese**: keep emoji, hashtags, mentions and URLs;
  explain net-speak (草, w, 〜ンゴ) in a short note rather than translating
  literally; keep names untranslated.
- **Two quality tiers**: a cheap model for automatic translation, a better
  model on demand ("Retranslate with a better model").
- **Budget in dollars**: read the cost OpenRouter reports per call, show
  "today: $0.04 of $0.50", hard stop at the cap, then fall back to free engines.
  Extend `translation-usage.ts` with a cost field without changing its key.
- **Who pays**: the reader, through their own OpenRouter key (decided
  2026-11-09). No `mawkingbird_plus` work. Automatic AI runs only after the
  reader sets a daily dollar cap.

Rough sense of scale (to be measured, not promised): a short Japanese note is
around a hundred tokens in and fewer out, so a cheap model translating
1,000 notes a day costs on the order of cents per day; a top model costs
many times more. Images with text (OCR by a vision model) cost far more and
are excluded unless asked for.

### Sprint T3 (optional): write in English, post in Japanese

Compose in your language; the model drafts the Japanese; a back-translation
shows what it will actually say; you confirm before posting. Out of scope
unless chosen (the translation-fallback sprint deliberately excluded the
composer).

---

## Phase C: "I am learning this"

### Sprint L1: tap a word

- **Word segmentation**: `Intl.Segmenter(lang, { granularity: 'word' })` is
  built into browsers and segments Japanese, Chinese and Thai for free. Words
  in a post in a *learning* language become tappable (only then; no change for
  other readers).
- **Popup**: the word, its reading (kana), part of speech, short meanings, the
  sentence translated, and "Save word". "More" opens the existing reader
  dictionary site.
- **Data source**, one of (question 3):
  - **Free dictionary data**: JMdict (Japanese, CC BY-SA, needs attribution),
    CC-CEDICT (Chinese). Too large to bundle; build a trimmed per-language
    file fetched on first use and cached in IndexedDB. Base forms need a
    deinflector (食べた → 食べる).
  - **Wiktionary REST** (CORS, free, uneven Japanese coverage, no build step).
  - **AI gloss in context**: best for slang and ambiguous words; costs per tap
    (cached per word + sentence).
  - Recommended: dictionary first, AI on "Explain in this sentence".
- **Furigana switch**: readings above kanji, from MFM `$[ruby]` when present,
  otherwise dictionary readings (or the model). Per learning language.

### Sprint L2: word bank and flashcards from the feed

- **Word bank**: saved words with the sentence, a link to the note, the
  reading and meaning. Local (IndexedDB); synced with the existing profile
  sync if wanted (question 5).
- **"Make cards from this feed"**: takes the notes on screen (or the last day
  of a feed) in a learning language, picks words you don't have yet,
  excluding very common ones and ones you marked known, and offers a list to
  tick before cards are made. Free with dictionary data; better word choice
  with AI.
- **Card types**: word → meaning (with the source sentence); cloze (the
  sentence with the word blanked); sentence → translation.
- **Review** in the app with a spaced-repetition scheduler (FSRS, e.g. the MIT
  `ts-fsrs` package, lazy chunk). Daily review count in the menu indicator
  rules.
- **Export to Anki** as a TSV/CSV file Anki imports (free, no extra code).
  `.apkg` export needs SQLite in the browser; later, if wanted.
- Cards quote other people's posts: they stay private to the learner, with a
  link back, never published.

### Sprint L3 (optional): graded feed

Score each post by the share of its words you know (from the word bank and
reviews) and offer "easy reading" sorting or a filter for the learning
language, so the feed becomes comprehensible input.

---

## Owner decisions (2026-11-09)

| Question | Decision | Effect on the plan |
| --- | --- | --- |
| 1. Who pays for AI | **Reader's own OpenRouter key only.** | T2 needs no `mawkingbird_plus` work; drop the metered endpoint and shared server cache. |
| 2. Automatic AI | **Automatic while scrolling, under a daily dollar cap.** | Free engines first; AI batches what they cannot do; hard stop at the cap, then free engines. Replaces today's "auto = free engines only" default only when the reader has set a cap. |
| 3. Word lookup | **Dictionary data for every tap, AI on "Explain in this sentence".** | L1 builds the trimmed, lazily fetched dictionary and the deinflector. |
| 4. Flashcards | **Both: in-app FSRS review and Anki TSV export.** | L2 as written. |
| 5. Sync | **Plus feature, later.** Recorded as Phase 7 in `mawkingbird_plus_specs/PLAN.md`. | L2 stays browser-local (IndexedDB); design the store so a sync backend can be added. |
| 6, 12. Audience | **Public from day one; welcoming to all ("refederate with the world").** | Each Misskey sprint adds a help page under `docs/` (mkdocs nav, `make help-site-test`), onboarding entry and login-chooser placement. Consider a public "Misskey client in English" SEO page (ui/docs/seo.md rules). |
| 7. Forks | **Misskey only for now.** | NodeInfo check accepts `misskey`; forks get a "not supported yet" message rather than a half-working session. |
| 8. Languages | **Start with English ↔ Chinese / Japanese / Korean, both directions;** eventually every app i18n locale. | Translation and learner tools must work for a CJK speaker learning English too. L1 needs JMdict (ja), CC-CEDICT (zh) and a Korean source, plus English headwords with CJK glosses for the reverse direction. Segmentation via `Intl.Segmenter` covers all four. |
| 9. Testing | **A new `misskey_mock` server later; not now.** | Specs use captured fixtures. No `make test-integration` coverage for Misskey until the mock exists. |
| 10. Outbound | **Likely wanted** (owner expects to post in Japanese). | T3 moves up: after M2. Needs a back-translation check before posting. |

## Open questions for the owner

Questions 1–10 and 12 are answered above. Q11 (text in images) is still open.

1. **Who pays for AI translation?** Reader's own OpenRouter key (exists today),
   Mawkingbird Plus pays and meters it, or both.
2. **Automatic AI translation**: should paid AI run automatically while
   scrolling (within a dollar cap), or only on a tap, with free engines for
   automatic mode as today?
3. **Word lookup source**: bundled free dictionary, AI in context, or both.
4. **Flashcards**: review inside Mawkingbird, export to Anki, or both.
5. **Sync**: should the word bank and cards follow the reader across devices
   (Plus profile sync), or stay in the browser?
6. **Misskey-first scope**: is Misskey-first + reading + writing enough for
   the first release, or are chat and connector mode needed too?
7. **Forks**: support Sharkey / CherryPick explicitly, or Misskey only and
   forks "probably work"?
8. **Which languages for learner tools first**: Japanese only, or Japanese +
   Chinese + Korean from the start (each needs its own dictionary data)?
9. **Testing**: Misskey fixtures in specs only, or a Misskey mode for the
   mastodon-mock wheel so `make test-integration` covers Misskey too?
10. **Outbound translation (T3)**: wanted at all?
11. **Images**: translate text inside images (vision model, expensive)?
12. **Who is the user here**: you personally first (fast, rough edges OK), or
    a public feature for all Mawkingbird readers from day one (needs help
    pages under `docs/`, onboarding, SEO for "Misskey client in English")?

---

## M0/M1 progress (2026-11-09): code complete, needs a live trial

Feature flag `misskey`, default `canary` (production readers can
switch it on in Settings → Feature flags). Manual plan:
`test_plans/misskey-m1-sign-in-and-read.md`.

### M0 as built (deviates from the plan above)

The plan said to replace all 90 `=== 'bluesky'` checks with a registry. On
inspection most of them are **per-post** dispatch (`status.provider ===
'bluesky'`: which API acts on this post) or per-search-network choices, which
a third network needs its own branches for anyway, and ~40 sit in 20 locale
copies of `network-search`. Only the **account-kind** checks block a third
first-class identity. So M0 became:

- `AccountKind` gains `misskey`; `FOREIGN_PRIMARY_KINDS = ['bluesky', 'misskey']`.
- New `Auth.isForeignPrimary` ("signed in, but no Mastodon identity") and
  `Auth.isMisskeyPrimary`. Every `isBlueskyPrimary` call site that meant the
  generic case moved to `isForeignPrimary` (command bar, follow state/trust,
  home topics, Home nudges/streaming/empty state, radio, settings content,
  rail tags, server menu link, feed capability cache, aggregator, thread
  `canActOn`). Sites that really talk to Bluesky keep `isBlueskyPrimary`.
- The aggregator's "primary provider" fallback is keyed by the account kind,
  not hard-coded to Bluesky.
- `ProviderId` gains `misskey` (read-only caps; in `CLIENT_SIDE_ONLY`, so
  translate and bookmark never go to `/api/v1/statuses`).

### M1 as built

- `providers/misskey/`: wire types; `MisskeyApi` (POST `/api/<endpoint>`,
  token as `i`, `externalFetch()`, acts as **this tab's** identity, not the
  shared storage pointer); identity store (profiles `private`, tokens
  `secret`, keyed `<origin>#<userId>`); MiAuth (`MisskeyAuth`: NodeInfo check
  that refuses Mastodon-family servers and Misskey forks, read-only
  permissions, single-use session check); MFM renderer on `mfm-js` 0.28.0
  (MIT, lazy chunk; `$[ruby]` → `<ruby>`, effects dropped, links only
  http(s), mentions/hashtags to the reader's server); adapter (renote vs
  quote, CW, files, polls, custom emoji, reactions); home `MisskeyProvider`
  (Home / Social / Local / Global, per-account choice).
- Account storage scope `_misskey_…`; Settings → Accounts lists and removes
  Misskey accounts; switcher and account menu ("+ Add Misskey account").
- `/login/misskey` (form and MiAuth callback), Misskey door on `/login`.
- Home: timeline toolbar, error notice with Retry / sign in again; no
  composer for Misskey accounts until M2.
- Status card: read-only reaction chips (`Status.reactions`, new optional
  field), counts shown, polls results-only, Misskey notes open in-app threads
  (`mk:` ids in `ThreadLoader`: note, parents, replies).
- Settings → Profile points to the Misskey server instead of the Mastodon
  form; Likes shows empty instead of a 401; Misskey bookmarks are
  browser-local.

### Not done in M1 (moved to an M1 follow-up)

- Misskey **profile page** and **notifications page**; author names are not
  links yet (the in-app profile reads Mastodon). Hashtag and user-notes pages.
- Help page under `docs/` and onboarding entry: deferred until the flag goes
  to `production` with M2, so the help does not describe a canary-only door.

### Gates (2026-11-09)

- Targeted specs: all pass (Misskey providers, auth, login pages, thread
  loader, status card, home, flags, vault, connections, follow trust).
- `cd ui && make test`: design inventory check and source integrity pass; all
  9,671 unit tests pass. The gate still exits red on the **runtime test
  manifest**: two tests listed in `ui/test-manifest.json` no longer exist.
  They were removed in earlier commits (`38db48c95`, `fae1a58b9`), not here,
  so the gate was already red on `main`. The protected baseline was not
  updated; `npm run test:audit:update` is the owner's call.
- `npm run build:mockingbird`: passes. Initial bundle 935.27 kB (warning
  budget 900 kB, error 1 MB). The MFM parser and adapter are in lazy chunks;
  `MisskeyApi` and the identity store are initial (Home and sign-in state need
  them). Reactions moved to `status-card/status-reactions` because
  `status-card.css` crossed its 10 kB error budget.
- i18n extract/check, storage registry check, eslint and prettier on changed
  files: pass.
- Not run: `make design-verify` (no shared widget changed), the SEO suites
  (no public page changed), `make test-integration` (no Misskey mock yet), and
  the manual live test plan.

---

## T1 progress (2026-11-09): code complete, needs a live trial

Manual plan: `test_plans/misskey-t1-translation.md`.

### Fixes from the owner's first live try (same day)

- The Misskey door was invisible on production (flag `canary`). The `misskey`
  flag now defaults to **production** (read-only until M2).
- Typing a Misskey server at the Mastodon door said "Can't reach". When the
  Mastodon probe fails, the page now checks NodeInfo and, for Misskey, shows
  "is a Misskey server" with a link to `/login/misskey?server=…` (prefilled).
- Server suggestions on `/login/misskey`: `public/misskey-servers.json`, built
  by `npm run servers:misskey` from servers.misskey.ink (unofficial). That
  list already drops JoinMisskey's `ignorehosts.yml` and non-Misskey software;
  the script keeps alive, unsuspended servers, ranks by its
  `recommendation_score`, and keeps 40 whose NodeInfo says plain `misskey`
  (forks are refused at sign-in). Never fetched from readers' browsers.
  misskey.io qualifies but ranks outside the top 40 (closed registrations).

### As built

- New engine `misskey` (`notes/translate`, the server's DeepL), second in the
  chain after Mastodon and used only for Misskey notes read as the active
  Misskey identity. Free to the reader, but it spends the admin's DeepL
  quota, so daily guard 100 soft / 200 hard. `UNAVAILABLE` is remembered per
  server for the session. The `cw\n-----\ntext` join is split back.
- Kanji-only notes: when the local detector cannot decide, a Misskey note goes
  to the server anyway (DeepL detects the source); only if that fails is the
  reader asked.
- `TranslationCache` (IndexedDB `mockingbird_translations`, memory fallback):
  key = target + ActivityPub `uri` + hash of the text, 30-day TTL, 2,000
  entries. Plain-text results from every engine but Mastodon's. Bypassed
  when the reader picks a source or skips engines. Listed in Settings →
  Storage as "Saved translations".
- The free engines now also translate image descriptions (🖼) and poll choices
  (☐), which Mastodon's own translator already did.
- Home: a one-time offer per Misskey account, "Translate as you scroll?",
  which sets automatic mode `view` and "translate all foreign posts".

### Found in the owner's live try (2026-11-09)

- misskey.design has **no translator** (`meta.translatorAvailable: false`),
  so after accepting the offer nothing translated: automatic mode may not
  download a browser model, and MyMemory/Apertium are opt-in (Apertium has no
  Japanese). Fixes: the router reads `translatorAvailable` once per server and
  skips its translator without spending; Home shows "Nothing can translate
  yet" while automatic mode is on and no engine can run without a click, with
  **Turn on MyMemory** and a link to the translator settings.
- The "Translated … by … · machine translation" line under every translated
  post is now behind an `mb-help` popover (owner: seeing it everywhere is noise).

### Not done in T1 (follow-up)

- Display names, bios, profile fields, custom-emoji names, channel/antenna
  names, notification snippets.
- Automatic mode still skips notes the local detector cannot decide; the
  eligibility check runs before the router knows Misskey could help.

---

## M1 follow-up (2026-11-09): code complete, needs a live trial

Manual plan: `test_plans/misskey-m1-sign-in-and-read.md` (steps 26–33).

- **Account picker:** choosing a Misskey account on the full picker (or the
  account menu) did nothing. The shell switcher treated it as a Mastodon
  choice with a null token and returned early, the bug Bluesky once had.
  Misskey is now a tokenless kind there too. Picker label "Misskey" added.
- **Profile page** `/accounts/mk:<userId>`: `users/show` and `users/notes`
  (paged by `untilId`; replies and renotes follow the page toggles), as the
  active Misskey identity. Read-only like a Twitter profile: header, MFM bio,
  notes, **Open on Misskey**; no follow, graph tabs or analytics until M2.
  Author names and avatars on Misskey posts now link here.
- **Notifications:** a Misskey source (`i/notifications`, social types only:
  follow, mention, reply, renote, quote, reaction, follow request). Reactions
  show as likes, replies/quotes as mentions. Mentions open their thread, not
  the Mastodon chat; Mastodon-only actions (approve/deny, hide) are not shown
  for Misskey rows. Reading marks them read on Misskey (its default).

Still not done: a hashtag page for Misskey tags, in-app links for @mentions
inside note text (they open on the server), the reaction emoji in
notifications (shown as a like), channels/antennas (M3).
