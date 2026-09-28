# Sprint 13 — bookmark and report adoption audit

The user accepted Sprint 12 and requested continued adoption. Opening source
review found duplicated modal shells and FocusTrap usage in BookmarkProviderDialog
and ReportDialog, plus local report labels/controls/error/footer geometry.

| Location                 | Adoption                                                                                                                                                                                                           | Residual work                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| bookmark-provider-dialog | MbDialog replaces local overlay, header and focus trap. Preserve three choice payloads, saved/browser wording and conditional external-link choice. Logical spacing and domain wrapping support RTL/narrow widths. | Specialized choice cards need a separately reviewed shared variant.                 |
| report-dialog            | MbDialog, two MbField/MbControl pairs, MbNotice and outline Cancel replace local geometry and feedback. Preserve API selection, exact post references, category mapping and duplicate-submit guard.                | Existing red Confirm report remains until a shared destructive variant is reviewed. |
| eslint.config.js         | Remove obsolete report overlay keyboard/click exception.                                                                                                                                                           | Remaining exceptions retain their previous scope.                                   |

Eight adopted consumers: two shells, two fields, two controls, one notice and one
Cancel action. No new public widget API, transport logic, translation, storage,
OAuth or publishing changes. Report dismissal remains available during submission;
closing a dialog does not cancel a started write. Bookmark backdrop clicks still
do not dismiss, while the report backdrop retains its existing dismissal behavior.

## Evidence

Five new Angular tests cover bookmark outputs, anonymous/removal text, close
semantics, failed-report retention/retry and missing exact references. Existing
report HTTP and all StatusCard tests are retained. 156 targeted cases pass.

Nine new browser scenarios cover all bookmark outputs, all three report service
paths, retained values and identical retries, held submissions, absent reference
rejection, focus return, backdrop parity and wide/narrow/RTL geometry. Real browser
checks exercise native dialog behavior; the report unit suite supplies jsdom's
missing dialog methods locally and restores them after fixture destruction.

Visual review caught that the previous sprint's narrow test requested the
unsupported theme name `dim`. Both Sprint 12 and 13 now request `dark`, the actual
catalogue theme, and their browser cases are rerun. Screenshots use light/dark and
320 px RTL. This is not manual screen-reader certification or live-provider testing.

## Reconciliation

Two candidate templates move from backlog to partial adoption. All 209 candidates
remain accounted for: 8 adopted scopes, 17 partial, 15 shared implementations,
9 lexical-only and 160 backlog. The scanner retains 1052 source files. Deferred
choice-card and destructive-button work has explicit ownership in the ledger.

The full catalogue run also exposed a pre-existing timing race in Sprint 9's
prompt backdrop test: raw coordinates were clicked immediately after reopening,
before waiting for the native modal to be active. The test now asserts open and
focused state before that click. All original cancellation/input assertions remain.

## Final validation

156 targeted tests and the full 7,611-test app gate passed (zero missing tests).
Catalogue types/format/build, inventory reconciliation and 26 rule checks passed.
The final complete browser rerun passed all 224 checks after the prompt-test
synchronization correction. App lint and translation checks passed. Production
build and startup boundary checks passed at 883.54 kB initial size, within the
unchanged 1 MB budget. Light, dark and 320 px RTL screenshots were inspected.
