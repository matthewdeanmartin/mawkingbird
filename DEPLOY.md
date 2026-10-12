# Deploy Mawkingbird

Use Git Bash and Make on Windows, Node 22 or a supported newer version, and
the committed npm lockfiles. This is the current deployment runbook. Read the
current configuration section of `MIGRATION.md`; its older hosting topology
and cross-repository publisher instructions are historical.

## Targets

| Component | Production | Preview/test |
| --- | --- | --- |
| Angular client (`ui/`) | `https://mawkingbird.com/`, base `/` | `/canary/` and `/test/` |
| CORS proxy (sibling `mawkingbird_cors_proxy`) | `cors.mawkingbird.com`, Worker `mawkingbird-cors-proxy` | Worker `mawkingbird-cors-proxy-test` |

GitHub Pages uses **GitHub Actions** in `matthewdeanmartin/mawkingbird`.
`gh-pages` is the assembled site store; preserve its production root, canary
and test subtrees. Never publish a `/mawkingbird/` build at the production root.
Do not modify the frozen `mastodon_mock/ui`, DNS, OAuth origins, persisted
storage keys, or secrets as part of a routine deployment. Docs remain on Read
the Docs.

## Prepare a release

1. Inspect `git status`, the diff, `git log`, and remote refs in each repository.
   Do not include unrelated uncommitted work. Use an isolated worktree when
   necessary. Commit only the reviewed release files; do not add co-author
   trailers. Do not force-push publishing branches.
2. Record the exact source SHA, current `gh-pages` SHA, current Worker versions,
   and any migration prerequisite. Check `gh auth status` and the proxy's
   `npx wrangler whoami`. Never print credential values.
3. For app runtime changes, run `cd ui && npm ci`, targeted specs, `make test`,
   `npm run lint`, and `npm run build:mockingbird`. Preserve the test inventory
   and the 1 MB initial bundle budget. Check storage, i18n and subpath contracts.
   If controls changed, regenerate `npm run design:audit-controls`, review
   `design_system/audits/06-control-inventory.json`, classify new candidate files
   in `11-reconciliation.json`, and update `06-consolidation.md`.
4. Push the release to `main`. This deploys canary/test automatically when
   `MAWKINGBIRD_PUBLISH_ENABLED=true`. Wait for **Validate client builds**,
   integration checks, and **Deploy Mawkingbird Canary and Test** to succeed.
   A successful Pages publish does not mean the separate validation gate passed.

## Deploy backend prerequisites first

Read the sibling proxy's README, Makefile and Wrangler config. Use its installed
Wrangler version. Check the selected bindings and remote configuration before
uploading; a normal deploy can replace dashboard variables and routes.

```bash
cd ../mawkingbird_cors_proxy
npm ci
npm run check
npx wrangler deployments list --env=test
npx wrangler deployments list --env=""
make deploy-test
# Smoke-test test before production.
make deploy-prod
```

`make deploy` aliases **test**, regardless of `ENV`. Use `deploy-prod` explicitly
for production. The test environment must keep `routes = []`, separate KV/D1
bindings, and sandbox billing. Never activate membership or rotate secrets as
an incidental part of deploying a reader feature.

The proxy's durable checkout code requires the sibling auth repository's
`migrations/0004_billing_operations.sql`. If that code is in the release, check
pending migrations with `wrangler d1 migrations list` using the matching config,
environment and `--remote`. Review and apply required migrations to test first,
then production, before uploading dependent Worker code. Applying a migration
does not require deploying unrelated auth source changes.

For video feeds, `/health` must list `youtube` and `youtube-search`. Verify a
free proxied channel RSS read, handle lookup, allowed-origin preflight, rejection
of a disallowed YouTube path, and rejection of search without a verified Plus
token. Test authenticated Plus search with an authorized account when available;
do not mint production customer tokens merely for a deployment smoke test.

## Promote the client

Run the current workflow from `main`, with the exact validated release SHA:

```bash
gh workflow run mockingbird-pages.yml --ref main -f ref=RELEASE_SHA
gh run list --workflow mockingbird-pages.yml --limit 5
gh run view RUN_ID
```

Wait for the run to complete successfully. It builds the root with base `/`,
stamps OAuth metadata, validates layout, replaces only the production subtree,
uploads the complete assembled site, and performs the actual Pages deployment.
Both publishers share a concurrency lock; do not manually overwrite `gh-pages`.

## Verify and record

Check HTTPS root and `/videos`, referenced JS assets, base href `/`, production
OAuth metadata, and `/canary/canary-commit.txt` plus `/test/test-commit.txt`.
Verify proxy `/health` on both hosts and the free video route. In a browser,
subscribe/unsubscribe, refresh newest-first cards, activate an embed explicitly,
and test Plus search when access is available. Record limitations of HTTP-only
verification rather than claiming a browser or account test was performed.

Record the source SHA, Actions run URL, Worker version IDs, migrations applied,
and smoke-test results. A successful upload alone is not a verified release.

## Rollback

Promote a recorded known-good client SHA through the **current** production
workflow on `main`; keep preview subtrees intact. For a Worker rollback, inspect
`wrangler rollback --help` and Cloudflare's rollback limitations, then restore the
recorded version in the exact environment. Worker rollback does not undo D1 or
Durable Object data/migrations. Do not drop billing tables or reset live branches
as a code rollback.
