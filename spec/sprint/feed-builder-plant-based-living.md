# Plant Based Living: Feed Builder integration

The owner approved the English and German selections and requested integration
into Mawkingbird. The topic offers welcoming vegan, vegetarian and plant-based
recipes, everyday ideas and constructive conversation. Copy explains the scope
and that public feeds can change; it does not promise a graphic-free network.

## Integrated pages

| Language | Route | People | Tags |
| --- | --- | ---: | --- |
| English | `/plant-based-living-on-mastodon/` | 13 | 3 live |
| German | `/de/pflanzlich-leben-auf-mastodon/` | 11 | 3 live, 1 future |

Only reviewed exports were imported. Other language editions remain withheld.
The shared registry supplies hub entries, client/server routes, hreflang and
sitemap entries. Topic copy and data use lazy imports. No other topic snapshot
changed. Positive-outreach curation remains in the private source repository;
only the export's allow-listed public fields entered this repository.

Added page-rendering tests and static/hydrated browser checks for the two pages,
including approved tags, language, canonical and alternate links, people counts
and desktop/mobile overflow. Manual signed-in checks are documented in
`test_plans/feed-builder-plant-based-living.md`.

Existing uncommitted Feed Builder UI changes were present at task start and
preserved. The design inventory was compared against that starting working-tree
snapshot: 1,670 to 1,671 sources; all 597 candidate entries unchanged. No shared
widget changed in this integration; reconciliation needs no new entries.

## Validation

Node 24.18.0, locked dependencies installed with `npm ci`. Logs are in
`.cache/plant-based-integration/`. Final gate outcomes are recorded below.

Passed so far:

- Private source repository: `make check` (563 tests, Ruff, mypy).
- `make feedbuilder-check`; targeted Feed Builder specs: 46 passed.
- `npm run design:inventory-check`; all 597 candidate files reconciled.
- `make test`: 9,322 passed, zero failed/pending; protected manifest has zero
  missing tests. The gate reports 165 additions across the working tree; this
  topic adds two. The protected manifest was not rewritten.
- `npm run lint`, `npm run format:check`, `npm run check:i18n`.
- `make starter-catalog-check`, locale coverage regeneration (unchanged),
  `npm run check:subpaths`, `npm run check:storage`.
- `npm run build:mockingbird`: initial 912.10 kB, under the 1 MB error budget;
  startup-boundary check passed, page data and copy remain lazy.

Build warnings: initial bundle exceeds the 900 kB warning threshold by 12.10 kB;
status-card and shell CSS exceed their warning thresholds; CommonJS warnings
remain for core-js and Readability. No budget thresholds were changed.

Final checks also passed:

- `make test-seo`: prerendered content, canonicals, social cards, verification
  links and sitemap checks. Both new URLs occur in the generated sitemap.
- `npm run test:seo:browser`: full suite passed with JavaScript enabled and
  disabled, desktop and mobile. New-page screenshots are
  `ui/.test-results/seo-plant-based-{en,de}-{client,static}.png`; the two mobile
  client screenshots were visually inspected with no layout defect observed.
- `git diff --check`.

Not run: `make design-verify` (no shared widget changes), `make test-integration`
(no client/API behavior changes), authenticated follow/list manual steps,
help-site gates (no `docs/` or mkdocs changes), or deployment. No tests were
removed, skipped, weakened or newly protected through a manifest rewrite.
No commits or publication were requested or performed.
