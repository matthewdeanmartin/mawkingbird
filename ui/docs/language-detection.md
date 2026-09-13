# Conservative language detection

The UI detector lives in `src/language-detection/index.ts`. The starter
project has a separate Python implementation; these revised rules are not yet
ported there, so parity must not be assumed. Detection is local, synchronous, dependency-free, and makes no API
calls. The tradeoff is to miss an uncertain language rather than name the wrong
one confidently.

## Decision rules

Normalize Unicode with NFKC and inspect at most 12,000 input characters. Remove
URLs, mentions, email addresses, emoji shortcodes, markup, and fenced/inline code.
Count letters, not script-block punctuation or digits.

Scripts narrow the candidates. Kana contextualizes Japanese kanji; Hangul
contextualizes Korean Han. Ukrainian replaces the Cyrillic attribution rather
than adding a second Russian vote. Shared alphabets require more clues, including
Chinese grammatical sequences in Traditional or Simplified writing and
Russian/Ukrainian or Arabic/Persian words. Bare `中` and `東京` are Han evidence,
not proof of Chinese. `Москва` and `مصر` are shared place names. Known unsupported
Cyrillic, Urdu, Assamese, Marathi, and Nepali cues veto misleading defaults.

Latin prose needs three distinct discriminating clues for a single language.
Any competing lexical clue causes abstention: there are no frequency scores,
winning margins, or lexical percentage thresholds. Repetition adds no evidence.
Two exclusive German word clues plus an umlaut also corroborate German. Umlauts
veto English even if English word clues exist; they do not establish German by
themselves. Distinctive spelling can settle a short word or corroborate two word
clues; a borrowed name cannot establish the language of longer prose.

The tables are collision registries as well as clue lists. A token listed in
multiple languages is excluded for every language. `HOMOGRAPHS` excludes known
cross-language words absent from another compact table, including `um` (German /
Portuguese), `porque` (Spanish / Portuguese), `co` (Polish / Czech), `kun`
(Finnish / Esperanto), and `está` (Spanish / Portuguese). The tests enumerate
every table collision and denylisted homograph and assert none reaches the
lexical evidence map. ASCII collisions are also injected into two-clue and
three-clue sentences to ensure they neither establish nor oppose a verdict.

Insufficient evidence becomes `und` (Unknown). Metadata is a fallback rather
than a competing vote that contaminates clear text. A declared language remains
a claim, not independent evidence about prose. The compatibility distribution API
still accepts an explicit metadata fallback for account analytics; the translation
guard uses only `confidentLanguage` through the feed's text-detection cache.
An uncertain post tagged `en` therefore remains translatable. A same-language
notice offers “Translate anyway?” for that request and engine, without changing
preferences or bypassing the engine's quota. A new notice translation key avoids
reusing stale localized advice to disable the setting.

`LangShare.share` describes attributed letters, **not calibrated probability**.
Only supported attributions reach the result; mixed scripts and unknown material
retain their shares. Composer warnings use `confidentLanguage`, requiring 85%
supported text for one verdict. Feed filtering and translation guards use the
structured analysis described below, including minority quotations. Account
aggregation measures the mix across posts; one Japanese post cannot override an
English sample. Bios take precedence over arbitrary display names.

## Defeats covered by regressions

| Failure or attack | Protection |
| --- | --- |
| `Linux`, French `jeux`/`animaux` → Esperanto | Narrow x-system pattern and grammar corroboration |
| One matching word repeated → confident language | Independent clues and repetition cap |
| English mentioning São Paulo or Łódź → foreign language | Shared marks removed; spelling needs context |
| More kanji than kana → Chinese | Attribute Han to Japanese in context |
| Ukrainian → half Russian | Refine the script once |
| Italian/Spanish fragment | Abstain without enough evidence and margin |
| Handles, URL paths, code, emoji names | Exclude non-prose |
| Decomposed accents and halfwidth kana | Unicode normalization |
| Arabic → Persian from shared pronouns | Require distinguishing words |
| One Japanese post overrides an account | Aggregate post results; no global kana override |

## Verification and limits

The human-reviewed corpus covers all 30 requested languages, including Traditional
Chinese (`zh`), plus ambiguous/adversarial cases. Tests also exercise uppercase,
decomposed Unicode, identifier suffixes, mixed scripts, and incorrect metadata.
This is regression coverage, not a measured accuracy guarantee across dialects.

The translation eligibility specs additionally enumerate all **30 × 29 = 870
ordered language pairs**. Each pair checks correct source detection despite
incorrect target-language metadata, permits translation with or without that
metadata, and excludes any stop words shared by the pair. The Chinese source is
explicitly Traditional Chinese. Thirty diagonal controls confirm that genuinely
matching source and target languages still trigger the optional check. A matrix
inventory assertion protects the exact pair count, uniqueness, and language list.

Run `node scripts/audit-language-detection.mjs` in the UI for the corpus audit,
English UI-prose check, and local timing measurements. The starter project’s parity runner must be updated for the new module location
when its Python rules are intentionally reconciled in a separate change.

Remaining limits include shared orthographies, transliteration, short fragments,
names and quotations, mixed languages using one script, and deliberately planted
multiple independent clues. Scripts are not languages, and the supported list
does not exhaust the world's languages. Long input is sampled from its beginning;
this is a social-post detector, not document-wide language certification. Adding
words requires collision review and positive and negative examples; improving
recall by lowering thresholds alone would undermine the precision goal.

Unicode background: [scripts versus languages](https://www.unicode.org/standard/supported.html)
and [Han characters](https://unicode.org/faq/han_cjk.html).

## Research and extraction (2026-09-13)

[Unicode UAX #24](https://www.unicode.org/reports/tr24/) distinguishes scripts
from blocks: letters in one script can occupy several Unicode blocks. The core
now uses Unicode Script properties, covering extended Greek and supplementary
kana as well as the basic blocks. Greek prose can directly identify Greek in
our supported modern-language scope; isolated mathematical variables do not.
Kana and Hangul contextualize Han. Han alone is shared, so an isolated place
name cannot safely prove Chinese. The existing candidate API retains its
Chinese/Japanese compatibility contract; Korean Han is resolved with Hangul
context, not included as a bare-Han candidate.

[CLDR exemplar sets](https://cldr.unicode.org/translation/core-data/exemplars)
describe customary letters separately from auxiliary letters used in borrowed
words. The [German](https://www.unicode.org/cldr/charts/48/summary/de.html),
[Swedish](https://www.unicode.org/cldr/charts/48/summary/sv.html), and
[Turkish](https://www.unicode.org/cldr/charts/48/summary/tr.html) data show why
`ö` and `ü` are useful exclusions but not exclusive German signatures. The
English umlaut veto is an intentional product rule: even an English sentence
mentioning Müller remains eligible for translation. False abstention is acceptable.

This is deterministic rule evaluation, not a statistical language model. It
does not claim a universal proof that a word is absent from every dictionary,
name, dialect, quotation or transliteration. Finite stop-word tables cannot
establish that proof. Known overlaps are excluded mechanically, additions need
cross-language review, and uncertain inputs remain unknown. Devanagari, Bengali,
Hebrew and other scripts also have users outside our supported language list;
the existing unsupported-language vetoes are useful but not exhaustive.

The core is one dependency-free TypeScript module, importing no Angular, DOM,
storage, network, Node APIs, or app models. `src/app/language-detect.ts` is a
compatibility re-export, so existing app imports remain stable. The offline
audit loads the core directly without Angular. The UI-owned eligibility guard,
preferences, quota checks and recovery actions remain outside it.

It can be extracted into an npm package: copy the core and corpus, compile ESM
JavaScript and declarations with TypeScript (ES2022 or newer), and define the
package's exports, license and version. Before publication, move UI display
helpers out of the public core surface, decide whether the optional metadata
fallback belongs in a separate API, and reconcile the Python consumer. No
package name has been reserved and nothing has been published. Existing `zh`
results include Traditional Chinese; callers' persisted `zh-Hant` preferences
and storage keys are unchanged.

To verify the extraction boundary locally, run
`npx tsc -p src/language-detection/tsconfig.json` from `ui/`. This compiles with
only the ES2022 library and no ambient platform types, emitting JavaScript and
declarations into `.test-results/language-detection/`.

## Structured analysis and reader knowledge

`analyzeLanguage(text)` is the primary explanatory API. It accepts plain text /
Markdown or an array of `{kind, text}` segments. The result contains:

```ts
{
  language: null,
  candidates: ['en', 'nl'],
  candidatesComplete: true,
  reasons: ['conflicting-clues'],
  evidence: [/* the actual word, script and spelling clues */],
  prose: { /* author's prose independently of quotations */ },
  segments: [/* each segment's kind, text, inclusion, and decision */]
}
```

Candidates are unranked possible languages or languages present, not a confidence
distribution. Several independently corroborated sets of lexical clues can
establish a complete multilingual set without establishing a single language.
A lone word such as `because` supplies an English candidate but leaves
`candidatesComplete: false`. Shared script or spelling hints also stay open:
bare Han lists Japanese, Korean and Chinese, without ruling out other uses.
Recognized unsupported writing, weak clues and truncation cannot certify a set.
The supported modern-language scope and borrowed-word limitations still apply.

Prose is analyzed separately from link labels and hashtags. Peripheral labels
cannot relabel substantive prose or quotations; if a post consists only of a
label or hashtag, it is analyzed as the available content. Explicit Markdown
blockquotes and paired quotation marks are preserved, including foreign quotes
inside an otherwise English post. Single apostrophes do not split contractions.
URLs, handles and code are excluded before interpreting their punctuation.
This is a bounded Markdown subset, not a full Markdown renderer.

The app's `status-language.ts` uses a detached inert HTML template to preserve
paragraphs, blockquotes, inline quotations, link labels and hashtag anchors.
It decodes HTML entities and includes content-warning text. It never renders
this template. Script, style, code and image attributes supply no language clues.
HTML parsing remains outside the standalone core.

`FeedLanguageFilter.languageAssessment(status)` adds **`userKnowsLanguage`**.
It is true only when the nonempty candidate set is complete and the reader's
known languages include every member. Knowledge includes the app's existing
explicit choices, interface language and browser locale chain. The core never
uses those preferences to guess a language. An English/Dutch result can therefore
have `language: null` and `userKnowsLanguage: true`. Knowing only English leaves
the flag false, even when the visibility policy conservatively keeps the post.

The full result includes quotations: knowing the author prose is not sufficient
to certify that the reader understands a foreign quote. When all established
possibilities are allowed, the feed keeps the post even if its metadata is wrong.
Explicit feed narrowing still applies separately; known Dutch can be excluded
by an English-only feed selection. Automatic translation skips fully understood
content while retaining learning-language priority. Manual translation is never
blocked merely because the reader knows the source language: translating Dutch
into English remains a legitimate request for a bilingual reader.

Pure analysis is cached against content and content-warning text; reader flags
are recomputed against current preferences. Edits, boosts, preference changes,
and feed resets are covered by tests. Work is capped at 12,000 input characters
and 512 supplied segments; truncation is explicit and never certifies knowledge.

Unknown results explain `no-text`, `insufficient-clues`, `conflicting-clues`,
`shared-script`, `unsupported-script`, `mixed-languages` or `truncated`. Run
`node scripts/audit-language-detection.mjs --explain` to print the actual clues
and open candidate sets for each unresolved corpus example. Diagnostics remain
local; they send no post text anywhere.

All 870 ordered-pair tests additionally check foreign link-label isolation,
preservation of foreign quotations, and the reader knowing both languages.
The existing share-returning APIs retain their compatibility behavior for
analytics; the richer reader assessment uses complete sets rather than a
dominant share that could conceal a short foreign quotation.
