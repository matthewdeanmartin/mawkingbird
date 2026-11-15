# Canadian Politics integration — 2026-11-08

Owner: “Approved! Integrate into the hub.” Recorded approval for English and
French and re-exported reviewed data: eight English accounts, five French,
three tags per edition. Added both native-copy pages under Society with lazy
copy/data loaders and shared route/sitemap/language registration.

The approved-only import preserved all 35 previous snapshots byte for byte.
German Politics is a separate private draft. No shared widgets changed.
Reviewed design inventory: 1721 sources, all 605 candidates unchanged; no
reconciliation edits needed. Validation results follow.

Focused visual review found a pre-existing mismatch in the shared selection
explanation: non-English copy still said 2500 despite the 625 prominence gate
and badges. Corrected the five non-English explanations, preserving English
and both evidence badge labels. This is page copy, not a shared design widget.


## Final validation

- `make feedbuilder-check`: passed, 37 bundled pages and seven importer tests.
- `npm run design:inventory-check`: passed, 1721 sources / 605 candidates;
  candidate dispositions unchanged and inventory reviewed.
- Targeted Feed Builder suite: 77 tests passed (eight files), including the new
  French edition check. Changed-source formatting and `git diff --check` passed.
- `cd ui && make test`: all 9562 tests passed, zero skipped/failed. Gate exits 2
  because the pre-existing protected manifest entry is missing:
  `CommandBar keeps the authenticated Fedi control available when no foreign provider is linked`
  in `src/app/command-bar/command-bar.spec.ts`. Baseline was not modified.
- `npm run build:mockingbird`: passed, initial JS+CSS 927152 bytes, below 1 MB;
  starter/topic snapshots remain lazy. Existing warning budgets remain warnings.
- `make test-seo`: passed after the final translated threshold-copy correction.
- `npm run test:seo:browser`: ran before that copy-only correction and failed
  at the existing Plant Based Living English assertion (12 accounts vs expected
  13, check-seo-browser.mjs:602). Not rerun after the copy-only correction.
- Focused Canadian browser checks passed after the final build: English/French
  page and native hub, JavaScript on/off, canonical/hreflang, account/tag counts,
  language links, desktop/mobile overflow. Final French screenshot inspected;
  selection explanation now says 625 for clearly French-language accounts.
- All 35 existing bundle hashes rechecked unchanged. German draft absent client.

Logs/screenshots are under OS artifacts `mawkingbird/logs/canadian-*`; final
runs use `*-final.log`. Full test JSON is in `mawkingbird/test-results/full.json`.
The test/build/browser command chain exited; no batch worker was left running.
No deploy or commit performed. `make design-verify` was not run (no shared widget
change); real-backend integration and help-site gates were not run (no related
changes). Signed-in follow/list writes remain the documented manual check.
