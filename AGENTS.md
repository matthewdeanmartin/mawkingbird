# Mawkingbird contributor notes

Use Git Bash and Make on Windows. The maintained Angular client lives in ui/.
The sibling mastodon_mock/ui is a frozen legacy fork; do not synchronize changes back.

For starter catalogue refreshes and language reconciliation, follow
ui/docs/starter-catalog.md and regenerate ui/docs/starter-locale-coverage.md.
Pack translations and app-wide UI locales are separate; preserve script tags.

Use Node 22 (CI) or a supported newer Node, and npm ci with the committed lockfile.
Run targeted specs during development, then the complete gate: cd ui && make test.
This gate includes design:inventory-check before the test inventory and coverage suite.
For every client change, inspect ui/package.json, ui/Makefile and the applicable
.github/workflows checks; unit tests and a production build alone do not cover CI.
The design inventory records source line numbers, so even nonvisual HTML/TS/CSS
edits can change it. If it is stale, run `cd ui && npm run design:audit-controls`,
review design_system/audits/06-control-inventory.json, update
design_system/audits/06-consolidation.md, and reconcile added/removed candidate
files in design_system/audits/11-reconciliation.json. Then rerun
`npm run design:inventory-check`. Never bypass the check or regenerate without review.
Shared design-widget changes also require `cd ui && make design-verify`, including
the browser assertions. Report exactly which gates passed and which were not run.
Do not skip, focus, delete, or weaken tests; preserve the test inventory checks.
Angular tests run locally; GitHub Actions builds and checks deployment layout.
For UI runtime changes, also run `cd ui && npm run build:mockingbird` locally.
Unit tests do not enforce production bundle budgets. Keep optional feature data
out of root imports and route guards; use the build's size report to verify.
Do not raise the 1 MB initial error budget to fix an accidental eager import.
The separate `make test-integration` suite exercises the real client against a
PyPI-installed mastodon-mock wheel in CI and locally. Never point this suite at
the sibling source checkout or an editable install. See docs/contributing.md.

Where documents go: docs/ holds end-user help guides only. Every file there
must be in the mkdocs.yml nav; it is published to Read the Docs and as static
pages at mawkingbird.com/help/ by scripts/build_help.py. Internal plans,
inventories and feature specs go in spec/; sprint plans and their evidence go
in sprint/; client engineering notes go in ui/docs/. After editing docs/ or
mkdocs.yml, run `make help-site-test` and `make help-site` from the repository
root (uv, wheels only). Public, indexable pages and their sitemaps are described
in ui/docs/seo.md; keep a page's client route, server route, sitemap entry and
SEO checks in sync, and run `cd ui && make test-seo && npm run test:seo:browser`.

Read MIGRATION.md before modifying publishing. Keep all public origins, OAuth
redirect URLs, and persisted storage key names stable. This repository now hosts
mawkingbird.com; production must use base href `/`. Do not publish a project-path
mirror build to this site's root. Docs remain under docs/ and use Read the Docs.
