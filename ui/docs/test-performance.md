# Local test performance and integrity

The UI suite is deliberately large. Local speed work must preserve its behavior,
inventory, and coverage; a faster red or weakened suite is not an improvement.
GitHub Actions does not run this suite because build-minute usage is intentionally
out of scope. These controls apply to the local quality gate and code review.

## Baseline — 2026-08-02

Measured on Windows, Node 24.18.0, 20 logical processors, with 2,790 runtime
tests in 253 spec files. Runs excluded coverage so worker scheduling could be
compared.

|          Workers | Vitest execution | Result                                    |
| ---------------: | ---------------: | ----------------------------------------- |
|                2 |           26.0 s | 2,790 passed                              |
|                4 |           21.2 s | 2,790 passed                              |
|                8 |           37.0 s | 2,790 passed                              |
| 20 (old default) |           47.3 s | one real-clock flake before the clock fix |

The old default created 21 Node processes and used approximately 6 GB at peak.
Four workers are therefore configured in `vitest.config.ts`. Set
`VITEST_MAX_WORKERS` temporarily to repeat the sweep on different hardware.

The fresh green coverage baseline is enforced in the same configuration:
71.26% lines, 67.29% statements, 61.46% functions, and 68.26% branches.

Angular compilation/startup was approximately 30 seconds in these cold runs and
is now the largest fixed cost. Component-fixture specs accounted for roughly 92%
of measured per-file execution work, so further optimization should concentrate
on production component boundaries and genuine DOM-test needs.

## First optimization tranche

- Pinned the DraftsPage clock after a baseline run crossed a relative-time
  display boundary during Angular's development-mode second check.
- Reduced the default worker pool from 20 to the measured optimum of 4. Subsequent
  complete runs executed in 18.1–22.9 seconds, versus 47.3 seconds before.
- Made starter-kit account hover cards lazy. The Bundled Collections spec fell
  from 3.5 seconds to 0.24 seconds in comparable four-worker full-run profiles;
  the page now avoids constructing dozens of invisible component trees at load.
- Added a protected runtime manifest of all 2,790 test identities and confirmed
  zero missing, failed, or pending tests after the changes.

## Fixed compile cost — 2026-11-11

By November the suite had 744 spec files (139,000 lines) and 9,664 tests, and
the app 1,025 non-spec source files (225,000 lines). Measured on the same
machine:

| Command                                        | Wall time | Of which compile |
| ---------------------------------------------- | --------: | ---------------: |
| `make test` (`test:ci`, coverage)              |     291 s |             68 s |
| `ng test --no-watch` (no coverage)             |     161 s |             88 s |
| one spec via `ng test --include` (old subset)  |   70–78 s |          63–73 s |
| one spec via the narrowed program (new subset) |    7–14 s |              8 s |
| `test:changed`, settings component (2 specs)   |      11 s |              6 s |
| `test:changed`, speech reader (53 specs)       |      81 s |             39 s |
| `test:changed`, `api.ts` (235 specs)           |     101 s |             59 s |

`NG_BUILD_DEBUG_PERF=1` showed where the single-spec compile went: TypeScript
emit 44 s, diagnostics 16 s, program creation 7 s. `--include` only chooses
which bundles run; tsconfig.spec.json still puts every spec in the program, and
the persistent `.angular/cache` does not carry the TypeScript program between
processes. Coverage adds about 130 s.

`scripts/narrow-spec-run.mjs` therefore writes a tsconfig under the artifact
folder that lists only the chosen specs, and passes it with `--ts-config`. The
compiler sees those specs and what they import. `test:subset` and
`test:changed` both use it. Because type checking is narrowed too, these are
fast feedback, never the gate.

`test:changed` follows static relative imports and component
`templateUrl`/`styleUrl` backwards from the changed files. It deliberately does
not follow lazy `import()`: `app.routes.spec.ts` and `mock-routes.spec.ts` reach
every page that way, and following those edges put the whole app into a
two-spec settings change (102 s instead of 11 s). Editing a route table still
selects its specs; the full gate covers the rest. The cost now scales with how
widely the changed file is imported: a core service such as `api.ts` reaches a
third of the suite. Toolchain changes (package.json, angular.json, tsconfig,
vitest config, test-setup) run every spec.

The `src/lib` extraction does not reduce this compile: the app imports library
sources by relative path, so they are part of the same program (and only about
1.5% of it). What it does buy is that library specs run outside Angular and are
skipped when unchanged (`test:libs`, 1–3 s).

## Commands

```bash
make test-changed                             # specs affected by uncommitted edits
make test-changed BASE=origin/main            # ...or by a whole branch
make test-changed WATCH=1                     # keep it running; rebuilds in seconds
npm run test:changed -- --dry-run             # list affected specs only
npm run test:subset -- src/app/discovery/search  # one area (narrowed program)
npm run test:subset -- src/app/publishing/compose/compose.spec.ts
npm run test:source-integrity                 # sub-second inventory/anti-cheating check
make test-quick                               # whole suite, no coverage
make test                                     # full local test gate with coverage
```

The subset command is fast feedback only. `make test` remains the complete local
gate before a change is handed off.

## Change-control rules

`test-integrity-baseline.json` protects the current minimum spec-file and test-
declaration counts. The source-integrity command also rejects focused, skipped,
pending, and trivially always-true tests. A legitimate removal requires an
explicit baseline edit, making the reduction visible to reviewers.

For each performance tranche, record:

- test files and production files changed;
- runtime test pass/fail/pending counts;
- coverage before and after;
- median wall time from comparable warm or cold runs;
- worker count and relevant machine details.

Do not claim speed from deleting/skipping tests, weakening assertions, adding
coverage exclusions, disabling Angular development checks or teardown, removing
required change detection, or substituting a narrow subset for the full gate.
Shallow component stubs are acceptable only when direct coverage of the replaced
child behavior remains elsewhere.
