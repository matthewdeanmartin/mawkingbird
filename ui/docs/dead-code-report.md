# Mawkingbird dead code report

The maintained Angular client has three application modules that are exercised
by tests but have no runtime import path: `StarterKitPost`, `SettingsAnonymous`,
and the older reader block splitter. These are the strongest removal candidates.
No code or tests were deleted as part of this audit.

This report covers the working tree on October 7, 2026, including existing local
changes. It excludes the frozen sibling `mastodon_mock/ui`.

## Findings

| Finding | All code including tests | Production graph |
| --- | ---: | ---: |
| Unused files | 0 | 15 |
| Unused value exports | 137 | 453 |
| Unused type exports | 101 | 119 |
| Unused dependencies | 0 | 2 |
| Unlisted dependencies | 3 | 0 |
| Unresolved imports | 0 | 0 |

The complete symbol inventory, with paths and line numbers, is in
[dead-code-findings.csv](dead-code-findings.csv). An unused export can still have
internal callers; it is evidence for removing `export`, not automatically for
deleting the declaration. For example, `countSyllables`, `bloggerFeedUrl`, and
`extractHashtags` are reported as unused exports but are called inside their own
modules.

## Application removal candidates

| Module | Evidence | Next decision |
| --- | --- | --- |
| [StarterKitPost](../src/app/starter-kit-post/starter-kit-post.ts) | Component is imported only by its spec; no application component imports it and no template uses its selector. | Retire the old starter-kit card if it has been replaced, or reconnect the intended UI. |
| [SettingsAnonymous](../src/app/pages/settings/anonymous/settings-anonymous.ts) | Only its spec imports this settings component; it has no route or parent component. | Decide whether the anonymous retention setting should be reachable before removing the page. |
| [Reader post blocks](../src/app/pages/read/post-blocks.ts) | `chainBlocks` and `splitPostHtml` are imported only by `post-blocks.spec.ts`. | Compare with the current reader pagination before retiring this implementation. |

Two smaller declaration candidates also have no references outside their own
definitions: `proxyRefusalReason` in `providers/cors-proxy/cors-proxy.ts` and
`followFromAccount` in `providers/twitter/twitter-feed.ts`.

## Findings to retain

Nine of the 15 files outside the production graph are test support or fixtures:
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
