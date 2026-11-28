---
name: translate-ui
description: Translate Mawkingbird interface strings into another locale, catch a locale up, or add a new interface language. Use for any edit to ui/public/i18n/<locale>.json other than English, and whenever make i18n-todo, i18n-batch, i18n-merge or i18n-traps is involved.
---

# Translating the interface

English (`ui/public/i18n/en.json`) is generated from `// i18n key: text` comments.
Every other locale is a hand-owned JSON file. Missing keys fall back to English one at
a time.

## When to translate

Translation is slow and expensive, so it only happens when the owner asks:

- New features ship in English.
- Core screens stay translated in every shipped language (the list is in
  `spec/sprint/i18n-catchup-2026-11.md`).
- Everything else is translated in catch-up passes, common languages first.
- Every existing language stays, including small ones without a starter kit (often
  there weren't enough Mastodon users to build one). A *new* language needs a reason
  (a starter kit, Feed Builder page or real traffic) and the owner's say-so.

## Method

1. Read `ui/i18n-context/README.md` once, then the locale's `glossary-<xx>.md`. The
   glossary fixes this app's words (Boost, post, handle, instance, feed, thread,
   mute), which a model otherwise translates in the wrong sense.
2. `cd ui && make i18n-batch L=xx [N=250] [P=<prefix>]` prints the next slice of
   missing keys as TSV. `ARGS=--areas` counts by area.
3. Translate the slice into a JSON batch file in your scratch folder.
4. `make i18n-merge L=xx F=<batch>.json`. It rejects the batch whole on an unknown
   key, placeholder or markup drift, a `max` overflow, or a locale rule from
   `scripts/i18n-locale-rules.mjs`. Fix it and merge again. Never write to a locale
   file directly. Tracked locales (those with `i18n-context/ledger-<xx>.json`) need
   the `--source=` snapshot that `i18n-batch` writes.
5. After a few batches, run `make i18n-traps L=xx` and fix the real hits. A hit is
   evidence that a word was taken in the wrong sense, not proof of a bug.
6. `npm run check:i18n`.

## Rules

- One bot per locale, in big batches: about 5 dispatches per language, not 50.
  Every dispatch pays to reread the glossary.
- Keep `{{placeholders}}`, HTML tags and entities exactly as they are.
- Use the register the locale's dictionary already uses (du / tú / tu / você /
  です・ます / 합니다체 / 您). Add new trap words to the locale's rules or glossary.
- Translate the current short English. Don't bring back detail from an old
  translation that the copyedit pass removed (`ops/COPYEDIT_RUNBOOK.md`).
- "Twitter", never "X". Starter-pack translations keep their script tags.

## A new language

Follow `ops/engineering/translating-interface.md`: `make i18n-todo L=xx`,
`IN_PROGRESS_LOCALES` first, endonym in `LOCALE_ENDONYMS`, adult-content lexicon
entries. Promote to `PRODUCTION_LOCALES` only after a visual walk-through and the
owner's go-ahead.
