# US Politics integration — 2026-11-08

Owner approved the English draft: “It is good enough! Onward to candadian.”
Imported the reviewed private export: 15 people and five tags. Registered
`/us-politics-on-mastodon/` under Society with lazy copy/data loaders. The shared
registry supplies client/server routes and sitemap entries. Copy explains
open hashtag streams and does not claim a guaranteed balanced political mix.

Approved-only staging preserves all 34 existing snapshots byte for byte.
No Canadian draft was imported. No deployment or commit was performed.
Importer validation (35 pages and seven tests), all 76 targeted Feed Builder
specs, and design inventory checks passed. Inventory adds one source file
(1720 total); all 605 control/style candidates and reconciliation dispositions
are unchanged. No shared widget changed.

Full gate, production and SEO validation results follow. Signed-in writes,
help-site and integration gates are outside this change.

## Final validation

Passed: importer/schema (35 pages, seven importer tests); targeted Feed Builder
specs (76); design inventory check (605 unchanged candidates); changed-source
formatting; locale coverage regeneration (no diff); all 34 previous snapshots
byte-identical; production `npm run build:mockingbird`; `make test-seo` including
SEO HTML, canonicals and sitemap; focused production browser smoke with and
without JavaScript (15 accounts, five tags, canonical and open-tag copy).
Screenshot reviewed: OS artifacts `logs/uspol-smoke.png`. Smoke process exited 0.
Initial JS/CSS is 927.05 kB, below the unchanged 1 MB error budget; the existing
900 kB warning remains. Copy and topic data stay lazy.

`make test` FAILED its protected runtime manifest check: the unchanged
CommandBar spec is missing “keeps the authenticated Fedi control available when
no foreign provider is linked”. All 9,561 executed tests passed, zero skipped,
zero failed. The manifest has 221 additions and one missing test; no baseline
was updated or protection weakened. The added USPOL test is one of the additions.

`npm run test:seo:browser` FAILED on unchanged Plant Based Living English data:
its browser assertion expects 13 accounts but the existing bundle has 12
(check-seo-browser.mjs:602). Prior snapshot hashes confirm this SIG did not
change that data. The unrelated expectation was left intact.

Logs: OS artifact `logs/uspol-full-test.log`, `uspol-production-build.log`,
`uspol-seo.log`, `uspol-seo-browser.log`, `uspol-subset.log`,
`uspol-feedbuilder-check.log` and `uspol-inventory-check.log`.
Not run: shared-widget design-verify (no shared widget edits), real-backend
integration, help-site gates, or signed-in account-writing checks. No publishing,
commit or deployment. Canadian Politics remains private and unapproved.

Concurrent workspace activity: while validation ran, owner-authored commit
`df571488f` captured the USPOL integration; `cd9dfa2b5` then changed only the
English UI dictionary. This agent did not create those commits. The checks
above describe the files exercised during their runs, not a fresh gate of the
later unrelated dictionary edit. The final validation evidence is the remaining
working-tree update to this sprint note.
