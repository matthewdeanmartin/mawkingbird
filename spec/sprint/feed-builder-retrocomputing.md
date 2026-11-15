# Retrocomputing communities integration

Owner approved the four drafts on 2026-11-07 and requested adding them to
Mawkingbird. Recorded approval in the private data repository and imported
reviewed English (36 people, 20 tags), German (18, 10), French (7, 10) and
Spanish (6, 10). Italian and Japanese remain withheld for insufficient people.

Added localized copy, lazy data/copy loaders and canonical paths. Shared route
registry supplies the communities hub, server routes and sitemap. Quiet tags
remain selectable and sample cautions remain advisory. OldBytes is linked.
Used supported staging import to preserve all other public snapshots and exclude
unapproved topics. Compared every imported snapshot to the staging copy.

Validation uses Git Bash, Node 24.18.0 and locked npm ci. Targeted specs passed:
61 tests across seven Feed Builder files. Production build passed with initial
bundle 916.15 kB, above the existing 900 kB advisory but below the unchanged
1 MB error limit; lazy collection boundary passed.

Initial targeted invocation overlapped dependency installation and failed to
load its runner; rerun after installation passed. Initial full gate stopped on
a stale design inventory while unrelated scheduling work changed the shared
tree. Reviewed and regenerated inventory: 1,679 sources, same 598 candidate
paths; reconciliation remains complete. Full gate rerun results follow below.

Concurrent draft, scheduling and writer edits were preserved. No shared widget
changed by this topic. No commit, push or deployment. Signed-in actions remain
manual checks in test_plans/feed-builder-retrocomputing.md.

Validation results:

- Feed Builder import validation: 25 reviewed pages; importer tests passed.
- Targeted topic tests: 61 passed across seven files.
- Formatting, lint, storage, subpaths and i18n checks passed.
- SEO build checks passed: content, canonicals, verification links and sitemap.
- Full make test ran: 9,371 tests, three failures in concurrent WritePage
  scheduled-post replacement tests (loading old text, deleting the original
  after replacement, and avoiding publish after decline/failure). No Feed
  Builder failures. Unrelated edits and tests were not changed or weakened.
- Browser check initially found an ambiguous CSS selector shared by hashtag
  and YouTube lists. Corrected the assertion to inspect all list contents and
  reran; final result follows below.
- Private data make check passed: ruff, strict mypy and 566 tests.

Not run: shared-widget design-verify (no shared widget changed by this topic),
separate PyPI integration, full deployment-base matrix and signed-in actions.

Final browser check passed with JavaScript enabled and disabled, desktop and
mobile, across all four new editions and their communities links. Final
 git diff --check passed. No changes to existing topic data remain.
