# Sprint 15 — settings composition audit

The user accepted the preceding sprint and requested continued adoption. Opening
review covered both settings templates, styles, save/trust handlers, shared form
contracts and existing Privacy/TrustedAccounts specs.

| Location               | Finding and change                                                                                                                                                      | Classification               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| SettingsPrivacy        | Four local row/group layouts now use SettingsRow. Two native selects gain Field/Control labels, hints, errors and SaveFeedback. Existing five shared checkboxes remain. | Adopted bounded form scope   |
| SettingsContent        | Four radio-plus-note pairs become one RadioGroup preserving every value. Two global checkboxes gain shared labels/hints. Remove the manual 26px note offset.            | Adopted bounded choice scope |
| Trust setLevel         | Narrow the shared string event to the existing four allowed values. Do not alter trust policy or persistence.                                                           | Consumer type adaptation     |
| Remaining page content | Named-account row actions, legacy remove/revoke buttons, metadata and initial read states stay outside this batch.                                                      | Explicit partial adoption    |

13 new placements: 4 rows + 2 fields + 2 controls + 2 save-feedback components +
1 radio group + 2 checkboxes. RadioGroup and SettingsRow gain their first app uses;
SaveFeedback now has direct consumers in addition to composition inside Fields.
No dependencies, translations, origins, publishing, storage keys or transport
policy changed. Only existing service methods handle writes.

## Behavioral and visual evidence

44 targeted app cases pass. Four new cases cover both select one-field payloads,
failed-save rollback/retry, all trust values, retained people/preferences when
trust is disabled, linked labels/hints, server navigation and revoke confirmation.
Tests use real HTTP request matching and the real TrustedAccounts service where
app behavior is under test.

Eight new browser cases cover select pending/failure/retry, empty language,
keyboard radio operation, retained disabled choices, preview storage isolation,
confirmation cancellation and 1280px light/LTR, 375px dark/LTR and 320px light/RTL
layouts. Screenshots in `test-results/adoption-15.browser.mjs-*/` were inspected.
All adopted fields and choice groups fit without horizontal overflow. These are
simulated-service previews, not live-provider or screen-reader certification.

## Residuals and counts

Keep both templates partial: Privacy still has its pre-existing initial credential
read and overlapping-save/status limitations. Trust's remaining account actions
and read-state recovery need another bounded pass, owned by the next settings
contributor and maintainer reviewer. Disabling trust retains stored preferences;
only explicit confirmed revoke clears them.

The ledger has 209 candidates: 8 adopted scopes, 19 partial, 15 shared,
9 lexical-only and 158 backlog. Scanner source count remains 1053. The parsed
adoption snapshot reports 19/27 types, 196 placements in 27 app templates. These
are source-use counts, not runtime instance counts or app completion percentages.
Sprint 16 is next; three planned sprints remain (16–18).

## Validation

The complete app gate passes 7,620 tests with zero missing inventory entries.
App lint and translation checks pass. Production build and startup boundary pass
at 883.54 kB initial size within the unchanged 1 MB budget. Catalogue verification passes all 247 browser checks and 26 rule checks,
plus types, formatting, build and ledger reconciliation. No commit or deployment was performed.
