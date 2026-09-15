# Keeping the initial bundle within budget

The production initial budget is 1 MB of minified JavaScript and CSS needed to
bootstrap the application, before gzip/Brotli transfer compression. It is a
project performance threshold, not a Cloudflare or browser hosting limit.

Warnings start at 900 kB so they identify diminishing headroom. The previous
500 kB warning fired on ordinary builds and provided little useful notice.
The 1 MB failure threshold is unchanged.

## Local check

After UI runtime changes, run both `make test` and `npm run build:mockingbird`
from ui/. Tests use the development build and cannot check production budgets.
The production command also checks mock leakage and startup import boundaries.
CI already uses this same production command through the root Makefile.

The build saves `dist-mockingbird/stats.json`. Its postbuild report prints the
initial byte total and largest source contributions. Rerun that report with
`npm run bundle:report`; this reads the last build, so rebuild after edits.
For an archived stats file, run `node scripts/report-bundle.mjs path/to/stats.json`.
Source contributions are attribution estimates and need not add up exactly to
bundle bytes because bundling adds/removes shared overhead.

## Why feature work can grow startup

The static import chain begins at main.ts, application configuration, root
components and the route table. A lazy page stays lazy only while its heavy
dependencies are not also imported through one of those startup paths.

An `@if` hides a component but does not make its JavaScript lazy. Feature flags
and conditional calls likewise do not turn static imports into dynamic imports.
Keep large snapshots, optional SDKs, templates and documentation behind a route,
`@defer`, or an explicit `import()` where appropriate. Type-only dependencies
should use `import type`.

The September 2026 regression was a static `shippedStarterKit` import in the
anonymous collection route guard. That guard pulled roughly 142 kB of collection
snapshots into every startup just to recognize collection IDs. The guard now
loads the snapshot only when an anonymous visitor opens a collection. Signed-in
visitors do not need that check. Both collection access rules remain tested.

The postbuild report traverses static output imports and rejects collection
snapshots in startup, even if the overall application remains below 1 MB. Extend
its small exclusion list when establishing another important lazy boundary.
Do not add every module: essential startup code should stay easy to identify.

## Tradeoffs

- Dynamic loading reduces initial download/parse work and delays the cost until
  the feature is needed. The first visit can take an additional request and can
  fail if that chunk cannot be fetched. Loaded modules are reused in that page
  session; caching across reloads depends on browser/server policy.
- A small generated ID index can avoid loading full snapshots in a guard. It
  adds generator and synchronization complexity. Use it if measured navigation
  latency warrants it; do not hand-maintain a second list of valid IDs.
- Removing unused dependencies or splitting data from logic can reduce total
  bytes, but typically requires more code changes than moving a load boundary.
- Raising the error budget may be reasonable for essential startup features
  after measuring actual device/network performance. It costs more startup work
  and does not fix accidental eager imports.

Aim for headroom rather than a build one byte below the cap. Review size deltas
alongside functionality. A raw-byte budget is a useful guardrail, not a complete
performance measurement: first-screen loading and interaction on slower devices
still matter, as do deferred downloads and oversized component styles.

References: [Angular size budgets](https://angular.dev/tools/cli/build#configuring-size-budgets)
and [deferred loading](https://angular.dev/guide/templates/defer).
