# Sprint 11: post tools, accent roles and reconciliation

## Opening audit and adopted consumers

| Location                                                                    | Evidence and action                                                                                                                                                                                               | Classification / owner     |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `status-card/status-card.html:406`                                          | Real mixed provider actions used local `.action` geometry, negative count margins and overlapping pseudo-element targets. Adopt MbPostActions / MbPostAction; preserve all conditions, handlers and native links. | Fixed, Sprint 11           |
| `status-card/status-card.css:436`                                           | Removed duplicate row/button/selected/disabled geometry and negative count offset. Keep outer margin, status-specific busy pulse and separate legacy summary styling.                                             | Fixed, Sprint 11           |
| `pages/read/save-to-library/save-to-library.html:2`                         | Child duplicated StatusCard CSS because encapsulation blocked reuse. Adopt MbPostAction; retain library eligibility, persistence and stopPropagation.                                                             | Fixed, Sprint 11           |
| `status-card/status-card.html:1254`                                         | Hard-coded action-error red and success green replaced by shared notices with alert/status announcements.                                                                                                         | Fixed, Sprint 11           |
| `design-system/navigation/nav-link.css:17`, `toolbar/toolbar-button.css:23` | Selected backgrounds use existing accent-soft. The pale blue is the default palette, not a separate widget color. Keep text markers and test six accents in light/dim.                                            | Intentional token use      |
| `status-card/status-card.html` unified-share branch                         | Menu triggers need a visual active state without ARIA toggle semantics. MbPostAction.active reuses the approved selected treatment independently of pressed.                                                      | Preserved state, Sprint 11 |

40 adopted template consumers: one group, 26 live action branches, ten count
spans, two notices and one nested library button. Two commented reader links are
excluded. Dynamic instances are not counted as separate migrations.

## Behavior and visual evidence

Real-component browser coverage holds favourite/boost responses until explicitly
released, checking optimistic feedback, disabled pending state, rollback, retry
and success. It separately checks count dialogs, native Tab order, deletion
cancellation/focus return, anonymous sign-in prompts, provider visibility, RSS
native links, unified-share opt-in and its active state. Existing StatusCard and
library specs retain transport/ownership/persistence coverage.

Wide light, narrow dim, 320 px RTL and coarse-pointer previews assert no document
or group overflow, no overlapping hit areas, full count text and 28/44 px targets.
Screenshots: `design_system/test-results/adoption-11.browser.mjs-*/post-tools.png`.
Wide light and narrow dim/RTL renders were inspected. This is browser coverage,
not a claim of manual assistive-technology testing.

## Residual contracts: no blanket exception

- StatusCard's native More disclosure and its panels, quote-policy and share
  menus keep existing focus/dismissal behavior. The three summary templates use
  explicit legacy geometry pending a composed menu migration.
- Polls, content warnings, filtered-post controls, inline composers/editors and
  the translator-choice overlay remain separate consumers; do not reclassify an
  entire StatusCard as migrated.
- The pre-existing signed-in RSS branch hides the nested library/bookmark/menu
  tools while anonymous RSS shows them. The fixture exposes both. A provider
  behavior decision is needed before broadening that condition.
- Sprint 10 Search composition, member-fetch/metadata failure behavior and
  remaining mode tabs stay open. Sprint 9 destructive and wide-dialog variants
  remain open. Earlier form adoption does not cover every Settings page.

## Whole-inventory reconciliation and enforcement

The scanner previously omitted navigation, field/control and several other
shared widget names. Those patterns now count; the total increases from 205 to
209 candidate files without adding four new problem screens. All 1053 maintained
source files are still scanned. The separate ledger records a disposition for
all 209 candidates: 15 shared implementations, 5 adopted scopes, 15 partial
adoptions, 9 lexical/comment-only matches and 165 backlog files.

These are file triage counts, not control counts or compliance percentages.
Backlog entries explicitly require deeper template, associated CSS and runtime
review. No source-only triage approves rendered behavior. Scanner evidence and
line numbers remain in `06-control-inventory.json`; each ledger entry names the
next review action. The checker rejects missing, duplicate, stale or unclassified
entries. It does not bless a disposition or regenerate review decisions.

Application template lint additionally rejects legacy `.action` buttons/links
inside adopted post groups unless they use MbPostAction, including control-flow
and wrapper cases. Existing no-pill rules remain. Menu contents and static
statistics are deliberately separate contracts. Positive/negative fixtures cover
both rules and ledger completeness. Palette lint remains scoped to shared
widgets; remaining application color findings are not silently allowlisted.

## Hosted gate and recurring ownership

The latest existing hosted design-system job was verified successful:
[run 36459660321, design-system job](https://github.com/matthewdeanmartin/mawkingbird/actions/runs/36459660321/job/109054743992),
commit `fadfc1a7ce3bf9aa1b90016b888bdca42ca0a0b5`. That verifies the installed CI
workflow, not these uncommitted Sprint 10/11 changes. The job uses Node 22,
locked npm dependencies, Chromium, lint and design:verify. It validates a built
catalogue; it does not publish a hosted Storybook website. No publishing changed.

Each feature contributor owns reuse and the changed surface's ledger entry; the
maintainer selects its reviewer. Run the LLM audit at sprint boundaries and after
shared-widget changes; reconcile remaining files monthly during active UI work.
New patterns need preview/review; existing approved widgets can be adopted with
real fixtures and parity checks. Full app tests, production budgets and catalogue
checks remain required. The workflow is operating; the backlog is not complete.

## Final validation

155 targeted StatusCard/library specs passed. The final complete app gate passed
7,600 tests with no missing inventory entries. design:verify passed all 202
browser checks and 26 rule/ledger checks, plus types, formatting and catalogue
build. App lint and i18n checks passed. The final production build passed at
883.54 kB initial size with the 1 MB budget unchanged; startup data boundaries
remain lazy. Logs are in `ui/.test-results/sprint11-*.log`.
