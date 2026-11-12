# Mawkingbird contributor notes

Use Git Bash and Make on Windows. The maintained Angular client lives in ui/.
The sibling mastodon_mock/ui is a frozen legacy fork; do not synchronize changes back.

For starter catalogue refreshes and language reconciliation, follow
ui/docs/starter-catalog.md and regenerate ui/docs/starter-locale-coverage.md.
Pack translations and app-wide UI locales are separate; preserve script tags.

Use Node 22 (CI) or a supported newer Node, and npm ci with the committed lockfile.

Gate cadence: iterate cheap, gate once. Every `ng test` pays a fixed compile
cost (about 70s for the full program, ~2 min more with coverage), so a full gate
after each edit costs the owner hours. While working, use only:
- `cd ui && make test-changed` (specs affected by your uncommitted edits, compiled
  as a narrowed program; `WATCH=1` keeps it running, rebuilds take seconds),
- `npm run test:subset -- <spec or dir>` for named specs (also narrowed),
- `npx prettier --check`/`ng lint --lint-file-patterns` on the files you touched,
- `npx playwright test --config ../design_system/playwright.config.mjs <file>`
  for the one design browser file you are working on.
Narrowed runs type-check only what they compile, so they never replace the gate.
When the work is done, run each gate required below once, on the final tree,
cheapest first (static checks, `make test`, build, SEO, design-verify). If a step
fails, fix it and rerun that step plus the affected specs, not the whole chain.
Rerun `make test` once more at the end only if source changed after its last
green run. Never loop the full gate to "make sure"; report the green runs you have.
`make test-quick` is `make test` without coverage, for a full-suite check midway.

Exception — routine Feed Builder SIG additions/data refreshes (owner reaffirmed
2026-11-08): use the minimal gate in the sibling
`mawkingbird_starters/spec/feed-builder/new-topic-playbook.md`. Data-only changes
need schema/import validation and changed-topic counts/languages plus unchanged
other snapshots. New topics using existing infrastructure add targeted Feed
Builder specs, changed-file formatting and design inventory review/check when
needed. Copy, lazy loader registrations, registry routes and hub mappings are
routine topic data work: do not run the full unit suite, production/SEO builds,
full-site SEO browser suite, design-verify or backend integration just for these.
Use an existing current preview for a focused smoke when available; otherwise
record it as not run. This exception applies to the broader full-test, runtime
build and SEO gate instructions below. Shared implementation changes still
require the relevant full gates. Do not alter protected test baselines.

Gate output is summarized: the build chunk table, per-file coverage (see
ui/coverage/index.html) and the manifest's added-test list are hidden. Set
VERBOSE=1 (chunk table, every Playwright test) or TEST_MANIFEST_VERBOSE=1 to
see them; check:i18n counts its advisories unless VERBOSE=1. ui/.npmrc sets
loglevel=warn, so npm's "notice run" lines are hidden. Agents: redirect long
gates to a log file and read its summary lines. Never write logs, screenshots or
scratch files into the working tree. Put them under the artifact folder:
`L=$(node ui/scripts/artifacts.mjs logs); make test > "$L/test.log" 2>&1`
(OS temp/mawkingbird, or $MAWKINGBIRD_ARTIFACTS). Test reports and browser
screenshots already go there. Set NO_COLOR=1 FORCE_COLOR=0
on test runs, and grep failures before opening a full dump. A red `make test`
ends by naming each failed test with its first message line.
This gate includes design:inventory-check and check:dead-code (knip: unused files and
undeclared dependencies) before the test inventory and coverage suite. Delete a file
your change orphans rather than silencing knip; `make dead-code` prints the full,
advisory report including unused exports.
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
CI runs design-verify on every push. design_system/stories provide fake services
(`Api`, `BlueskyApi`, …) to real components: when a component starts calling a
new service method, or its controls change, grep the stories and
design_system/tests for it and run that browser file. The browser suite uses 4
workers locally and 2 in CI; set DESIGN_BROWSER_WORKERS to override.
Do not skip, focus, delete, or weaken tests; preserve the test inventory checks.
Angular tests run locally; GitHub Actions builds and checks deployment layout.
For UI runtime changes, also run `cd ui && npm run build:mockingbird` locally.
Unit tests do not enforce production bundle budgets. Keep optional feature data
out of root imports and route guards; use the build's size report to verify.
Do not raise the 1 MB initial error budget to fix an accidental eager import.
The separate `make test-integration` suite exercises the real client against a
PyPI-installed mastodon-mock wheel in CI and locally. Never point this suite at
the sibling source checkout or an editable install. See docs/contributing.md.

In-repo libraries: domain-neutral code (language detection, RSS/OPML, dictionary,
ELIZA, link cleaning, sentiment, webmention) lives in ui/src/lib, per
ui/docs/libraries.md. A library never imports the app or another library; the app
uses one only through its lib.json entries. `npm run check:libs` enforces this.
Library specs run in `npm run test:libs` (unchanged libraries are skipped), not
in the Angular suite.

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
