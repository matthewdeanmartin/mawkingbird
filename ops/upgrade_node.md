# Upgrading Node: 26 baseline and the next move to 27

## Scope and baseline

The 2026-11-26 first pass prioritized `mawkingbird*`. The authorized follow-up
fixed its bundle sizes and completed `mastodon_is_my_blog`, `mastodon_mock`,
`mimb_co`, and `mistersql`. `REFERENCE` and standalone `fediblog` are excluded.
The follow-up did not touch `mawkingbird/extension` code.
Changes are local and uncommitted; no deployments or hosted workflows were run.
Validation is compilation/build only, as requested, not the full contributor
quality gates or security audit procedure.

The validation runtime is the official Windows x64 **Node 26.13.1**, with its
bundled **npm 11.20.0**. The archive was checked against the official SHA256 list.
The machine's existing default was Node 24.18.0/npm 12.0.2; it was not replaced.
For this installed validation copy, in Git Bash:

```bash
export PATH='/c/Users/matth/.cache/node-upgrade/node-v26.13.1-win-x64':"$PATH"
node --version
npm --version
```

The ten upgraded repository roots now have `.nvmrc` selecting 26. npm packages
declare `engines.node` as `>=26 <27`; this deliberately makes the next major an
explicit migration. `.nvmrc` needs a version manager that reads it and does not
change the active shell by itself.

## What the 22/24 to 26 move taught us

- Change all workflow `node-version` inputs, including release, integration,
  canary, design-system, Pages, and private native workflows. Most were on 22;
  Plus and private native were on 24.
- The main UI was Angular 21.2.26/TypeScript 5.9. Angular 21's documented Node
  support stops at 24. Angular 22 supports Node 26 and requires TypeScript 6.
  Use the official Angular updater for core, CLI, and angular-eslint together;
  inspect its migrations rather than overriding peer dependencies.
- The official Angular migration initially rejected the external
  `../design_system/.storybook/tsconfig.json` path. For the application
  migrations, temporarily omit the two Storybook targets and restore them in
  `finally`, preserving any other CLI config migrations. Run the same official
  core schematics for Storybook with the repository root as the schematic tree
  and a temporary root workspace pointing at its tsconfig; remove that temporary
  workspace afterwards. Do not silently skip the external stories.
- Angular 22 migrations explicitly preserve eager change detection and XHR
  transport, and wrap affected optional-chaining template expressions. Expect
  a substantial mechanical source/test diff, not just package files. No tests
  were removed. Keep existing strictTemplates enabled.
- Check Storybook and translation-library peers before moving Angular. The
  existing Storybook 10.6.0 and Transloco 8.4.0 peer ranges admit Angular 22.
- Update direct `@types/node` dependencies along with the runtime. The three
  Workers already used 26 types; UI and Plus started on 22 and 24 types.
- Keep package-lock root engine metadata synchronized with package.json. Do not
  replace every transitive dependency's Node requirement with our chosen major.
- Node and npm versions are separate: this Node 26 archive bundles npm 11,
  whereas the preexisting Node 24 installation had npm 12.
- Installation emitted allowScripts warnings for esbuild/workerd. Do not enable
  native source builds to suppress warnings; check published platform binaries
  and investigate an actual build failure if one occurs.
- News built with a dependency's `module.register()` deprecation warnings.
  These were warnings, not a compile blocker.
- Cloudflare Workers run on workerd; selecting Node 26 upgrades local/CI tooling,
  not the deployed Worker runtime or its compatibility date.
- `mawkingbird/native` is generated. Never edit it or run deploy-source as part
  of this upgrade. The private native repository builds the shared UI; its
  workflow input must identify a committed frontend containing the upgrade
  after the operator separately authorizes committing/pushing it.
- Historical sprint evidence keeps its original Node versions.

## GitHub Actions runtime boundary

Project commands now select Node 26. Existing action references are unchanged.
`actions/setup-node@v7.1.0` and `actions/checkout@v7.0.1` declare `runs.using:
node24` in their own action.yml. A workflow's `node-version` does not change
that internal runtime. Do not invent a `node26` action runtime or force an
unsupported runner override. Revisit upstream action releases when upgrading
to 27. The private native actions.lock needs no dependency change merely for
an input value change.

## Procedure for Node 27

1. Inspect status and applicable AGENTS.md in each repository. Preserve local
   work. Exclude `REFERENCE`; do not commit, push, publish, or dispatch workflows
   unless separately instructed. Read the shared SECURITY_UPGRADES.md if
   upgrading action dependencies/security tooling; never add Dependabot without
   explicit instruction.
2. Check the official Node release index for a suitable published 27 release
   and binaries for all target platforms. At this pass, the index listed only
   Node 27 alpha releases. Do not mistake an alpha for a stable migration target.
3. Install a separate checksum-verified binary, select it in Git Bash, and record
   `node --version` and `npm --version`. Use `python -X utf8` for any Python helper.
4. Inventory tracked package.json files, `.nvmrc`, workflow inputs/matrices,
   Dockerfiles, local scripts and current setup documentation. For example:

   ```bash
   git grep -n -E 'node-version|NODE_VERSION|node:|Node 26|Node.js 26' -- \
     ':!**/package-lock.json' ':!native/**' ':!spec/history/**'
   git ls-files '*package.json' '*.nvmrc' '*.node-version' '*Dockerfile*'
   ```

5. Check Angular's **documented** compatibility table, npm engine declarations,
   TypeScript requirements, Angular ESLint and Storybook peers. A permissive
   `>=26` dependency engine is not proof of official Node 27 support. If a new
   Angular major is necessary, use `ng update` and inspect each migration. Keep
   a concrete exception on 26 if the supported dependency combination cannot
   resolve or compile. Never use `--force`/`--legacy-peer-deps` to hide it.
6. Update `.nvmrc`, package engines (to `>=27 <28` if that remains the policy),
   direct Node types, active setup documentation, and every owned GHA Node
   selection. Regenerate npm locks using the chosen runtime. Preserve external
   action SHA pins and existing locks; when changing action references, use the
   official Actions lock generator and the applicable repository procedure.
7. Run `npm ci` and the smallest relevant compile/build from the table below.
   Keep logs in `mawkingbird/log/`. Resolve compile blockers without weakening
   budgets or tests. Do not expand to broad quality gates unless requested. If bundle budgets
   fail after successful compilation, record that build failure separately from
   compiler compatibility; do not claim the production build passed.
8. Inspect diffs and report actual passes, failures, warnings and exceptions.
   Distinguish local compilation from hosted CI and native installer builds.
   Stop at the agreed batch boundary and list remaining repositories.

## Build commands and 26 results

All paths below are relative to `C:/github/mimb` and use the selected Node 26.

| Target | Minimal command | Result |
| --- | --- | --- |
| mawkingbird/ui compiler | `npx ngc -p tsconfig.app.json --noEmit` | Passed |
| mawkingbird/ui production | `npx ng build --configuration mockingbird --stats-json` | Passed, initial 934.17 kB |
| mawkingbird Storybook types | `npm run design:check` | Passed |
| mawkingbird/news | `npm run build -- ../../mawkingbird/log/node26-news-site` | Passed, 2 posts |
| mawkingbird/extension | `make build` | Passed, unsigned ZIP |
| mawkingbird_plus | `npm run build` | Passed, Astro check and 29 pages |
| mawkingbird_auth | `npm run typecheck` | Passed |
| mawkingbird_cors_proxy | `npm run typecheck` | Passed |
| mawkingbird_profile | `npm run typecheck` | Passed |
| mawkingbird_native | `MAWKINGBIRD_SOURCE=../mawkingbird node scripts/build-frontend.mjs` | Passed, initial 944.21 kB |

The initial upgrade produced bundles of 1,013.01 kB (web) and 1,023.11 kB
(native), exceeding the unchanged 1,000 kB error threshold. The follow-up moved
`FailWhale` behind `@defer (on immediate)` inside its existing visibility
condition in `ui/src/app/app.ts`. Its server-picker/reporting dependencies now
load when the failure overlay is needed instead of on every healthy visit.
The two production builds now pass at **934.17 kB web / 944.21 kB native**,
saving about 79 kB each. The 900 kB warning remains; the 1 MB error budget was
neither raised nor disabled. This is a bundle-size result, not a measured browser
performance or offline-recovery test. Logs are `log/node26-bundle-fix-web.log`
and `log/node26-bundle-fix-native.log`.

The Worker rows are TypeScript compilation only, not deploys or runtime tests.
Native host/Rust builds and installers are outside this Node-only check.
Diff whitespace checks passed in all seven changed repositories, package/lock
root engines match, and workflow diffs were checked to contain only Node-input
changes. The main UI diff is large (official Angular migrations across components,
test fixtures, and templates); no files/tests were deleted. The Storybook targets
were restored unchanged and the temporary root workspace was removed.

Tests, browser suites, lint/security audits, and hosted GitHub Actions were not
run. Existing CI gates remain in place.

## Completed follow-up: four repositories

| Repository / target | Node 26 validation | Result |
| --- | --- | --- |
| mastodon_is_my_blog/web main | `npm run build` (first half of `build:all`) | Passed, 718.35 kB initial |
| mastodon_is_my_blog/web Lite | `npm run build:lite` | Passed, 333.50 kB initial |
| mastodon_is_my_blog/docs-src | `npm run build:styles` and `npx eleventy --output=../../mawkingbird/log/node26-blog-docs` | Passed, 762 files; reused existing data, no database export |
| mastodon_is_my_blog/docs-theme | `npm run build` | Passed, 24 files and service-worker compilation |
| mastodon_mock/ui | `npm run build` | Passed, 291.38 kB initial |
| mimb_co/web | `npm run build` | Both signup/admin passed, 331.15 / 399.16 kB initial |
| mimb_co/presentations | `npm run build` | Passed, three 30-slide decks |
| mistersql | `hugo build --renderToMemory --gc --minify` | Passed, Hugo 0.164.0; Node 26 selected in shell |

All four have Node 26 `.nvmrc` pins. Owned npm packages require `>=26 <27`
and their lock metadata matches. The blog and mock Angular projects migrated
from 21 to **22.3.0 / TypeScript 6.0.3**; mimb_co already used Angular 22.
The mock remains an independent frozen UI: no Mawkingbird feature code was
copied into it. Owned GHA inputs now select 26; the blog's GitLab Node images
also select `node:26-slim`. MisterSQL pins 26.13.1 in its workflow; that setup
step is conditional on a root npm lock, which this Hugo-only checkout does not
currently have. Its upstream `themes/ananke` submodule was not modified.
There are no tracked GHA workflows in mimb_co.

Additional lessons and compile fixes:

- The blog's installed TypeScript ESLint version rejected TypeScript 6. Updating
  `typescript-eslint` within its declared `^8.70.0` range before `ng update`
  allowed normal peer resolution. No force/legacy-peer-deps override was used.
- The Lite bulk-account component imported a missing `LiteFollowCandidate`.
  Added its typed shape (`acct`, optional display name and resolved account)
  to lite.models.ts; the failed Lite build then passed.
- Pack11ty **2.6.1** (the current npm release checked during this pass) uses raw
  Windows paths for dynamic imports and backslashes in fast-glob patterns.
  The docs theme now uses a file URL for its own import and a Windows-only
  synchronous `registerHooks` adapter scoped to the plugin. `pack11ty-glob.mjs`
  normalizes only that plugin's patterns using its own fast-glob dependency.
  No node_modules files were patched. Remove the adapter when an upstream
  release fixes both behaviors. This was a Windows portability problem, not
  evidence that Node 26 itself is incompatible. The theme reports missing
  optional webmention credentials but completes successfully.
- Presentation builds failed because 74 referenced Mawkingbird source paths
  had moved. Updated the explicit paths in all three content modules (including
  disambiguating production versus testing catalogue files), then regenerated
  their tracked decks and evidence manifest. No lecture prose was rewritten.
- All four repos passed `git diff --check`. No tests were deleted. Existing
  blog backend/Makefile/dev-port edits were preserved. Tests, broad security
  audits, browser checks and hosted CI were not run.

## Exclusions and remaining work

- Standalone `fediblog` remains untouched at the operator's request.
- `REFERENCE` remains untouched.
- No remaining compile/build blocker in the requested Node 26 batch.
- Runtime testing and hosted CI are still operator follow-up; the machine-wide
  Node default was not replaced. Use the documented Node 26 PATH or a version
  manager before working in these repositories.
- `mastodon_clients` has no tracked Node package. The other `mawkingbird*`
  directories contain Go/Python/data/specs rather than owned Node packages or
  explicit GHA Node selections; their non-Node runtimes were not changed.

## Sources to recheck next time

- [Node release index](https://nodejs.org/dist/index.json)
- [Node 26.13.1 checksums](https://nodejs.org/dist/v26.13.1/SHASUMS256.txt)
- [Angular version compatibility](https://angular.dev/reference/versions)
- [Angular update guide](https://angular.dev/update-guide)
- [setup-node v7.1.0 action definition](https://github.com/actions/setup-node/blob/v7.1.0/action.yml)
- [checkout v7.0.1 action definition](https://github.com/actions/checkout/blob/v7.0.1/action.yml)

- [Node synchronous module hooks](https://nodejs.org/api/module.html#moduleregisterhooksoptions)
- [Angular deferred loading](https://angular.dev/guide/templates/defer)
