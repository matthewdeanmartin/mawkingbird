# Adult facet, people by language, reporting with care (November 2026)

Status: sprints 1–4 pushed 2026-11-22; sprints 5–6 implemented and uncommitted,
2026-11-22, awaiting the owner's push and manual test. Sprints 7–8 planned.
Cadence (owner, 2026-11-22): two sprints at a time, light checks between
sprints, a stop after every two for the owner to commit, push, deploy and
test by hand. Full gates are held for the end of the epic or the owner's
GitHub run.

## Sprint 1 — Languages you can actually pick

- `language/language-catalog.ts` (pure): every code Mastodon accepts
  (ISO 639-1 + its ISO 639-3 additions), names via `Intl.DisplayNames`
  (reader's locale, endonym, English), `searchLanguages(query)`,
  `suggestedLanguages(current, userLanguages, appLanguages)`.
- `language/language-finder/`: `<app-language-finder>` combobox (type to
  filter, arrows, Enter; at most 12 matches) and `<app-language-finder-dialog>`.
- Post search language select: Any · *your languages* (known, learning,
  posting default) · *app languages* (all localizations, including in-progress
  ones such as Malay) · the current choice if it is from elsewhere ·
  "All languages…", which opens the finder dialog.

Acceptance: a user who declared `eo` sees Esperanto in the select; Malay and
Indonesian are always there; typing "melayu", "Malay" or "ms" in the finder
finds Malay; choosing Toki Pona (`tok`) keeps it selected and in the URL.

## Sprint 2 — Report with care

- Report categories gain `legal` ("It's illegal").
- Pre-report gate (`moderation/report-gate/`): names the server whose
  moderators read the report, its jurisdiction (from the jurisdiction data
  file; "not recorded yet" until Sprint 7 fills it), links to rules, Terms,
  About. Acknowledged once per server; shown again when the server's legal
  text changes (data-file hash, else ToS `effective_date`).
- Triage step *What's going on?*: "I just don't want to see this" offers Mute,
  Block, Hide this post, Add a filter and sends no report. Spam, rule, legal,
  something else lead into the existing details form.
- "Who reads this" line on the details step; the forward option names the
  remote server and links its About page.
- Jurisdiction data file + reader with an empty generated file.
- Tested against `mastodon_mock` reports.

Acceptance: picking "I just don't want to see this" never calls the reports
API; the gate shows once per server; a `legal` report carries
`category=legal`; Bluesky reports skip the server gate but name Bluesky
Moderation or the chosen labeler.

## Sprint 3 — Adult classifier

- `moderation/adult-content/` pure core: markers lexicon (multilingual,
  documented sources, false-friend tests), CW classifier (sexual / other /
  none), `classifyStatus`, `classifyAccount` with reasons and confidence.
- Shipped adult-server list (data file, reviewed by hand).
- Bluesky labels → reasons (`porn`, `sexual`, `nudity`; self and labeler).

Acceptance: a food CW is never adult; "18+ MDNI" bio is self-declared adult;
"open BO" in an Indonesian bio is adult; every adult verdict has a reason.

## Sprint 4 — Adult facet in search

- `adultFilter` client pref (synced, default `either`), search criterion and
  URL param; post search and people search.
- Collapsed row "⟨reason⟩ (i)" with an explainer popover listing evidence.
- Facet counts ("12 hidden as adult"); Bluesky `adultContentPref` notice.

## Sprint 5 — People who speak my language

- Account language inference (post tags, detection on bio + posts, home
  server languages), with the Malay/Indonesian low-confidence rule.
- Language facet on People search (uses the Sprint 1 widget for "other").
- "People who post in X" mode: post search → authors, ranked, adult facet
  applied, budget 2–5 with "Load more" and the ask at 10.
  **Revised 2026-11-22:** Mastodon refuses `language:xx` on its own (HTTP 400
  "At least one keyword or phrase is required",
  `SearchQueryTransformer::Query#validate_clauses!`), and plain words are
  ANDed (no OR). So the mode runs one `<seed word> language:xx` query per
  call, using very common function words for the language (Malay: *yang*,
  *dan*, *saya*, …; candidates in `ui/githubmimbmawkingbird_starters…stopwords_extracted.json`),
  and merges the authors. Each seed costs one call from the budget.

## Sprint 6 — Directory and timelines

- Directory language + adult filters over loaded pages, with the budget ask.
- Hashtag timeline language/adult filtering where the search page fetches
  tag pages.

## Sprint 7 — Jurisdiction crawl

- `ops/jurisdiction/` crawler + Make target: 25 largest servers and the
  largest per country; fetch ToS + extended description; Claude extracts the
  self-declared jurisdiction with the supporting quote; writes the generated
  file with crawl date and content hash.
- Gate shows "When last crawled (date), the jurisdiction was X" with the
  quote on request and the warning text.

## Sprint 8 — Native

- Native classifies with its local archive (bio + many posts per author).
- Roadmap: **High-performance client-side search in Native** over the local
  cache (see `mawkingbird_native/spec/local_archive_roadmap.md` §6).

## Evidence: sprints 1–2 (2026-11-22)

Light checks only, per cadence. Passed: `make test-changed` (911 spec files;
6 failures in it were fixed and rerun with `test:subset`: the collection and
status-card report tests now pass the new first step, and the other four
were knock-on failures), `test:subset` on the language, search,
report-dialog, report-gate, collection, status-card and Plus settings specs
(330 tests), `check:i18n`, `check:storage`, `check:dead-code`,
`design:inventory-check` (two new candidates reconciled as backlog in
`11-reconciliation.json`, noted in `06-consolidation.md`), prettier and
`ng lint` on every touched file.

Not run (deferred to the end of the epic or the owner's GitHub run): full
`make test` with coverage, `build:mockingbird`, SEO, design-verify browser
suite, integration against a running `mastodon_mock`. The mock already accepts
`category=legal` (`mastodon_mock/routers/admin.py`).

Implementation notes:

- Sprint 1. `language/language-catalog.ts` has no name table: `Intl.DisplayNames`
  gives the local name, endonym and English name. Post search's select is
  *Any* · current choice (from the finder) · *Your languages* (KnownLanguages:
  UI + browser + declared; learning; posting default) · *Languages Mawkingbird
  is translated into* (production **and** in-progress locales, so Malay is
  there) · *All languages…*. The seven old `pages.search.language.<name>`
  keys were removed from every locale.
- Sprint 2. The gate is the first screen *inside* the report dialog (one modal,
  not two stacked). It loads `ServerAbout` rules + terms on open, and Continue
  waits for them, because the Terms `effective_date` is part of the
  acknowledgement fingerprint (crawl hash, else terms date, else constant;
  `mockingbird_report_gate_v1`, registered as private). Bluesky skips the gate
  and gets a two-choice triage (ignore / report). The alternatives call the
  existing `AuthorModeration` and `MutedPosts` services, so the four hosts
  (status card, profile, collection, conversations) needed no change; the
  conversations host passes no `Account`, so it offers no mute/block there.
  The jurisdiction data file ships empty; Sprint 7 fills it.

## Evidence: sprints 3–4 (2026-11-22)

Light checks only, per cadence. Passed: `make test-changed` (913 spec files,
11,009 tests, all green first time), `test:subset` on the adult-content,
search, search-url and Bluesky panel specs, `check:i18n`, `check:storage`,
`check:dead-code`, `check:libs`, `design:inventory-check` (one new candidate,
`adult-explain.ts`, reconciled as backlog), prettier and `ng lint` on every
touched file.

Not run (deferred): full `make test` with coverage, `build:mockingbird`, SEO,
design-verify, integration.

Implementation notes:

- Sprint 3. `moderation/adult-content/adult-lexicon.ts` holds the word lists,
  each with false-friend tests: "BO", "VCS", "ayam", "spicy" never count alone;
  "nsfw language", "sexual assault", "sex ed" CWs are *other*, not sexual.
  `adult-classifier.ts` returns reasons for every verdict. A person is adult
  when their profile says so, a Bluesky label says so, their server is listed,
  or ≥2 of their loaded posts **and** ≥⅓ of them are adult. One adult post is
  weak evidence: shown under (i), never decisive. Sensitive with no CW is
  weak too. `adult-servers.json` ships **empty**: entries are hand-reviewed
  against the server's own About page.
- Sprint 4. `AdultResults` (one class, used by Mastodon search and the
  Bluesky panel) keeps the filter, the verdicts and the reveals. The control
  sits above each people/post list. Hide swaps a card for "Adult content ·
  ⟨first reason⟩ (i) Show"; Only drops the rest and says how many it left
  out. The choice is the synced `adultFilter` client pref (default `either`);
  a link's `adult=hide|only` overrides it for that view without changing it.
  Bluesky people come from `searchActors` without labels, so they are judged
  by bio only. Bluesky posts carry labels. When the reader's Bluesky account
  has adult content off and they pick Only, the panel says Bluesky itself
  leaves most adult posts out.

## Side fix: failed searches were silent (2026-11-22)

`language:ms` in the search box returned HTTP 400 and the page showed
nothing. Mastodon requires at least one positive word or phrase (hashtags
count; `-word` and `prefix:value` do not; `in:library` / `from:me` are exempt).
`discovery/search/search-query-check.ts` now catches filters-only queries before
sending and says what to add; People search skips its doomed post branch and
shows the same note. Any other failed post/hashtag search shows the HTTP
status, the server's own `error` text and Try again (it used to only log).
Bare `has:image` was also being sent as `has:media` and refused the same way;
it now scans the home timeline like the other bare media filters
(`reading/media-query.ts`). Checks: `make test-changed` (113 files, 1,834
tests), search + media specs, `check:i18n`, `check:dead-code`,
`design:inventory-check`, lint.

## Evidence: sprints 5–6 (2026-11-22)

Light checks only, per cadence. Passed: `make test-changed` (115 spec files,
1,854 tests), `test:subset` on the search, language, account-refine and
directory specs, `check:i18n`, `check:storage`, `check:dead-code`,
`check:libs`, `design:inventory-check` (one new candidate,
`language-select.ts`, reconciled as backlog), prettier and `ng lint` on
every touched file.

Not run (deferred): full `make test` with coverage, `build:mockingbird`, SEO,
design-verify, integration.

Implementation notes:

- The Sprint 1 picker became `<app-language-select>` (post search, People
  search, Directory). `eslint.config.js` lists it under
  `label-has-associated-control`'s `controlComponents`, because it renders a
  native `<select>` in its own light DOM, so a wrapping `<label>` labels it.
- `language/account-language.ts`: one vote per own post (its tag, unless
  detection is confident of another language) plus the bio. The shared
  detector is conservative: it leaves everyday Malay undetermined (common words
  like *di* and *dan* also belong to other languages), so for Malay and
  Indonesian the tags carry the evidence. Detected `id` without a settling tag
  is `ms-id`, which matches either and shows as "Malay or Indonesian (uncertain)".
- People search: Advanced → *Posts in* (URL `plang`). With words it adds
  `language:xx` to the post branch. With an empty box (or a typed
  `language:xx` with no words) it runs `<seed> language:xx` per seed word
  (`language/seed-words.ts`, 31 languages), up to the budget, then
  *More people* runs the next seeds. Signed out it explains that hashtag search
  cannot filter by language. People results get a Language facet.
- Directory: *Posts in* + the adult filter. A person whose bio says nothing is
  hidden and counted; *Check their recent posts* fetches 20 posts each for at
  most 10 people per click (one request each); a failed profile counts as
  checked so the offer cannot loop.
- Hashtag timelines: signed-out post search reads tag timelines; the chips
  already called its language a loaded-result filter but nothing applied it.
  It now filters loaded posts by `postLanguage`.
- Deferred to Native (§6a): server-declared languages per home server
  (one `/api/v2/instance` call per server is too costly on web).
