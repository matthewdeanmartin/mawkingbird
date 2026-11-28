# i18n catch-up (2026-11-28)

Status: proposed. Each sprint needs the owner's go-ahead before it starts, because
translation is slow and costs a lot of tokens.

## The workflow

1. **New features ship in English.** Nothing is translated per edit or per sprint.
2. **Core screens are kept translated in every shipped language.** When core-screen
   copy changes, the keys wait for the next translation batch, which runs when the
   owner asks.
3. **Everything else gets translated when there's time,** in a catch-up pass like this
   one: common languages first, then the rest.

Lite, SEO pages and Feed Builder aren't special cases. Their core screens are core,
and the rest waits for catch-up like everything else.

### Core screens

`shell.*` (navigation, menus, account switcher), Lite (`LITE_PREFIXES` / `LITE_KEYS`
in `ui/scripts/check-i18n.mjs`), `pages.home`, `pages.conversations` (posts and
threads), `pages.profile`, `pages.notifications`, `pages.search`, `pages.write`
(compose), login (`pages.login*`), `settings.profile`, and the first-run and error
states a new visitor meets.

### Which languages ship

Every language that has a dictionary today stays. Some small languages have no
starter kit only because there weren't enough Mastodon users to build one, which says
nothing about the translation. A *new* language needs a reason first (a starter kit,
Feed Builder page or real traffic) and the owner's say-so. No reason, no new language:
Bengali isn't added.

**Common languages** go first in catch-up passes and are offered on root production:
the current `PRODUCTION_LOCALES` (en, de, fr, id, ja, zh-Hant, uk, ko, es, pt, it, nl,
pl, ru, tr) plus **vi** and **ms** (owner, 2026-11-28).

## Where things stand (measured 2026-11-28)

English has 10,835 keys.

| Locale | Keys present | Starter packs | Feed Builder pages |
| --- | ---: | ---: | ---: |
| Common (15 current production) | 6,334 to 6,490 | id: 0, others: 1 to 30 | de 20, fr 8, es 4, others 0 to 2 |
| vi | 6,334 | 0 | 1 |
| ms | 2,834 | 0 | 1 |
| zh-Hans | 6,752 | 0 (2 `zh` packs, check the script) | 0 |
| sv | 6,334 | 4 | 0 |
| hi | 6,273 | 0 | 0 |
| cs, fi, nb, ar | 3,015 | 1 to 4 | 0 |
| el, hu, lt, lv | 3,015 | 0 | 1 to 2 |
| ro, da, et, fil, th | 3,015 | 0 | 0 |

Starter-pack counts come from `ops/engineering/starter-locale-coverage.md`, which was
generated from the 2026-09-08 catalogue. Regenerate it before deciding anything.

The copyedit pass also left 260 changed and 4 added keys to retranslate:
`ops/copyedit/2026-11-28-retranslate-keys.json`.

Owner decisions (2026-11-28): vi and ms are common; existing languages all stay;
Bengali isn't added.

## I1: rules and tooling (done 2026-11-28)

- **vi promoted** to `PRODUCTION_LOCALES`. Its core screens are level with the other
  production languages (704 of 2,060 core keys missing, like most of them).
- **ms held back** until its core screens are translated in I2. It is missing 1,364
  of 2,060 core keys, so root production would show Malaysian visitors mostly
  English. Promote it at the I2 stop point.
- **Rule 2b** in `ui/scripts/check-i18n.mjs` now means "core screens in every shipped
  locale". `CORE_PREFIXES` are the screens listed above. Lite keys stay fatal (already
  complete everywhere). The other core keys print one line of counts per locale.
  Set `CORE_FATAL = true` at the end of I2.
- `ops/engineering/translating-interface.md` and `ops/COPYEDIT_RUNBOOK.md` describe
  the workflow. The bot work order uses light gates.
- `.claude/skills/translate-ui/SKILL.md` exists, so the scripts' pointers to it work.
- `ops/engineering/starter-locale-coverage.md` regenerated. Its pack counts still come
  from the 2026-09-08 bundled catalogue; a newer catalogue import would change them.
- "First-run and error states" aren't in `CORE_PREFIXES` yet, because they're spread
  across areas. Add their prefixes as I2 finds them.

## I2: core screens in every shipped language

One bot per locale, in large batches: about 5 big dispatches per language beats 50
small ones.

1. The changed and added copyedit keys that fall on core screens.
2. The missing core-screen keys: `make i18n-batch L=xx P=<prefix>`.
3. Every batch goes through `make i18n-merge L=xx F=<batch>.json`, then
   `make i18n-traps L=xx`. Fix the real hits.

Light gates per batch: the merge itself, then `npm run check:i18n`. Rule 2b (rewritten
in I1) should pass at the end.

**Stop point after I1 and I2:** ask the owner to push. GitHub Actions runs the heavy
gates. Promote vi and ms after a visual walk-through (release checklist in
translating-interface.md), with the owner's go-ahead.

## I3: full catch-up (when there's time)

All remaining keys: common languages first, largest area first
(`make i18n-batch L=xx ARGS=--areas`), then the other shipped languages. Same
merge-and-traps method. This can be split across several sessions, with a stop point
every two locales or so.

## Cost

I2 is the core-screen keys × 17 common plus the other shipped languages. Report tokens
used after the first locale so the owner can stop or reorder. Doing all of I3 for the
common languages alone is roughly 4,400 keys × 17, about 75,000 key translations.
