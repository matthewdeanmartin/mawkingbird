# Sprint 14 — list membership adoption audit

The user explicitly requested Sprint 14 after agreeing to the integration counts
and remaining-plan reporting convention. Read ListDialog's template, stylesheet,
request/state handlers, existing specs and the shared checkbox/form contracts.

| Location                                 | Evidence and change                                                                                                                                                                                                           | Classification                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| list-dialog.html/css                     | Local overlay/focus trap, three checkbox layouts, placeholder-only create inputs, local actions/visibility tags. Adopt 22 shared placements and retain section/list layout only.                                              | Fixed, Sprint 14                                 |
| list-dialog.ts                           | A rejected membership change could leave the native check visually changed. Restore confirmed values through the checkbox public writeValue method; retain server membership as truth. Guard pending list writes and creates. | Integration behavior correction                  |
| design-system/checkbox                   | Synchronous true→false before a render leaves Angular's cached checked binding unchanged. writeValue must restore the actual native input too; add a regression test without emitting another change.                         | Fixed shared CVA contract                        |
| list-dialog.ts collections               | Failures were silent, and a successful create followed by a failed add left no row to retry. Show the failure, retain the created row and retry only membership. Failed creates retain the name.                              | Fixed within write-state scope                   |
| listDialog title/create translation keys | Screenshot showed literal HTML entities in plain-text output. Decode only @ and ampersand in these three keys across existing locales; retain innerHTML follow-message encoding and all interpolation variables.              | Fixed, no new translation keys                   |
| eslint.config.js                         | Shared modal removes local backdrop handlers. Remove ListDialog's accessibility exception.                                                                                                                                    | Enforcement tightened                            |
| testing/http-error.ts                    | Catalogue lies outside ui/node_modules. Re-export the real Angular HTTP error from the UI workspace for fixture instanceof guards.                                                                                            | Test support only; no HTTP provider or transport |

22 consumers: 1 modal + 3 checkboxes + 3 fields + 3 controls + 6 buttons + 3
notices + 3 badges. New collection error feedback is included in that selected
scope. Badges gain their first real app consumer. No per-row runtime expansion
is counted as extra adoption. The original server/browser/anonymous/public
boundaries, item IDs, account IDs and explicit follow confirmation are preserved.
No publishing, OAuth, storage keys, dependency versions or provider policy changed.

## Evidence

The 10 existing ListDialog unit tests remain. Four new dialog cases verify
failed list writes/duplicate guards, failed collection removal, create-list retry
and follow consent, and created-collection membership retry without recreation.
One shared checkbox regression verifies synchronous native reset. Targeted
ListDialog, checkbox and Privacy tests total 29 passing cases.

13 new browser cases cover server/local memberships, add/remove failure and retry,
explicit follow/cancellation, create fields and Enter, unsupported collections,
deterministic pending state with a controlled clock, nested focus/locks and
wide light, narrow dark and 320 px RTL layouts. Screenshots live under
`design_system/test-results/adoption-14.browser.mjs-*/`. Inspect both top content
and scrolled collection fields. Unit tests use real HTTP request matching; the
catalogue uses local service replacements. This is not live-provider testing or
manual screen-reader certification.

## Residual work and reconciliation

Keep ListDialog partial. Existing initial list reads have no error/retry branch;
collection discovery can conflate failures with unsupported/absent membership.
Those initial-read semantics and plain loading/empty paragraphs need a separate
read-state pass, owned by the next ListDialog contributor and maintainer reviewer.
Do not hide those gaps by calling the whole dialog fully migrated. Pending writes
still continue after dismissal, as before; this sprint does not claim cancellation.

The ledger retains 209 candidates: 8 adopted, 18 partial, 15 shared, 9 lexical-only,
159 backlog. The source count is 1053 because the test-support HTTP re-export adds
one non-spec TypeScript source file. Cumulative toolkit usage is 17/27 (16 direct,
SaveFeedback through Fields), 183 direct placements, 26 app template files.
The adoption snapshot is refreshed by the template parser, not estimated from
file dispositions. Four planned sprints remain after this sprint (15–18).

## Final validation

Final full app gate: 7,616 tests, no missing inventory entries. Targeted cases: 29. Final catalogue verification: 238 browser checks, 26 rule checks, types,
formatting, build and ledger reconciliation all pass. App lint and i18n checks
pass. Production build/startup boundary passes at 883.54 kB initial size with
the unchanged 1 MB limit. Rechecked final screenshots after correcting entities.
No commit, deployment or live-provider write was performed.
