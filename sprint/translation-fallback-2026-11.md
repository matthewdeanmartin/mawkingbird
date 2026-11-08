# Sprint: Translation fallback chain (2026-11)

Scope agreed with the owner on 2026-11-08. English only (no locale pass; add
`// i18n` declarations and run `npm run i18n:extract`, nothing more).

## Status: implemented 2026-11-08

Code: `ui/src/app/translation/` (router, engines, pair catalogue, source
resolver, connectors), wired into `status-card`, Settings → Connections →
MyMemory / Apertium (`connections/free-translator/`), and Settings →
Internationalization (engine list, browser switch). Gates: targeted specs,
`make test`, `check:static`, lint, `design:inventory-check` (reconciled),
`build:mockingbird` all passed; engine code is in lazy chunks only. Manual
live checks (`test_plans/translation-fallback-2026-11.md`) not run yet.

Answers to "Things to verify" (from Mastodon `main` source and live probes):

1. Null `status.language`: Mastodon permits a target only if it is listed under
   `translation_languages[status.language]`, so an undeclared post is refused
   (403) on servers like mastodon.social. The router never asks the server for
   one; it uses detection or the picker and the other engines.
2. MyMemory refusals come inside HTTP 200: `responseStatus: "403"` (a string)
   with the message in `translatedText`, e.g. "'XX' IS AN INVALID TARGET
   LANGUAGE" or "PLEASE SELECT TWO DISTINCT LANGUAGES".
3. Apertium accepts form-encoded `POST /apy/translate` with `markUnknown=no`
   (no `*` marks); an uninstalled pair answers HTTP 400 "That pair is not
   installed".
4. Edge: not checked (no code depends on it).

Deviations from the plan below:

- The AI engine gets no source-language hint in its prompt (the existing
  prompt template takes only text and target; models detect the language).
- The `ai` preference still means "AI only", as before; `server` (now labelled
  "Automatic (free first)") runs the chain.
- Automatic mode with "use AI" on now tries the free engines first and AI last,
  instead of AI instead of the server. Cheaper; same opt-in.
- Engines are not dynamically imported: they load with the status card, which
  is itself lazy. The build confirms no engine code in initial chunks. Initial
  grew ~1.6 kB from root registries (storage notes, flags, catalog, labels).
- Mastodon status codes: 404 = no provider, 503 = provider failure or quota,
  429 = rate limit; the router treats 403 as an unsupported pair for the session.

Manual live checks: `test_plans/translation-fallback-2026-11.md`.

## Problem

- The 🌐 button calls `POST /api/v1/statuses/:id/translate` and often gets
  **403**. The server cannot translate that language pair (or has no
  translation provider at all), and we only find out by trying.
- When the server cannot translate, a signed-in reader dead-ends unless
  OpenRouter (paid) is connected. Anonymous has no free translator at all.
- Posts that are **mis-tagged** (a German post declared `en`) look like
  "English → English", so the same-language check refuses them. The server
  cannot fix this anyway, because it always uses the post's declared language.

## Decisions

| Topic | Decision |
| --- | --- |
| Fallback | **Automatic chain.** Try engines in order until one works: Server (only if the pair is listed) → Browser built-in → MyMemory → Apertium → AI (OpenRouter, only if connected and AI is on). The result names the engine that translated it. |
| Source language | **Detect, ask if unsure.** Use the local detector. A confident detection that disagrees with the declared tag wins, and the server is skipped (it would use the wrong tag). With no confident answer, a manual press asks "Translate from which language?". |
| MyMemory / Apertium | **Opt-in connectors.** Off until switched on in Settings → Connections, each its own card like OpenRouter. MyMemory has an optional email for the 50K/day tier. Their use is counted in the translation budgets. |
| Automatic mode | **Free engines only.** "Translate as I scroll" may use Server, Browser built-in, MyMemory and Apertium, never AI. Today's `autoTranslateUsesAi` opt-in stays and still governs AI for auto mode. |
| Browser built-in | On-device and free, so no connector: on by default, with a switch in Settings → Languages. |

## Verified facts (2026-11-08)

- `GET https://mastodon.social/api/v1/instance/translation_languages` answers
  **without a token**: a map of source → targets, e.g.
  `{"af":["en","pt",…,"en-GB","en-US",…]}`. Mastodon 4.1+. A server with no
  provider configured answers `{}`. Older servers answer 404.
- Mastodon's translate endpoint takes only the **target** (`lang`, ISO 639).
  The source is always the status's declared `language`. We do not send `lang`
  today (`api.ts`, `translate(id)`), so the server picks the user's locale.
- MyMemory: `GET https://api.mymemory.translated.net/get?q=…&langpair=de|en`
  returns `Access-Control-Allow-Origin: *` and
  `{"responseData":{"translatedText":"Hello World"},"quotaFinished":false,"responseStatus":200,…}`.
  Limits: about 500 bytes per `q`, 5,000 chars/day anonymous, 50,000 with
  `&de=<email>`.
- Apertium: `GET https://apertium.org/apy/translate?langpair=spa|eng&q=…`
  returns `Access-Control-Allow-Origin: *` and the same `responseData` shape.
  Codes are **ISO 639-3** (`spa`, `eng`, `deu`). `GET /apy/listPairs` lists
  every pair as `{"responseData":[{"sourceLanguage":"afr","targetLanguage":"nld"},…]}`.
  Coverage is mostly Romance and minority languages; many big pairs are missing.
- Browser Translator API (Chrome 138+ desktop): `self.Translator` exists only
  where supported. `Translator.availability({sourceLanguage, targetLanguage})`
  resolves to `'available' | 'downloadable' | 'downloading' | 'unavailable'`.
  `Translator.create({...})` needs a **user gesture** when the model must be
  downloaded; `translator.translate(text)` returns plain text. There are no
  TypeScript lib types, so declare a minimal local interface (the owner's
  sketch, `checkLocalTranslation`, is the shape to follow).

## Things to verify before relying on them

1. What Mastodon does when `status.language` is null: auto-detect, or 403?
   Read `TranslateStatusService` / `Status#translatable?` in the Mastodon
   source and record the answer in this file.
2. MyMemory's reply for an unsupported pair and for an exhausted quota
   (`quotaFinished: true`, `responseStatus` 403/429?). Capture real replies as
   spec fixtures.
3. Whether Apertium accepts `POST` (form-encoded) for long text and whether
   `markUnknown=no` strips its `*unknown` word markers.
4. Edge: does it expose `Translator`? Record it; no code change either way.

## Existing code to build on

| What | Where |
| --- | --- |
| Manual 🌐 path, server only | `status-card/status-card.ts`, `toggleTranslate()` (~L2467) |
| Preference routing (`server`/`ai`/`ask`) | `translateByPreference()`, `chooseTranslator()`; `translation-preference.ts` |
| AI path | `runAiTranslate()`; `ai-translate.ts` (`AiTranslate.translateText`, `targetLanguage()`, `languageName()`, `htmlToPlainText()`) |
| Automatic mode | `autoTranslate()` (~L2775); eligibility in `trend-language-filter.ts` (`AutoTranslateEligibility`, `isAlreadyTargetLanguage`, `detectedLanguage`) |
| Language detection | `language-detection/index.ts` (`detectLanguage`, `CONFIDENT_LANGUAGE_SHARE = 0.85`, `LANG_NAMES`, `POSTING_LANGUAGE_OPTIONS`) |
| Daily budgets | `translation-usage.ts` (`TranslationEngine = 'mastodon' \| 'openrouter'`, `ENGINE_LABELS`, soft/hard limits) |
| Rendering | `status-card.html` ~L224–265: `translation()` (server HTML) and `aiTranslation()` (plain text, never `innerHTML`) |
| Server-cannot-translate | `serverCannotTranslate` (read-only providers: RSS, Twitter, paste…) |
| Connector cards | `pages/settings/connections/connection-catalog.ts`; OpenRouter page `connections/openrouter/` as the template |
| Language settings | `pages/settings/i18n/settings-i18n.html` |
| Cross-origin calls | `providers/external-fetch.ts` (`externalFetch()` context keeps auth/server interceptors off) |
| Storage inventory | `storage-registry.ts` (every new key must be registered and classified) |

## Work items

### 1. Engines behind one interface

New folder `ui/src/app/translation/`. Keep every engine **lazy**: the router
dynamically imports engine modules, so none of this lands in the initial
bundle. Do not import it from root providers or route guards (AGENTS: 1 MB
initial error budget; the initial bundle already sits about 22 kB over the
900 kB warning).

```ts
type EngineId = 'mastodon' | 'browser' | 'mymemory' | 'apertium' | 'openrouter';

interface TranslateRequest {
  status: Status;          // the displayed status (reblog unwrapped)
  text: string;            // plain text from htmlToPlainText (spoiler + body)
  source: string;          // resolved source, ISO 639-1 base ('de')
  target: string;          // AiTranslate.targetLanguage()
  sourceFromTag: boolean;  // true when source is the declared tag
  mode: 'manual' | 'auto';
}

interface TranslateResult {
  engine: EngineId;
  kind: 'html' | 'text';   // only the server engine returns html
  content: string;
  spoilerText?: string;
  source: string;
  target: string;
}

interface TranslationEngineImpl {
  id: EngineId;
  /** Cheap, offline-first pre-check. Never spends budget. */
  canTry(req: TranslateRequest): Promise<SkipReason | null>;
  translate(req: TranslateRequest): Promise<TranslateResult>;
}
```

- **mastodon**: usable only when the post's server knows the status
  (`!serverCannotTranslate`), there is a token (not Anonymous), and
  `req.sourceFromTag` is true (the server would use the tag anyway). The
  pair check goes through item 2. Call `api.translate(id, lang)`. Add the
  `lang` body field to `Api.translate`, set to the matched target from
  item 2. On 403, record the pair as unsupported for the session and return
  a skip so the chain moves on.
- **browser**: `canTry` returns a skip unless `self.Translator` exists, the
  Settings switch is on, and `availability()` is `'available'`, or is
  `'downloadable'`/`'downloading'` **and** `mode === 'manual'` (the click is
  the user gesture; call `create()` synchronously inside the click task, or
  the activation is lost). Show download progress through `monitor`. Cache
  one translator per pair in a Map. Translate paragraph by paragraph to keep
  line breaks.
- **mymemory**: enabled connector only. Split text into sentences packed to
  ≤ 450 UTF-8 bytes per request. Add `&de=` only if the user saved an email
  in the connector (never fill it from the account). Stop on
  `quotaFinished: true` and mark the engine exhausted until the next local
  day (`localDay()` in translation-usage). Use `externalFetch()`.
- **apertium**: enabled connector only. Map 639-1 → 639-3 with a small table
  covering `LANG_NAMES`. `canTry` checks the cached `listPairs` (item 2).
  Send `markUnknown=no` if verified (see "Things to verify", item 3).
- **openrouter**: wraps the existing `AiTranslate.translateText(text, target)`.
  Manual only, unless `autoTranslateUsesAi` is on. Add the resolved source to
  the prompt as a hint ("The text is in German.") when it came from
  detection or the picker.

### 2. Knowing supported pairs in advance

`translation/pair-catalog.ts`:

- **Server.** `GET /api/v1/instance/translation_languages` once per server
  origin. Keep it in memory and in localStorage for 24 h, then refresh it.
  New key `mockingbird_translation_pairs_cache`, unscoped (keyed inside by
  origin), registered as sensitivity `cache`.
  - `{}` means the server has no translator: skip it.
  - A 404 or a network error means unknown: allow one attempt, as today.
  - Target matching: an exact entry (`en`) wins; otherwise take the first
    regional variant (`en-GB`) and send that as `lang`.
  - A 403 during the session overrides the catalogue for that pair.
- **Apertium.** Cache `listPairs` for 7 days in the same key, under an
  `apertium` entry.
- **MyMemory.** There is no list; treat everything as allowed and learn from
  unsupported-pair errors for the session.
- **Browser.** Always ask `availability()`; it is local and cheap.

### 3. Resolving the source language

`translation/source-language.ts`, pure and table-tested:

| Declared tag | Detector | Result |
| --- | --- | --- |
| `de`, target `en` | none confident, or `de` | source `de`, `sourceFromTag = true` (server allowed) |
| any | confident `X` ≠ tag (and `X` ≠ target) | source `X`, `sourceFromTag = false` → **server skipped** |
| `en` = target, or null | confident `en` | today's same-language notice; "Translate anyway" opens the picker (below) |
| `en` = target, or null | not confident | **manual:** open the picker. **auto:** skip silently |

- "Confident" means the top share is ≥ `CONFIDENT_LANGUAGE_SHARE`. Reuse
  `FeedLanguageFilter.detectedLanguage()` / the existing analysis cache
  instead of detecting again.
- **Picker:** a small dialog on `MbDialog`, titled "Translate from which
  language?". The detector's top 3 candidates come first, then
  `POSTING_LANGUAGE_OPTIONS`. Picking one runs the chain with
  `sourceFromTag = false`, so the server is skipped. Nothing is remembered.
- On every result, show "Translated from German by MyMemory · Change". The
  Change link opens the picker and re-runs the chain.

### 4. The chain runner

`translation/translation-router.ts`, an injectable `TranslationRouter`:

- Order: mastodon → browser → mymemory → apertium → openrouter.
  - Auto mode removes openrouter unless `autoTranslateUsesAi` is on.
  - Auto mode removes browser unless it is already `'available'`.
- For each engine: run `canTry` → check the budget (`TranslationUsage.canSpend`)
  → `translate`. Record spend only on an actual request.
- When an engine fails, keep its reason and try the next one.
  - **All fail, manual:** one message listing what was tried and why, with a
    link to Settings → Connections when connectors are off. Example: "Your
    server doesn't translate Esperanto → English · MyMemory is off ·
    Apertium has no Esperanto → English".
  - **All fail, auto:** silent, as today.
- `TranslationPreference` keeps its stored values; the key name and values
  must stay stable.
  - `server` (the default) now means **the chain**. Relabel it
    "Automatic (free engines first)".
  - `ai` means OpenRouter first, then the chain.
  - In `ask` mode the chooser lists every engine that passes `canTry`.
- **Anonymous** gets the 🌐 button whenever any free engine can try (browser
  available, or a connector on). It runs the chain without the server. The
  🤖🌐 rules in `showAiTranslate` stay.

### 5. Status card integration

- Replace the bodies of `toggleTranslate`, `runAiTranslate`'s non-AI parts
  and `autoTranslate` with calls to the router. Keep the methods' public
  names; specs and templates use them.
- Generalize `aiTranslation()` into one plain-text result signal carrying the
  `engine`, `source` and `target`. Server results keep the existing html
  path (`translation()`, Angular-sanitized). **Third-party and model output
  is plain text only; never route it through `innerHTML`.**
- Append mode (learners) works with both result kinds.
- The provider line reads, for example, "Translated from German by MyMemory".
  Server results keep today's provider text.

### 6. Budgets

- Extend `TranslationEngine` and `ENGINE_LABELS` with `browser`, `mymemory`
  and `apertium`. Check that `TranslationUsage`'s stored shape accepts the new
  engines without losing existing counts; the key name must not change.
- browser: no limits (on device); still count uses for the settings screen.
- mymemory: count **characters**, not calls. Default hard limit 5,000/day,
  or 50,000 when an email is saved. Soft limit at 80 %.
- apertium: soft 100 / hard 500 calls per day (public service, no published
  quota; be polite).

### 7. Settings

- **Connections → MyMemory** (new card + page, copied from OpenRouter's):
  enable switch; privacy line "Post text is sent to MyMemory
  (translated.net)."; optional email field explaining the 50K tier; today's
  usage; a "Test" button that translates "Hallo Welt" de→en.
  - Key `mockingbird_connector_mymemory` (unscoped, like OpenRouter),
    sensitivity `private` (holds the email).
- **Connections → Apertium**: enable switch, privacy line, link to the pair
  list, today's usage, Test (spa→eng "Hola mundo").
  - Key `mockingbird_connector_apertium`, sensitivity `setting`.
- **Settings → Languages:** switch "Use this browser's built-in translator"
  (ClientPrefs `browserTranslator`, default true; shown only when
  `self.Translator` exists, otherwise a one-line note that this browser has
  none).
  - Add a read-only "Translation engines" list in chain order, with each
    engine's state: e.g. "Your server: 112 languages", "Browser: available",
    "MyMemory: off · Turn on", "AI: not connected".
  - Relabel the preference options as in item 4.
- Check `connection-catalog.ts` and `connections/doctor/` for lists that must
  include new connectors.

### 8. Out of scope

- Translating your own posts in the composer.
- A proxy for any engine (both services send CORS headers; the Plus proxy is
  not used).
- Locale translations of the new strings.
- LibreTranslate or DeepL keys of the user's own (possible later as further
  connectors on the same interface).

## Tests (write them with the code; do not skip, focus or weaken any)

- `source-language.spec.ts`: one case per table row in item 3, plus a reblog,
  a spoiler-only post and an undeclared post.
- `pair-catalog.spec.ts`: `{}` disables the server, 404 allows one try, a 403
  overrides the catalogue, regional target matching, 24 h / 7 d expiry, and the
  storage key classified as `cache`.
- One spec per engine with `HttpTestingController` (or a stubbed
  `self.Translator`):
  - MyMemory: chunking at 450 bytes, quota reply, email param only when saved,
    no auth header (externalFetch).
  - Apertium: 3-letter mapping, listPairs gating.
  - Browser: `downloadable` refused in auto mode and allowed in manual.
- `translation-router.spec.ts`: order, skip reasons, budget refusal moves on,
  the all-fail message, auto mode never calls openrouter or MyMemory-exhausted
  engines, and the `ask` chooser lists only engines that can try.
- `status-card.spec.ts`: a mis-tagged post skips the server; the picker opens
  for undetermined en→en; third-party text is rendered as text (an HTML
  payload appears literally); the result line names the engine.
- Settings specs for both connector pages and the Languages switch;
  `storage-registry` classification for every new key.

## Gates (AGENTS.md)

Run targeted specs while working, then:

- `cd ui && make test` (redirect to the artifacts log folder, NO_COLOR=1)
- `cd ui && npm run build:mockingbird`, and confirm in the size report that
  `translation/` is not in an initial chunk
- `npm run design:inventory-check`: new HTML files (picker, two connector
  pages) need the audit/consolidation/reconciliation steps
- `make design-verify` only if a shared design widget changes

Report which gates passed and which were not run.
