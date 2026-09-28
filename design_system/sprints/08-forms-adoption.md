# Sprint 8 — registration and admin forms

Targets: Login registration agreement; Admin Announcements text field; admin
IP blocks, domain blocks, domain allows, email blocks and canonical-email forms.
Use existing checkbox, field/control, button and save-feedback contracts.

First inventory each native control, current labels, validation, disabled state
and request payload. Present actual components using local service fixtures.
Migrate eligible controls and remove only their obsolete CSS. Preserve native
ngModel, identifiers, submit behavior, meaningful errors and all existing locale
keys. Add translation keys only for genuinely missing accessible labels or recovery messages.

Preview any required linked-consent or richer validation variant before adopting
it. Do not flatten structured server errors into a generic success/failure toast.

Exit: list each adopted control and any individually justified deferral; exercise
invalid input, duplicate submission, failed retry, long labels and narrow layouts.
Run targeted tests, full `make test`, production build and `make design-verify`.

## Implementation checkpoint

All 18 controls in the bounded batch now use approved production widgets.
Duplicate control styling was removed and request recovery covered by tests.
The full app and design-system gates pass. See [review notes](../REVIEW-8.md)
and the [consumer audit](../audits/08-forms-adoption.md). Visual review remains
open; remaining row actions and other Login fields are explicitly outside this
batch. Sprint 9 is next.
