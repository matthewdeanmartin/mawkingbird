# Six-locale translation batch, 2026-11-24

Finnish (`fi`), Czech (`cs`), Norwegian Bokmål (`nb`), Thai (`th`), Arabic (`ar`)
and Filipino (`fil`) each contain the same 2,758 priority keys: 16,548 translated
entries in total. Norwegian was requested twice and is implemented once. Browser
aliases `no` → `nb` and `tl` → `fil` resolve to the corresponding locale.

The dictionaries match the existing priority work order exactly, including the
mandatory Lite/offline safeguards. The English source values still match that
work order. Long prose remains mostly English fallback. Each locale has a
terminology glossary and source stamps. Translation agents used `gpt-6.2-sol`.
These are in-progress locales, offered on test/canary; production registration
has not changed. Starter catalogue UI coverage was regenerated.

Arabic sets document direction from the active interface or pinned public-page
language and resets it on language changes. Entry surfaces use logical alignment;
user text determines its own direction, and technical identifiers stay LTR.
Shared field/checkbox hints determine their own direction so English fallback
remains readable. This is basic RTL support, not a claim that every signed-in
surface has completed RTL review.

Validation completed:

- `check:i18n`: 10,624 English keys; all registered dictionaries present, no
  placeholder/structure failures or over-budget strings.
- Exact key-set and unchanged-English checks for all six dictionaries.
- Targeted Angular lint passed for every changed TypeScript/HTML file.
- I18n/moderation tests: 11 files, 113 tests passed.
- StatusCard/Compose/Write tests: 3 files, 543 tests passed.
- Checkbox/Field tests: 2 files, 9 tests passed.
- Standalone development preview compiled without changing production budgets.
- Browser checks: Finnish/Czech/Norwegian/Thai/Filipino login, welcome and
  language settings at 1280px and 390px; Arabic login/welcome at 1280px, 390px
  and 320px, including live Arabic → English → Arabic switching. Checked
  document direction, page overflow, fallback hint/content direction, and locale
  selection. Screenshots were reviewed for the new scripts and narrow layouts.
- All six dictionaries loaded under `/`, `/_ui/`, `/test/` and `/canary/` in the
  local preview. This does not verify deployed hosting configuration.
- Design inventory regenerated and reviewed: 730 candidate files unchanged,
  identical control findings, three source-offset changes only. Reconciliation
  check passed. No control dispositions changed.

Logs are under `log/i18n-six-*`; screenshots and the development preview are in
the machine temporary directory, outside the tracked tree.

Full quality gates were not rerun, as requested: no full test suite, production
build, SEO, integration, full design verification or packaged Native validation.
No Native host changes or deployment were made. Native-speaker review and broader
signed-in/RTL review remain required before production promotion.
