# Conservative language detection

The UI and `mawkingbird_starters/starters/langdetect.py` use the same rules and
fixtures. Detection is local, synchronous, dependency-free, and makes no API
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

Latin prose needs three distinct discriminating clues, a three-to-one lead over
the runner-up, at least 75% of lexical evidence, and clues covering at least 15%
of distinct words. Repetition adds no evidence. Distinctive spelling can settle a
short word or corroborate clues; one borrowed name cannot establish the language
of longer prose. Shared accents are not fingerprints: Vietnamese and Portuguese
both use `ã` and `õ`, so Portuguese needs stronger spelling such as `ção`.

Insufficient evidence becomes `und` (Unknown). Metadata is a fallback rather
than a competing vote that contaminates clear text. A declared language remains
a claim, not independent evidence about prose.

`LangShare.share` describes attributed letters, **not calibrated probability**.
Only supported attributions reach the result; mixed scripts and unknown material
retain their shares. Composer warnings and feed filtering use
`confidentLanguage`, requiring 85% supported text for one verdict. Account
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

Run `node scripts/audit-language-detection.mjs` in the UI for the corpus audit,
English UI-prose check, and local timing measurements. Run `make langdetect-parity`
in the starter project after intentional rule changes. It refreshes observed
TypeScript outputs and copies the separately authored expected-outcome corpus.
Run both projects' tests afterward.

Remaining limits include shared orthographies, transliteration, short fragments,
names and quotations, mixed languages using one script, and deliberately planted
multiple independent clues. Scripts are not languages, and the supported list
does not exhaust the world's languages. Long input is sampled from its beginning;
this is a social-post detector, not document-wide language certification. Adding
words requires collision review and positive and negative examples; improving
recall by lowering thresholds alone would undermine the precision goal.

Unicode background: [scripts versus languages](https://www.unicode.org/standard/supported.html)
and [Han characters](https://unicode.org/faq/han_cjk.html).
