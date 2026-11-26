# Mawkingbird contributor notes

Git Bash and Make on Windows; Node 26; `npm ci`. The client is `ui/`. The sibling
mastodon_mock/ui is a frozen fork: never sync to it.

## Don't break Native

The desktop app is this same `ui/` plus a Rust host. 0.1.0 shipped unable to post
because these were missed.

- **Never edit `native/`.** It is generated: the private `../mawkingbird_native`'s
  `make deploy-source` deletes and replaces it. Change the host there. Run
  deploy-source only when asked. A new kind of host file (SQL, fixture) must be added
  to the list in its `scripts/deploy-source.sh`.
- **Native sends only what Rust lists**, so a new endpoint, method, header, host,
  upload, download or WebSocket in `ui/` works on the web and fails there. Lists:
  `mastodon_write.rs`, `public_mastodon.rs`, `bluesky.rs`, `misskey.rs`; any other
  host needs a typed command (the webview has no network).
- In the same change, extend the list, or hide the control in Native and add it to
  `spec/native-transport-gaps.md`. A button that can only fail is a bug.
- `NATIVE_CHANGELOG.md` lists only what works in Native. Follow
  `ops/NATIVE_CHANGELOG_RUNBOOK.md`; releases: `ops/NATIVE_RELEASE.md`. Never commit,
  push, release or move a tag unless told to.
- **Release automation owns version bumps and Unreleased promotion.** Read
  `ops/NATIVE_RELEASE.md` before release preparation. Do not run `kaclm release`
  or edit version files locally to compensate for workflow drift; report it.


## Gates: iterate cheap, gate once

Formatting must NEVER fail GitHub builds or required build/quality gates. Keep
Prettier checks in optional, manually invoked local commands; never add them to
CI or aggregate gates. Cosmetic failures waste the owner's paid build minutes.

A full gate costs minutes of compile, so never loop it. While working:

- `cd ui && make test-changed` (`WATCH=1`), or `npm run test:subset -- <spec|dir>`.
  These type-check only what they compile; they don't replace the gate.
- `npx prettier --check` and `ng lint --lint-file-patterns` on touched files.
- One design file: `npx playwright test --config ../design_system/playwright.config.mjs <file>`.
- Shareable routes: `python -B -X utf8 ui/scripts/audit_deep_links.py`, then
  `npm run test:deep-links` once. `make test-deep-links-browser` (~3 min) once, after
  changing routes, the resolver or landing error states.

At the end, on the final tree, cheapest first, once each: static checks,
`make test`, `npm run build:mockingbird` (runtime changes; enforces bundle budgets),
SEO, design-verify. Fix and rerun only the failed step; rerun `make test` only if
source changed since it was green. Check ui/package.json, ui/Makefile and the
workflows for what applies. Native archive roadmap: two sprints per full gate.

- Design inventory stale (any HTML/TS/CSS edit can do it): `npm run
  design:audit-controls`, review design_system/audits/06-control-inventory.json,
  update 06-consolidation.md and 11-reconciliation.json there, then
  `npm run design:inventory-check`. Never regenerate without review.
- Shared design widgets: `make design-verify`. A component that calls a new service
  method or changes controls: grep design_system/stories and tests for it, run that file.
- `make test` ends by naming failures. Delete files your change orphans; don't silence knip.
- Never skip, focus or weaken a test to get a green run, or raise the 1 MB initial
  budget. Keep optional feature data out of root imports and route guards.
- **Tests that disappear are reported to the owner, each with its justification**, in
  your final message, and declared in `ui/test-removals.md`; the run fails otherwise.
  Renaming a test, or removing one for dead code or because it was poorly conceived, is
  fine and needs no permission. Say so plainly. Green runs write the test manifests;
  never edit them.
- `make test-integration` uses the PyPI mastodon-mock, never the sibling checkout.
- Logs go to `log/`, never elsewhere in the tree:
  `L=$(node ui/scripts/artifacts.mjs logs); make test > "$L/test.log" 2>&1`.
  Set NO_COLOR=1 FORCE_COLOR=0; `VERBOSE=1` unhides detail; grep before dumping.
- Report exactly which gates passed and which were not run.

**Feed Builder topics and data refreshes** use only the minimal gate in the sibling
`mawkingbird_starters/spec/feed-builder/new-topic-playbook.md` (schema and counts; for
a new topic, its specs, formatting and the design inventory). No full suite, builds,
SEO, design-verify or integration unless shared code changed.

## Where things go

- `ui/src/lib`: domain-neutral code. Never imports the app or another library; used
  through lib.json entries (ops/engineering/libraries.md; `npm run check:libs`,
  `npm run test:libs`).
- `docs/`: end-user help only, each file in the mkdocs.yml nav; then
  `make help-site-test help-site`. `ops/`: runbooks. `ops/engineering/`: guides.
  `spec/`: plans and evidence; retired ones in `spec/history/`.
- Public pages: keep client route, server route, sitemap and SEO checks in sync
  (ops/engineering/seo.md); `make test-seo && npm run test:seo:browser`.
- Starter catalogue and languages: ops/engineering/starter-catalog.md; regenerate
  starter-locale-coverage.md. Pack translations are not UI locales; keep script tags.
- Publishing: read ops/DEPLOY.md first. Keep origins, OAuth redirects and storage keys
  stable. Production base href is `/`; never publish a project-path build to the root.
