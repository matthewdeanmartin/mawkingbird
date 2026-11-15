# German Politics integration — 2026-11-08

Owner approved the reviewed German-only selection. Integrated 12 accounts and four tags into Society, with native copy, lazy data/copy loaders and registry-derived route/sitemap. Preserved 37 existing bundles. Running is a separate private draft. No deployment requested. Validation follows.


## Validation

Importer: 38 pages, seven tests passed. Targeted Feed Builder: 78 tests/eight
files passed. Design inventory reviewed and check passed: 1722 sources/605
unchanged candidates; reconciliation unchanged. Locale report regenerated,
unchanged. Formatting and snapshot hash checks passed: 37 prior bundles unchanged.

`cd ui && make test`: 9563 passed, zero failed/skipped, but full gate exits 2 for
the pre-existing protected missing CommandBar test (authenticated Fedi control
with no foreign provider linked). No test baseline edits.
`npm run build:mockingbird` passed; initial bundle 927210 bytes, below 1 MB, topic
snapshots stay lazy. `make test-seo` passed. `npm run test:seo:browser` failed on
the existing Plant Based Living English count 12 vs 13 at check-seo-browser.mjs:602.
Focused German browser check passed: page and native hub, JS on/off, 12 people,
four tags, canonical, desktop/mobile overflow; screenshot inspected.

Logs/screenshots: OS artifact mawkingbird/logs/german-*. No commit or deployment.
No pipeline code changed in this topic; private topic/export schemas validated.
Shared-widget design-verify, real-backend integration and help-site gates not run
(no corresponding change). Signed-in follow/list writes remain manual.
