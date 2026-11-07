# Gardening and Houseplants communities integration

Owner approved the three drafts and requested adding them to communities on
2026-11-06. Integrated reviewed English (14 people, 12 tags), German (8, 11)
and French (5, 12) editions. Spanish, Italian and Japanese remain withheld.

Routes, lazy data/copy loaders, localized page copy, communities registry and
generated sitemap agree. Useful quiet tags, including succulents and hydroponics,
remain selectable; existing sample cautions are preserved. No server invented.
Farming and animal husbandry remain outside the selection.

The default sibling import refused abandoned Frugal Living drafts as designed.
Used the importer's supported source-path argument with a private staging
directory containing existing public snapshots plus approved gardening exports.
Other topic contents and timestamps are preserved. No draft bypass used.

Validation in Git Bash, Node 24.18.0, locked `npm ci`:

- Feed Builder validation: 19 pages; importer tests passed.
- Targeted Feed Builder specs: 48 tests across six files passed.
- Full `cd ui && make test`: passed, runtime manifest 9,324 present, 167 added,
  zero missing. Existing added tests remain unprotected; no manifest rewrite.
- Design inventory check passed after review: 1,673 sources, unchanged 597
  candidate files. Reconciliation needs no changes.
- Formatting, lint, storage registry, deployment subpaths and i18n checks passed.
- `npm run build:mockingbird` passed; initial bundle 912.36 kB, above the 900 kB
  advisory but below the unchanged 1 MB error budget. Topic data remains lazy.
- `make test-seo` and `npm run test:seo:browser` passed, including communities
  discovery, canonical/hreflang metadata, quiet tags, JS on/off and mobile width.
- `git diff --check` passed.

An initial targeted attempt overlapped dependency installation and could not
load Angular CLI. Reran after `npm ci` completed; the successful counts above
are from that completed run.

Not run: shared-widget `make design-verify` (no shared widget changed), PyPI
integration suite, full deployment-base matrix and signed-in manual actions.
Manual check plan: `test_plans/feed-builder-gardening-and-houseplants.md`.
No commit, push or deployment. Existing uncommitted math work preserved.
