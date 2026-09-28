# Sprint 8 — registration and admin forms

Targets: Login registration agreement; Admin Announcements text field; admin
IP blocks, domain blocks, domain allows, email blocks and canonical-email forms.
Use existing checkbox, field/control, button and save-feedback contracts.

First inventory each native control, current labels, validation, disabled state
and request payload. Present actual components using local service fixtures.
Migrate eligible controls and remove only their obsolete CSS. Preserve native
ngModel, identifiers, submit behavior, meaningful errors and all existing locale
keys. Add translation keys only for genuinely missing accessible labels.

Preview any required linked-consent or richer validation variant before adopting
it. Do not flatten structured server errors into a generic success/failure toast.

Exit: list each adopted control and any individually justified deferral; exercise
invalid input, duplicate submission, failed retry, long labels and narrow layouts.
Run targeted tests, full `make test`, production build and `make design-verify`.
