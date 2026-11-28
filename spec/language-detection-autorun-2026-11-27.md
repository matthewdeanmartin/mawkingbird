# Language detection and automatic translation

Implemented in the Mawkingbird client, 2026-11-27. No service, dependency, native
transport, or preference defaults added. Existing unrelated working-tree changes
are outside this change.

## Coverage audit

All 40 named detector languages now have positive corpus examples. An application
test checks every production and canary UI locale against that corpus, normalizing
`nb` to the detector's `no` and `fil` to its `tl` reading identity. This is a coverage
regression guard, not a measured real-world accuracy claim. The new examples are
authored regression fixtures; native-speaker review and held-out social-post
benchmarks remain valuable.

| Detection path | Codes |
| --- | --- |
| Latin word evidence, with spelling where available | en, de, fr, es, pt, it, nl, sv, da, no, fi, pl, tr, eo, cs, ca, id, ms, vi, ro, is, tl, et, hu, lv, lt |
| Script plus disambiguating text where scripts are shared | ru, uk, el, ja, ko, zh, ar, he, hi, th, bn, ta, te, fa |

Malay, Filipino/Tagalog, Estonian, Hungarian, Latvian and Lithuanian were absent.
Icelandic was named but lacked lexical rules. Danish had a table, but every word
was shared and discarded. These now have working word evidence. Indonesian also
has conversational clues. The existing script rules remain conservative on shared
alphabets (for example Han-only Japanese/Chinese and Cyrillic Russian/Ukrainian).
Malay coverage here is Latin/Rumi; Jawi-specific identification is not implemented.

Three distinct shared Malay/Indonesian function words establish the candidate pair
`id/ms`. A distinct clue can resolve it; conflicting clues preserve ambiguity.
English evidence prevents this family rule from declaring an English-mixed sentence
wholly Malay/Indonesian. Repetition adds no evidence. An incorrect English metadata
hint cannot relabel an established pair as English.

## Reader and source decisions

Detection overrides a conflicting declaration. Missing/`und` tags and contradicted
`en` tags no longer prevent autorun when text establishes an unfamiliar language.
When no single language is identified, a complete set of foreign alternatives or
positive exclusions of every known language can establish the need for translation.
An empty or weak candidate set alone cannot. Truncated analysis does not establish
this foreignness predicate.

For a reader who knows English and German:

- Malay, Indonesian, or Filipino/Tagalog: eligible with translate-all enabled.
- Ambiguous Malay/Indonesian: also eligible, without inventing a source language.
- The same ambiguity when the reader knows Malay: abstain unless metadata resolves it.
- Unidentified Cyrillic text ruling out English/German: eligible for source-detecting engines.
- `ok lol`, names, a lone clue, or English: no automatic request from these rules.

Existing mode-off, known-language, learning, explicit translate-all, AI opt-in,
usage budgets, cache, and duplicate-event protections continue to apply. No new
preference is switched on. Eligibility cannot guarantee that a usable engine exists.

## API contracts

| Engine | Unknown source |
| --- | --- |
| Mastodon | Only untagged/undetermined posts and a positively advertised `und` source pair. An incorrect `en` tag cannot be overridden through this endpoint. |
| Misskey | Existing server translation detects the source; no source parameter is sent. |
| OpenRouter | Existing target-only translation prompt and batch path detect it; automatic AI still requires opt-in and budget. |
| Browser Translator | Requires explicit `sourceLanguage` and `targetLanguage`; skipped for `und`. |
| MyMemory | Documented `langpair` requires source and target; skipped for `und`. |
| Apertium | Existing adapter requires a concrete installed language pair; skipped for `und`. |

References:
- https://docs.joinmastodon.org/methods/statuses/#translate
- https://docs.joinmastodon.org/methods/instance/#translation_languages
- https://developer.chrome.com/docs/ai/translator-api
- https://mymemory.translated.net/doc/spec.php

`und` is an internal routing value for unknown-source translation, never a guessed
Malay/Indonesian source sent to an explicit-pair engine.

## Independent Python consumer

`mawkingbird_starters` maintains an independent Python implementation and copied
fixtures. This change is to the interactive Mawkingbird client. Its new lexical
coverage and Malay/Indonesian ambiguity are not a claim of Python parity; do not
regenerate the sibling's outcome fixtures without porting/reviewing its rules.
The client tests protect the pre-existing corpus as well as the new cases.

## Test replacement

The old Icelandic test asserted the absence of a word table. It is replaced by a
test of Icelandic word support and exclusion, recorded in `ui/test-removals.md`.
No other test is removed by this change.

## Final validation

- `make test`: passed on the final tree; 11,638 application tests and 380 library
  tests in the manifest (272 language-detection tests). Includes source integrity,
  library isolation, dead-code and design-inventory checks.
- Targeted Angular lint: passed.
- `npm run build:mockingbird`: passed on the final tree; startup 941.93 kB under
  1 MB, Lite 2134.22 kB under 2140 kB. No mock leakage.
- `git diff --check`: passed.
- SEO and browser design/integration suites not run: no routes, templates, styles,
  native commands or network endpoints changed. Translation requests were mocked;
  no paid API calls were made.
- Logs: `log/language-final-test.log`, `log/language-final-build.log`,
  `log/language-libs.log`, `log/language-lint.log`.

All work remains uncommitted and unpushed.
