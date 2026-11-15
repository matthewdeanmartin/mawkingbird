# Romance Books integration — 2026-11-08

Owner approved English and German Romance Books for the Communities hub.
Added native copy, lazy data/copy loaders and paths
`/romance-books-on-mastodon/` and `/de/liebesromane-auf-mastodon/`, filed under
Arts and culture. All romance subgenres remain welcome. Account selection
requires recurring book content or substantive author updates; useful quiet
tags remain followable. Saved holds and rejections are preserved by the
approved export.

Validation uses the routine SIG runbook: importer/schema checks, targeted Feed
Builder specs, changed-file formatting and reviewed design inventory. No full
application gate, production/SEO rebuild or full-site browser suite is planned
for this topic-only addition. No commit, push or deployment.

Imported selection: English 15 people and 20 tags; German five people and four
tags. All 71 targeted Feed Builder tests across eight files passed, including
both rendered editions and hub category coverage. Seven importer tests and
the 30-page bundle check passed. Changed-file formatting, design inventory
and diff checks passed. The inventory increased from 1,697 to 1,698 sources;
all 602 candidate entries stayed identical, with no reconciliation changes.
