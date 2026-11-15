# Running integration — 2026-11-08

Owner approved integration of the reviewed English and German editions. Added
native copy, lazy data/copy loaders, registry paths and Games and sport category.
English 8 accounts/5 tags; German 5 accounts/7 tags. All selected accounts are
opted-in community accounts. Other languages remain withheld. Imported only
approved Running exports via staging with the existing 38 bundles; hashes of
all 38 remain unchanged. No deployment or next SIG requested. Validation recorded below.


## Validation

Importer: 40 approved pages; 7 importer tests passed. All 38 prior bundle
hashes remain unchanged. Targeted Feed Builder: 79 tests in 8 files passed.
The initial two-language test needed TestBed reset between renders; corrected,
then rerun successfully. The first concurrent full run had compiled the old
fixture; a fresh full gate exercised the corrected test.

Full `cd ui && make test`: 9567 passed, 0 failed/pending. Gate exits 2 because
its protected inventory reports two missing existing tests: CommandBar keeps
the authenticated Fedi control available with no foreign provider linked;
Bookmarks pages native bookmarks 20 at a time and returns to a cached previous
page. These are outside this integration; no baseline changes made here.

Production `npm run build:mockingbird` passed: initial 927273 bytes, below 1 MB,
and snapshots remain lazy. `make test-seo` passed, including HTML, canonical,
language alternates and sitemap checks. Full `npm run test:seo:browser` failed
on existing Plant Based Living English count 12 versus 13 at line602.
Focused Running browser check passed for both editions and native hubs, JS
on/off, people/tag counts, Games and sport category, canonicals and desktop/
mobile overflow. German mobile screenshot inspected. Scratch server-helper
issues were fixed before the passing smoke run; no app changes were needed.

Design inventory/check passed: 1723 source files, 605 unchanged candidates;
reconciliation unchanged after review. Locale coverage report regenerated with
no content change. Changed source/data formatting and diff whitespace checks
passed. Logs and screenshots: OS temp/mawkingbird/logs/running-*.

No shared widgets, backend or help pages changed: design-verify, real-backend
integration and help-site gates were not run. Signed-in follow/list mutations
remain manual per test_plans/feed-builder-running.md. No deployment performed
by this task and no next SIG started. Local owner review server stopped and
PID28200 verified absent after approval.
