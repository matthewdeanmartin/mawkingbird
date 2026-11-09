# Dutch Culture integration — 2026-11-09

Owner approved the 46-account, four-tag Dutch Culture draft. Integrated locally
at `/nl/nederlandstalige-cultuur-op-mastodon`, under Arts and culture. Added
`/nl/mastodon-gemeenschappen`, native Dutch copy/controls/category labels and the
registry-driven Nederlands language option. Existing Dutch tools index is reused.
No global UI locale or starter-pack membership changes.

Dutch speakers anywhere, including Flanders, qualify through recurring cultural
posts. Normal 90-day activity and privacy checks remain. The public introduction
explicitly distinguishes recent Boeken/Poezie activity from the optional quiet
Boekentips/Muziektip tags, which had zero posts in the measured fortnight.

The bulk source import refused unrelated unpublished drafts before mutation.
Imported only the approved payload through the importer's `validatePage` function.
Other bundled topic files and generatedAt timestamps are unchanged. Turkish remains
pending approval. Raw posts and rejected-account evidence stay in the private repo.

Validation: importer schema/routes and seven importer specs passed. Design inventory
review found only source count 1726→1727; all 605 candidate files unchanged, and the
inventory/reconciliation check passed. Locale coverage report regenerated unchanged.
Focused Feed Builder specs: all 83 tests across eight files passed (log in OS artifact directory).

No full application/Python suite, production/SEO build, browser suite, design-verify
or backend integration run: routine SIG minimal gate. No current preview verified;
browser smoke deferred. No commit or deployment performed.
