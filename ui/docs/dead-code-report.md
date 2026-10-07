# Mawkingbird dead code report

The three application modules with no runtime import path have been removed:
`StarterKitPost`, `SettingsAnonymous`, and the older reader block splitter.
The unused `proxyRefusalReason` and `followFromAccount` helpers were also removed.
The remaining findings below are retained for future reviews; unused exports
and files outside the production graph still need individual judgment.

This report covers the working tree on October 7, 2026, including existing local
changes. It excludes the frozen sibling `mastodon_mock/ui`.

## Findings after cleanup

| Finding | All code including tests | Production graph |
| --- | ---: | ---: |
| Unused files | 0 | 12 |
| Unused value exports | 135 | 451 |
| Unused type exports | 101 | 119 |
| Unused dependencies | 0 | 2 |
| Unlisted dependencies | 3 | 0 |
| Unresolved imports | 0 | 0 |

The original audit had 15 unused production files and 137/453 unused value
exports. Its complete inventory remains in
[the snapshot before cleanup](dead-code-findings-2026-10-07-before-cleanup.csv).
Keep that snapshot as historical evidence; its paths and line numbers describe
the code before these removals, not current removal candidates.

The complete symbol inventory, with paths and line numbers, is in
[dead-code-findings.csv](dead-code-findings.csv). An unused export can still have
internal callers; it is evidence for removing `export`, not automatically for
deleting the declaration. For example, `countSyllables`, `bloggerFeedUrl`, and
`extractHashtags` are reported as unused exports but are called inside their own
modules.

## Completed removals

| Removed module or helper | Evidence and retained behavior |
| --- | --- |
| `src/app/starter-kit-post/` | Only the removed component's specs imported it. Live starter collection and follow/import code remain. |
| `src/app/pages/settings/anonymous/` | The old page was unused; `/settings/anonymous` already redirects to the live Server settings page. Shared age-setting translation declarations now live in `settings-server.ts`. Its default-age and select-change regression was transferred to `settings-server.spec.ts`. |
| `src/app/pages/read/post-blocks.ts` | Only its obsolete specs imported `chainBlocks` and `splitPostHtml`. The reader uses `ReaderCore`; its existing rendered pagination regressions remain. |
| `proxyRefusalReason` in `providers/cors-proxy/cors-proxy.ts` | No callers. The live `assertProxyable` and `canProxy` helpers remain. |
| `followFromAccount` in `providers/twitter/twitter-feed.ts` | No callers. The active Twitter feed and follow storage remain. |

The 22 protected test identities belonging to the removed modules are recorded in
[the retired inventory](dead-code-retired-tests.json). One age-setting test was
transferred to the live Server settings suite, leaving 21 net test retirements.
Only those obsolete identities were removed from `test-manifest.json`; other
protected tests and the source-integrity floors were preserved. Obsolete
starter-card and old-page title translations were removed from all UI locales.
Shared anonymous age-setting keys and persisted storage names were retained.

## Findings to retain

Nine of the 12 files outside the production graph are test support or fixtures:
`i18n.testing.ts`, seven helpers under `src/app/testing/`, and
`twitterapi-io.fixtures.ts`. Keep them. Their absence from production is expected.

Three more belong to the design system: `action-menu.ts`, `popover.ts`, and the
`identity.ts` barrel. The action menu is used by the catalogue's `power-post`
fixture; the popover supports it. The identity barrel is a public convenience
surface, while application consumers import individual identity components.
Their absence from the application graph does not establish that the catalogue
or documented component API should be removed.

The two production dependency findings are `@angular/ssr` and
`@angular/platform-server`. Keep them for the optional SEO prerender build.
`src/main.server.ts` imports `@angular/ssr`, and the Angular server build needs
the server platform package. Knip's production graph does not fully represent
that optional configuration.

The production-only unlisted `ng` binary is another build-tool boundary:
`@angular/cli` is correctly a development dependency. Do not move it into runtime
dependencies to silence the production scan.

Storybook's `@storybook/addon-a11y` and `@storybook/addon-docs` are explicitly
excluded from unused dependency reporting because
`design_system/.storybook/main.ts` resolves both through a local `packagePath`
helper. The two HTTP support modules imported by external catalogue stories are
declared development entry points for the same reason.

## Dependency declarations to review

Three script imports use packages provided transitively rather than declared
directly: `esbuild` in `audit-language-detection.mjs`, and `playwright` in
`check-reader-features.cjs` and `check-reader-layout.cjs`. These are dependency
declaration findings, not dead code. Declare the script dependencies directly
or migrate the browser helpers to the existing `@playwright/test` dependency.

## Reproduce the audit

Knip 6.40.0 is installed as a development dependency with the committed lockfile.
Existing locked package versions were preserved. From Git Bash:

```sh
cd ui
npm ci
npm run dead-code
npm run dead-code -- --production
npm run dead-code -- --reporter json
```

Knip exits with status 1 when findings exist. This is an advisory report and has
not been added as a failing test gate. The
[configuration](../knip.json) includes the application bootstraps, standalone
scripts and integration entry points. Static public assets are outside the
TypeScript project scan because HTML and build scripts load them separately.
Standalone scripts are treated as deliberate tools, so this audit does not
decide which manually invoked scripts should be retired.

[Knip entry points](https://knip.dev/explanations/entry-files) and its
[Angular plugin](https://knip.dev/reference/plugins/angular) describe the graph
model. Angular template members, feature flags, external catalogue entry points
and optional build configurations still need review before deletion.

## Next periodic review

Rerun both graphs, compare the new inventory with the current and historical
snapshots, and search application imports and template selectors before
classifying files as dead. Review the 135 unused value exports individually:
internal callers can justify keeping the declaration while dropping `export`.
Do not remove design-system or SEO dependencies solely from the production scan.

Related recurring work is proposed in [Maintenance reviews](maintenance-reviews.md).

## Cleanup validation

The October 7 cleanup passed `make test`: 7,736 runtime tests in 541 spec files,
zero failures or pending tests, and zero missing protected identities. The
before/after inventory comparison verifies exactly 22 old identities removed and
the transferred Server settings identity added. Source-integrity floors were
not reduced. Targeted live reader, Home, Server settings, proxy and Twitter tests
also passed. Lint, i18n validation, changed-source formatting and the
`build:mockingbird` production build passed; the initial bundle was 917.46 kB.
