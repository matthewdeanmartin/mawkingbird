# Adding an interface language

Mockingbird uses runtime Transloco dictionaries. English is generated from `i18n` declarations
beside the UI code; every other locale is a hand-owned JSON file. Missing translations fall back
to English one key at a time.

## Before dispatching translation bots

From `ui/`, require these to pass:

```bash
make i18n
make test
```

Do not dispatch translation work while the English dictionary or i18n gate is broken. Bots need a
stable key set, exact placeholders, and trustworthy English source text.

Use one bot per locale. Do not have multiple bots edit the same locale file: consistency of
vocabulary and formality matters more than raw throughput.

Dispatch in large batches, not one subagent per small area. Every dispatch (subagent or fresh
session) re-pays the cost of reading the skill and glossary before translating a single key,
so a language done as ~5 large dispatches is far cheaper than the same language done as ~50
small ones. See "Batch size" in `.claude/skills/translate-ui/SKILL.md` step 3.

## Bot work order

Replace `de` below with the target locale and give this prompt to the bot:

> Add German (`de`) as a Mockingbird interface language. Work from `ui/`. Read
> `.claude/skills/translate-ui/SKILL.md` completely and follow it. Run
> `make i18n-todo L=de`, then translate only the keys in `i18n-context/todo-de.md` into
> `public/i18n/de.json`, preserving every placeholder and markup tag. Add `de` to
> `IN_PROGRESS_LOCALES` in `src/app/i18n/locale.ts` so the footer picker is available on `/test/`
> and `/canary/` while you work. Move it to `PRODUCTION_LOCALES` only when it is ready for root
> branch. Run `make i18n`, the relevant i18n/locale tests, and `make test`. Force German in the
> footer and walk home, a post, compose, settings, first-run, login, and an error state. Fix
> clipping, overflow, untranslated hardcoded UI, and bad terminology you find. Record genuine
> language-specific lessons in the skill. An incomplete locale may remain on `/test/` and
> `/canary/`; do not promote it to `PRODUCTION_LOCALES` while a gate fails. Report the exact
> remaining blockers.

For a brand-new locale, also add its native-language name (an endonym, such as `Deutsch`) to
`LOCALE_ENDONYMS` in `src/app/i18n/locale.ts`.

## Release checklist

- The locale has moved from `IN_PROGRESS_LOCALES` to `PRODUCTION_LOCALES`; this automatically
  surfaces the global footer picker and enables browser negotiation (`de-AT` becomes `de`).
- `make i18n` passes. Coverage is reported; placeholder, markup, orphan-key, and English-source
  failures are fatal.
- `make test` and the production build pass.
- The locale has been visually walked through at narrow and wide widths.
- Dictionaries load from `/`, `/_ui/`, `/canary/`, and published subpaths.
- Machine-translation provenance and the bad-translation reporting path are visible to users.

Keep incomplete locales in `IN_PROGRESS_LOCALES`. Adding one to `PRODUCTION_LOCALES` opts matching
visitors into it automatically.
