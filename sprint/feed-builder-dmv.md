# DMV communities integration

Owner approved the English-only draft and requested classification on the new
communities hub. Imported reviewed English data: 13 people, 20 tags. Added
/dc-maryland-virginia-on-mastodon/ and lazy data/copy loaders. DMV is filed under
the existing Society category, activating that category in the hub. Other hub
language filters show it as an English fallback; no translated DMV editions.

Copy states the requirement for recurring substantive regional posts. Residence,
profile location or membership of a local server does not qualify on its own.
Useful quiet local tags remain selectable; sample cautions remain advisory.
The verified dmv.community link is included. Existing public snapshots and
timestamps match the pre-import staging copies. No unapproved topic imported.

Design inventory reviewed against the working tree before DMV: 1,691 sources,
up one; identical 601 candidate entries. No reconciliation changes necessary.
Preserved concurrent hub/category, media, profile and server-status edits.

Validation uses Git Bash, Node 24.18.0 and locked npm ci. Final gate results
follow below. No commit, push or deployment. Account-writing actions remain
manual in test_plans/feed-builder-dmv.md.

- Approved importer validation passed: 26 public pages and five importer tests.
- Targeted Feed Builder specs passed: 67 tests across eight files.
- Production build passed: 917.74 kB initial bundle, above the existing 900 kB
  advisory but below the unchanged 1 MB error budget. Lazy boundary passed.
- Private data repository: ruff, strict mypy and 566 tests passed.
- Existing topic snapshot contents and timestamps preserved exactly.

Not run: shared-widget design-verify (no shared widget changed by DMV), separate
PyPI integration suite, full deployment-base matrix and signed-in actions.

- Formatting, lint, storage registry, subpaths and i18n checks passed.
- SEO prerender content, canonical, verification-link and sitemap checks passed.
- Full make test ran 9,416 tests with one unrelated ConnectionDoctorPage timing
  failure: its mocked immediate rejection measured 48 ms, so the expected
  instant-failure hint differed. No Feed Builder failure. Isolated diagnostic
  rerun started without changing the test or implementation.

Final browser checks passed with JavaScript on/off at desktop/mobile widths,
including Society filtering and English fallback. The isolated Connection Doctor
rerun passed all 22 tests; the original full run remains recorded as failed.
Final git diff --check passed. DMV integration is complete locally.

Owner requested proportionate testing for future SIG updates. Updated the private
playbook and ui/docs/seo.md to distinguish data refreshes, routine topic additions
and shared implementation changes. No further broad checks were run.
