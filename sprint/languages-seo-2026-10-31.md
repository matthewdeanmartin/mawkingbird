# German and English SEO pages: two sprints, 2026-10-31

Status: both sprints implemented locally, uncommitted; S2-5 (measurement) not started. Spec: [Per-language landing pages](../spec/language-landing-pages.md).

## Owner decisions (2026-10-31)

- Language landing pages are a pitch while signed out and a settings tool once
  signed in, then "Go to your home feed". They show no posts; `/` does that.
- Every tool gets a German page: Germans search the same tasks in German on
  google.de, and a German page outranks an English one there.
- A page written for one language is in that language for everyone. An
  Indonesian visitor on the German page gets German.
- Landing-page copy lives in the page, one language each. It is not added to
  the app's translation dictionaries or translated into other app languages.
- Tool bodies use the app's translations, German only; other languages fall
  back to English.
- Route trick (owner's suggestion): the URL decides the language of the whole
  page. A German route renders its tool in German for every visitor and for
  Google's renderer, without touching the visitor's saved interface language.
- No server directory. Promote mastodon.social and say other servers exist.
- Slugs: one readable slug in the page's language, ASCII, never renamed.

## How Google sees it

Google reads the prerendered HTML (heading, intro, steps, Questions), then
renders the page with JavaScript in an English browser, never signed in.

- The prerender loads no translations, so page copy must be in the page itself
  (layer 1 below).
- The route trick makes the rest follow the URL instead of the browser: each
  German page component provides `provideTranslocoLang('de')` (Transloco
  8.4, verified in node_modules), so every translate pipe in its subtree,
  tool bodies and dialogs included, renders German for everyone, Google's
  renderer too. The visitor's saved interface language is untouched.
- Code that calls `TranslocoService.translate()` directly ignores that
  provider (it uses the app-wide language). Those calls in the tools must pass
  the route's language explicitly, or move to the pipe.
- Signed-in tool bodies stay invisible to Google whatever their language; the
  signed-out ones (handle generator, search, media download, similar hashtags)
  are seen in German.

Three layers per tool page:

| Layer | What | Today | Plan |
| --- | --- | --- | --- |
| 1. Page copy | H1, intro, steps, Questions (prerendered) | English literals, all pages | Copy object per page and language |
| 2. Tool body | The workbench's own labels and messages | English literals, 16 of 17 | App translation keys, German added; route-scoped language |
| 3. App parts | Composer, analytics, bulk and media dialogs, connectors | Translated, German ≈81% | Fill German gaps in these components only; route-scoped language |

## Sprint 1 — foundation and language landing pages

| ID | Work | Done when |
| --- | --- | --- |
| S1-1 | Registry: `lang` (default `en`) and `translationOf` (the English entry's id) in `focused-tools.json` / `focused-tools.ts`. | A spec rejects unknown `translationOf` ids, chains, duplicate paths and two entries for one language of one tool. |
| S1-2 | Page language: route data `seoLang`; `Seo` sets `<html lang>` and `main.server.ts` passes it, so the prerender is `lang="de"`. Outside the shell, `locale.ts` does not overwrite a declared page language; inside the shell the interface language still owns it. | Prerendered German pages have `<html lang="de">`; signed-in pages keep the interface language. |
| S1-3 | `hreflang`: `Seo` writes `<link rel="alternate" hreflang>` for every language version plus `x-default` (English); `prepare-seo-index.mjs` writes `xhtml:link` alternates into the sitemap; `check-seo-build.mjs` asserts lang, reciprocal alternates and a self canonical per entry. | `make test-seo` checks every pair. |
| S1-3b | Route language: a German page component provides `provideTranslocoLang('de')` and makes the German dictionary available; direct `TranslocoService.translate()` calls in tool code take the provided language (helper). | On a German page with an English interface, the tool body and its dialogs render German; the interface elsewhere stays English. |
| S1-4 | Pilot tool, all three layers: `mastodon-bilder-herunterladen` (German twin of `download-mastodon-images`). Page copy object (layer 1); workbench strings to translation keys with German (layer 2); German gaps in the media download dialog and grid (layer 3). Signed-in twin and nav tab work as for English. | Prerender is German; sign-in returns to the German page; in a real browser with an English locale, the whole page including the dialog is German. |
| S1-5 | Language landing template, one component plus a copy object per page: `mastodon-auf-deutsch` (de), `mastodon-in-english` (en), `learn-english-with-mastodon` (en). Signed out: the pitch, each claim tied to a shipped feature, sign-in returning here, Questions. | Prerendered, in the sitemap, linked as language versions where they are. |
| S1-6 | Signed-in "optimize" checklist on those pages: interface language, languages I know (plus "I also read English?"), default post language on the server (before → after), hide languages I don't read, trending filter, learning language with translation under the original, starter packs on "My languages". One Apply, a summary, **Go to your home feed**, `FocusedNextSteps`. Uses the same services as Settings → Internationalization. | Each setting is verified by a spec; arriving on the page changes nothing until Apply. |
| S1-7 | `ui/docs/seo.md`: replace "English only" with the language rules above. | Docs match the code. |

Gates: targeted specs while building, then `make test`, `check:i18n`, lint,
format, `build:mockingbird`, `make test-seo`, `npm run test:seo:browser`,
design inventory review.

## Sprint 2 — German for every tool

| ID | Work | Done when |
| --- | --- | --- |
| S2-1 | German page copy (layer 1) for the remaining tools, as registry entries with `translationOf`. Slugs below. | Each prerenders in German with its checks. |
| S2-2 | Layer 2: move English literals out of the 16 workbenches into translation keys, with German. | `check:i18n` passes; German interface shows the tools in German. |
| S2-3 | Layer 3: German for the missing keys in the components those tools embed (compose, account analytics, bulk progress and actions, the bridge, contacts, GitHub and friend-feeds importers, connectors, similar-hashtags panel). | No English left in a German tool for a German interface. |
| S2-4 | German tools index `mastodon-werkzeuge`, linked from `mastodon-auf-deutsch`; every English tool page links "Deutsch" and back. | Indexed, in the sitemap, reciprocal links checked. |
| S2-5 | Measurement: GoatCounter paths per language; sitemap submitted in Search Console. | Recorded here. |

| English | German slug |
| --- | --- |
| twitter-to-mastodon | twitter-follower-zu-mastodon |
| crosspost | mastodon-und-bluesky-gleichzeitig-posten |
| mastodon-analytics | mastodon-statistik |
| github-to-mastodon | github-freunde-auf-mastodon |
| schedule-mastodon-posts | mastodon-beitraege-planen |
| bluesky-to-mastodon | von-bluesky-zu-mastodon |
| mastodon-to-bluesky | von-mastodon-zu-bluesky |
| turn-off-boosts-mastodon | mastodon-boosts-ausblenden |
| find-contacts-on-mastodon | kontakte-auf-mastodon-finden |
| mastodon-friends-rss-feeds | rss-feeds-deiner-mastodon-freunde |
| mastodon-mute-block-amnesty | mastodon-stummschaltungen-aufheben |
| how-to-be-anonymous-on-mastodon | anonym-auf-mastodon |
| mastodon-handle-generator | mastodon-nutzernamen-generator |
| turn-off-content-warnings-mastodon | mastodon-inhaltswarnungen-ausschalten |
| export-mastodon-bookmarks | mastodon-lesezeichen-exportieren |
| download-mastodon-images | mastodon-bilder-herunterladen (sprint 1) |
| mastodon-similar-hashtags | aehnliche-hashtags-mastodon |
| mastodon-search | mastodon-suche |
| bluesky-search | bluesky-suche |

## Open

- German copy is drafted here, not by a native speaker. Pages go live as
  drafts; a native review pass is still wanted.
- The German starter packs come from the catalogue that does not honour
  `noindex`: pages may count them, never list their people.

## Results

### Sprint 1 (2026-10-31)

- S1-1: `lang` and `translationOf` in the registry, with `toolLanguage`,
  `toolVersions`, `toolAlternates` and `ENGLISH_TOOLS` (focused-tools.ts). A
  spec checks every translation mirrors its original (tab, sign-in, group, tool)
  and that there is one per language. /tools and the features page list English
  pages only.
- S1-2: `page-language.ts`. `Seo` publishes an indexable route's `lang` to
  `PageLanguageState` and sets `<html lang>`; `TranslocoLocaleSync` prefers it
  over the interface language; the signed-in twin keeps the interface language.
- S1-3: `hreflang` links from `Seo` (versions plus x-default English), the
  same set as `xhtml:link` in the sitemap (the lastmod stamping now allows
  them), and `check-seo-build.mjs` asserts lang, alternates and sitemap alternates.
- S1-3b: `provideRouteLanguage()` pins the page subtree to the route language
  with `|static` (a plain provided language reverts after the first render);
  `routeTranslate()` for text built in code. Proven in jsdom and in Chromium.
- S1-4: `mastodon-bilder-herunterladen`. Copy file per language; workbench
  strings to `downloadImages.*` keys; the download dialog's code-built labels
  via `routeTranslate`; `FocusedNextSteps` translated; 58 German strings in
  de.json (tool, dialog, next steps, grid, nav tabs incl. Invite). Live, in an
  en-US Chromium: `<html lang="de">` after JavaScript, and the tool, account
  line, download bar, dialog and next steps all German; the English page stays
  English.
- S1-5/S1-6: `LanguageLanding` + `LanguageChecklist` for
  `mastodon-in-english`, `mastodon-auf-deutsch` (its German version) and
  `learn-english-with-mastodon`, in a new "Your languages" group with a
  "Languages" tab. Checklist items call the same services as Settings →
  Internationalization; nothing changes before Apply; the server posting
  language shows before → after; a refused server write is reported and the
  rest still applies.
- S1-7: ui/docs/seo.md "Pages in other languages".
- Gates: format, lint, check:i18n, `make test` (0 missing), build:mockingbird
  (initial 874.93 kB), `make test-seo`, `test:seo:browser` all passed; design
  inventory reviewed (two candidates added, adopted scope).
- Not verified: the signed-in checklist against a real Mastodon account (specs
  only), and anything on canary.

### Sprint 2 (2026-10-31)

- Owner decision mid-sprint: German pages live under `/de/`. The two pilot
  URLs from sprint 1 redirect there.
- S2-1: 18 German tool pages, each a `…De` subclass with its own
  `.de.html` (German sign-in return paths), registered with `lang` and
  `translationOf`. `german-pages.spec.ts` renders all of them signed out.
- S2-2: the tools' own strings moved to `focusedTools.*` keys, 252 German
  strings; Invite links derive from the page's route (`toolInviteLink()`).
- S2-3: 114 German gaps filled in embedded app parts (composer permissions, poll
  statistics, post menu, analytics errors, video player, similar-hashtags panel).
  German coverage 81% → 84%.
- S2-4: `/de/` German index (`ToolsIndexDe`) paired with /tools via hreflang;
  `LanguageVersions` links each page to its other language.
- Gates: format, lint, check:i18n, build:mockingbird (initial 889 kB),
  `make test-seo` and `test:seo:browser` passed. `make test`: one run failed on
  server-picker.spec.ts "waits for an explicit action before connecting to a
  typed local server" (untouched; passes alone, 9/9); a full rerun of
  `test:ci` passed, 8,715 tests, 0 failed. It is flaky: it fakes timers and
  asserts global `fetch` is never called, which a stray request from another
  spec in the shared realm can occasionally break.
- Live (en-US Chromium, prerendered build): /de/, the German handle generator,
  search and similar-hashtags bodies all German; language links both ways; the
  old pilot URL redirects. No page errors.
- Not done: S2-5 measurement (Search Console and GoatCounter need the owner);
  native German review.

### Japanese (2026-10-31)

Owner request: "onward to Japanese", and "when in japanese-land do whatever
they do". Read as: pages under `/ja/` keeping the English slug (Japanese
sites rarely use romanised slugs, and nobody searches romaji); polite
です/ます copy with full-width punctuation; FAQ-heavy pages; マストドン beside
Mastodon in the landing pages, where people search both.

- 21 Japanese pages: 16 tool templates (`…Ja` subclasses with `.ja.html`;
  the Bluesky ⇄ Mastodon and search pages pick direction from the slug),
  the download copy, `ja/mastodon-in-japanese` and
  `ja/learn-english-with-mastodon` in `language-landing.copy.ts`, and the
  `/ja/` index (`ToolsIndexJa`). Registered in focused-tools.json,
  `FOCUSED_TOOL_PAGES` and the prerender table.
- `PageLanguage` gains `ja`; the language switch lists every version
  (English · Deutsch · 日本語); index hreflang is now a set of three in `Seo`,
  the sitemap script and `check-seo-build.mjs`.
- `focused-page.css`: `line-break: strict; word-break: auto-phrase` under
  `:lang(ja)`, so lines break between phrases.
- ja.json: 424 strings (252 tool strings, 114 embedded app parts, 58 for the
  download dialog, next steps and nav tabs). Japanese coverage 78% → 84%.
- `german-pages.spec.ts` is now `translated-pages.spec.ts` and covers every
  non-English entry.
- Design inventory: 17 Japanese twins added, each with its German twin's
  disposition.
- Gates: format, lint, check:i18n, design:inventory-check, build:mockingbird
  (initial 912.53 kB), `make test-seo` and `test:seo:browser` passed.
  `make test`: one run failed on server-discovery.spec.ts "skips degraded
  servers unless the user explicitly accepts them" (untouched; a `waitFor`
  timeout under load; passes alone, 3/3); a full rerun of `test:ci` passed,
  8,736 tests, 0 failed.
- Live (en-US Chromium, prerendered build): `/ja/` (`<html lang="ja">`, 21
  pages listed), handle generator, search, Bluesky ⇄ Mastodon, similar
  hashtags, image download form and `ja/mastodon-in-japanese` all render
  Japanese; hreflang set en/de/ja/x-default on the landing page; the English
  download page links 日本語 → `/ja/download-mastodon-images`. No page errors.
- Open: native Japanese review (copy is drafted, not by a native speaker;
  it uses a half-width space between Japanese and Latin words, which the
  existing ja.json does not); S2-5 measurement still the owner's. Other
  ja.json gaps (about 16% of keys) remain for the global pass; they are
  outside the tool pages.
