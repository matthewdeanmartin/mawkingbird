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

### French (2026-10-31)

Owner pick after Japanese: French, the next-largest Mastodon audience among
the locales the app already has.

- 21 French pages under `/fr/` with French slugs, accents dropped
  (`fr/statistiques-mastodon`, `fr/telecharger-images-mastodon`,
  `fr/mastodon-en-francais`, `fr/apprendre-l-anglais-avec-mastodon`): 16
  `…Fr` subclasses with `.fr.html`, the download copy, two landing pages, and
  the `/fr/` index (`ToolsIndexFr`). The bridge and search pages recognise
  the French slugs for direction.
- Copy says « tu », like the app's own fr.json, and uses Mastodon's French
  terms (message, signets, abonnés, masquer, avertissement de contenu;
  "boosts" kept on the boosts page because that is what people search).
  French spacing (non-breaking before `:` and inside « », narrow before
  `; ! ?`) applied to text only, never to template bindings.
- hreflang sets now en/de/fr/ja; Français in every language switch.
- fr.json: the same 424 strings as Japanese. French coverage 78% → 84%.
- Design inventory: 17 French twins, German twins' dispositions.
- Gates: format, lint, check:i18n, design:inventory-check, `make test`
  (8,757 tests, 0 failed), build:mockingbird (initial 928.77 kB),
  `make test-seo` and `test:seo:browser` passed.
- Live (en-US Chromium, prerendered build): `/fr/` (`<html lang="fr">`, 21
  pages), handle generator, search, Bluesky ⇄ Mastodon, similar hashtags,
  image download form and `fr/mastodon-en-francais` all French; hreflang
  en/de/ja/fr/x-default; the English download page links Français. No page
  errors.
- Watch: the initial bundle grows with every language because
  `focused-tools.json` (59 kB) is imported eagerly by `app.routes.ts`:
  889 kB (de) → 912 kB (ja) → 929 kB (fr). Four more languages would near the
  1 MB budget; move the per-route titles and descriptions out of the root
  import before adding many more.

### Registry for 15–35 languages (2026-10-31)

Owner: "Do it. I aspire to support ~15 - ~35 languages."

- Translations left `focused-tools.json`. Each language is a slug per tool in
  `tool-translations/paths.json` (eager, about 1 kB) and its words in
  `tool-translations/<lang>.json` (lazy: route resolvers in `tool-copy.ts`
  give translated pages their title and description, and each language index
  its list). Tab, sign-in, group and sources come from the English original.
  Server and specs use `focused-tools-all.ts`; scripts use
  `scripts/focused-tools-registry.mjs` (same entries as before, checked
  field by field during the split).
- Page tables keyed by English page: `TOOL_PAGE_MODULES` (browser) and
  `toolModules` (server) find `<Class><Lang>` by name, so a language adds no
  route or prerender lines. Language indexes come from `TOOLS_INDEXES`
  (`seo.ts`); scripts take the language list from `paths.json`. The bridge
  and search pages find direction and root from the registry.
- New specs: paths and words files match; browser lazy words equal the
  server's; every page and every index loads its own language's class.
- Initial bundle: 928.77 kB → 879.66 kB before Spanish, 881.20 kB after.
- Next limit at scale: the header language switch lists every version as a
  link; past ~8 languages it wants a menu.

### Spanish (2026-10-31)

- 22 Spanish pages under `/es/` (index plus 21), neutral Spanish with « tú »
  like the app's es.json (publicación, marcadores, seguidores, silenciar,
  advertencias de contenido; "boosts (republicaciones)" on the boosts page).
  Slugs: `es/estadisticas-de-mastodon`, `es/descargar-imagenes-de-mastodon`,
  `es/mastodon-en-espanol`, `es/aprender-ingles-con-mastodon`, …
- es.json: 424 strings; Spanish coverage 78% → 84%.
- Design inventory: 17 Spanish twins, German twins' dispositions.
- Gates: format, lint, check:i18n, design:inventory-check, `make test`
  (8,782 tests, 0 failed, 0 missing from the manifest), build:mockingbird
  (initial 881.20 kB), `make test-seo`, `test:seo:browser` passed.
- Live (en-US Chromium, prerendered build): `/es/` (`lang="es"`, 21 pages),
  handle generator, search, Bluesky ⇄ Mastodon, similar hashtags, image
  download and `es/mastodon-en-espanol` all Spanish; hreflang
  en/de/es/fr/ja/x-default; client-side navigation resolves translated titles
  and descriptions. No page errors.

### Traditional Chinese (2026-10-31)

- Script: Traditional (`zh-Hant`), the app's existing Chinese dictionary
  (Taiwan, Hong Kong). Simplified would need a new app locale first.
- First language whose code is not its folder: `languageFolder()` (`zh-Hant`
  → `/zh-hant/`) in routes, prerender, index alternates, scripts and the
  registry spec; `hreflang` and `<html lang>` stay `zh-Hant`. Class names
  `…ZhHant`, templates `<page>.zh-hant.html`.
- English slugs under `/zh-hant/`, as Chinese sites usually do; landing pages
  `zh-hant/mastodon-in-chinese` and `zh-hant/learn-english-with-mastodon`,
  with 長毛象 (Mastodon's nickname in Taiwan) beside Mastodon.
- Copy matches the app's zh-Hant: polite 您, 嘟文, 轉嘟, 書籤, 跟隨者, 靜音,
  封鎖, 內容警告, a space between Chinese and Latin words. Strict line
  breaking under `:lang(zh)`.
- Landing checklist: Mastodon tags Chinese posts `zh`, the interface locale is
  `zh-Hant`; copy entries gain `content` for the posting/known language.
- zh-Hant.json: 424 strings; coverage 78% → 84%. Design inventory: 17 twins.
- Gates: lint, check:i18n, design:inventory-check, `make test` (8,803 tests,
  0 failed, 0 missing), build:mockingbird (initial 882.77 kB), `make
  test-seo`, `test:seo:browser` passed. format:check first failed on
  `friend-bridge.zh-hant.html` (prettier needed a second pass on a wrapped
  `{{ copy.to }}`); after it, format:check and inventory-check pass.
- Live (en-US Chromium): `/zh-hant/` (`lang="zh-Hant"`, 21 pages), handle
  generator, search, bridge, similar hashtags, download form and the landing
  page all Chinese; hreflang includes zh-Hant. No page errors.
- Open: the header language switch now lists five other languages; it wants
  a menu before many more.

### Korean (2026-11-01)

- 22 Korean pages under `/ko/` with English slugs (as Korean sites usually
  do); landing pages `ko/mastodon-in-korean` and
  `ko/learn-english-with-mastodon`, with 마스토돈 beside Mastodon.
- Copy matches the app's ko dictionary: formal polite 합니다체, 회원님,
  게시물, 부스트, 북마크, 팔로워, 뮤트, 차단, 콘텐츠 경고, 즐겨찾기.
  Particles after Latin names follow their Korean reading (Mastodon과/을/으로,
  Bluesky와/를/로). `word-break: keep-all` under `:lang(ko)`.
- Two handle-generator fragments needed a lead-in word (사용자 이름) because
  Korean puts the name first and Transloco treats empty strings as missing.
- ko.json: 424 strings; coverage 78% → 84%. Design inventory: 17 twins.
- Gates: format, lint, check:i18n, design:inventory-check, `make test`
  (8,824 tests, 0 failed, 0 missing), build:mockingbird (initial 884.21 kB),
  `make test-seo`, `test:seo:browser` passed.
- Live (en-US Chromium): `/ko/` (`lang="ko"`, 21 pages), handle generator,
  search (검색), bridge, similar hashtags, download form and the landing page
  all Korean; hreflang includes ko. No page errors.
- Open: header language switch now lists six other languages; a menu is due.

### Language menu (2026-11-01)

Owner: "add compact menu because this is going to get to ~15".

- `LanguageVersions` is now one `MbPopover` (list layout): the button names
  the current language, the panel links every version, the current one
  `aria-current`. The links stay in the document while closed, so prerendered
  pages keep a crawlable link to each `hreflang` version.
- Tool indexes use the same component (versions from
  `TOOLS_INDEX_ALTERNATES`) instead of hand-written header links, so adding a
  language no longer touches any index template but its own. Unused
  `.language-switch` styles removed. New `language-versions.spec.ts`.

### Portuguese (Brazil) (2026-11-01)

- 22 pages under `/pt/` with Portuguese slugs, accents dropped
  (`pt/estatisticas-do-mastodon`, `pt/baixar-imagens-do-mastodon`,
  `pt/mastodon-em-portugues`, `pt/aprender-ingles-com-mastodon`).
- Brazilian, like the app's pt dictionary: você, arquivo, usuário, baixar,
  celular; publicação, marcadores, seguidores, silenciar, avisos de conteúdo;
  "boosts (republicações)". `hreflang="pt"` (no European version to separate).
- pt.json: 424 strings; coverage 78% → 84%. Design inventory: 17 twins plus
  the language menu (adopted scope).
- Gates: format, lint, check:i18n, design:inventory-check, `make test`
  (8,848 tests, 0 failed, 0 missing), build:mockingbird (initial 885.90 kB),
  `make test-seo`, `test:seo:browser` passed.
- Live (en-US Chromium, 1100px and 375px): prerendered `/pt/` page carries 8
  version links (closed menu) and 9 head alternates; the menu opens, lists
  all eight languages with Português marked, and picking 한국어 lands on
  `/ko/download-mastodon-images` in Korean. No horizontal overflow on a
  phone. `/pt/` index (21 pages), handle generator, search, bridge and the
  landing page all Portuguese. No page errors.

### Italian (2026-11-01)

- 22 pages under `/it/` with Italian slugs, accents and apostrophes dropped
  (`it/statistiche-mastodon`, `it/scaricare-immagini-da-mastodon`,
  `it/mastodon-in-italiano`, `it/imparare-inglese-con-mastodon`).
- Copy says « tu », like the app's it dictionary: post, segnalibri, follower,
  silenziare/riattivare, bloccare/sbloccare, avvisi sul contenuto, preferiti;
  "boost (ricondivisioni)". Typographic apostrophes in the text.
- First language added after the menu: no other page header changed.
- it.json: 424 strings; coverage 78% → 84%. Design inventory: 17 twins.
- Gates: format, lint, check:i18n, design:inventory-check, `make test`
  (8,869 tests, 0 failed, 0 missing), build:mockingbird (initial 887.25 kB),
  `make test-seo`, `test:seo:browser` passed.
- Live (en-US Chromium, 1100px and 375px): `/it/` (`lang="it"`, 21 pages);
  menu lists nine languages with Italiano marked and switches to Korean;
  handle generator, search, bridge, download form and landing page all
  Italian; no horizontal overflow; no page errors.
