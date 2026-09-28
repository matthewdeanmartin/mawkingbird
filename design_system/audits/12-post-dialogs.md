# Sprint 12 — post-dialog adoption audit

Opening evidence: AccountListDialog, HistoryDialog and SignInPrompt each used a
local fixed overlay, modal box and FocusTrap. The first two cleared their loading
flag on request failure and fell into their empty-state branch. The user approved
Sprint 11 and requested continued adoption; these three ledger backlog entries
form the next coherent batch.

| Location                                                                         | Finding/action                                                                                                                                         | Classification and owner             |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `account-list-dialog/account-list-dialog.html:1`                                 | Adopt MbDialog, three MbContentState branches and Retry/Close buttons. Preserve account links and close output.                                        | Fixed, Sprint 12                     |
| `history-dialog/history-dialog.html:1`                                           | Same shell/state adoption; keep snapshot HTML, warnings, timestamps and version ordering.                                                              | Fixed, Sprint 12                     |
| `sign-in-prompt/sign-in-prompt.html:1`                                           | Shared shell/description and three actions. Keep native login/welcome-back links and exitAnonymous handler.                                            | Fixed, Sprint 12                     |
| `account-list-dialog/account-list-dialog.ts`, `history-dialog/history-dialog.ts` | Failure was indistinguishable from empty. Add explicit failure/retry, duplicate-pending guard and takeUntilDestroyed. Keep native id/origin selection. | Functional correction, Sprint 12     |
| `design-system/button/button.ts`                                                 | Existing solid/outline appearance now supports a[mbButton]. Anchor remains a link with no role/type/disabled synthesis.                                | Reuse approved appearance, Sprint 12 |
| `ui/eslint.config.js`                                                            | Account-list/history no longer need local click/keyboard accessibility exceptions. Remove both entries.                                                | Enforcement tightened, Sprint 12     |

16 adopted consumers across three actual implementations: three modal shells,
six content states, four read-dialog buttons, three sign-in actions. No dynamic
account row or revision is counted as an additional widget migration. Removed
all three local overlay shells and their footer CSS; deleted the now-empty
SignInPrompt stylesheet. Account rows retain avatar/identity styling and gain
min-width/wrapping protection; history snapshots retain content-specific borders.

## Evidence and parity

Six new Angular cases cover account endpoint selection, native account links,
failed-read/empty separation, same-request retry with duplicate-click protection,
formatting/order preservation, anonymous origin/id parity and cancellation.
The existing 149 StatusCard cases remain. Browser coverage opens these real
components from the new fixture and reruns the previous real-post fixture.

Browser scenarios cover both account modes, both history service paths, held
reads, native destinations, account-exit invocation, cancellation, focus cycling,
focus return, nested scroll locks and long dialog content in wide light, narrow
dim and 320 px RTL. Screenshots are under
`design_system/test-results/adoption-12.browser.mjs-*/`. Wide history, narrow dark
account lists and RTL sign-in were inspected. This is not manual screen-reader
certification. Unit tests exercise real Angular HTTP requests; the catalogue
substitutes read services and does not prove remote provider transport.

## Reconciliation and boundaries

All 209 scanner candidates still have explicit dispositions. Scanned source
files decrease from 1053 to 1052 solely because the obsolete sign-in stylesheet
was deleted. The three dialog templates move from backlog to adopted scope:
8 adopted, 15 partially adopted, 15 shared implementations, 9 lexical-only,
162 backlog. These totals are not per-control completion percentages.

Native navigation/popup semantics remain required for a[mbButton]. Use actual
buttons for commands and disabled commands; an anchor has no native disabled
state. Existing no-pill-in-toolbar lint also catches this anchor form.

Account-row/snapshot content styling is preserved intentionally. Account-list
pagination, historical media rendering, post disclosure/share/policy menus,
report/list dialogs and wider/destructive variants remain separate work. The
RSS capability discrepancy from Sprint 11 is unchanged. No provider policy,
posting friction, OAuth URL, storage key or publishing configuration changed.

## Final validation

155 targeted tests passed, including the six new dialog cases and all 149
StatusCard tests. The final complete app gate passed 7,606 tests with zero missing
inventory entries. design:verify passed 214 browser checks and 26 rule/ledger
checks, plus types, formatting and catalogue build. App lint, i18n checks and
inventory reconciliation passed. The production build passed at 883.54 kB initial
size; the 1 MB budget is unchanged and startup data boundaries remain lazy.
The final neutral sign-in appearance was inspected in dim mode as well.
Logs: `ui/.test-results/sprint12-*.log`.
