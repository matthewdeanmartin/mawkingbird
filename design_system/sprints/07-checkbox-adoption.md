# Sprint 7 — adopt approved checkboxes

## Fixed scope

Migrate five existing controls: Privacy's locked, discoverable, automated-account
and sensitive-media flags, plus Admin Announcements' publish-immediately choice.
The already-adopted analytics checkbox stays in place. Use the approved widget
without introducing a new visual variant or a new save policy.

## Delivery

Render the real Privacy and Admin Announcements components in Storybook with
local service boundaries. Exercise first-save failure, rollback, retry, disabled
state, saved/error feedback and publication choice. Preserve native input names,
translation keys, per-field PATCH payloads and create/draft behavior. Remove the
superseded admin checkbox layout. Do not remove shared legacy settings CSS while
other pages still use it.

## Acceptance

Five production consumers use `MbCheckbox`; browser and targeted tests verify
native values as well as request payloads. Full test gate and production build
pass. Review light/dim, narrow and RTL screenshots; regenerate the inventory and
record migrated counts. Implementation can finish using the previously approved
widget; the morning checkpoint reviews actual screen composition.

Registration consent and remaining settings checkboxes are explicitly outside
this bounded batch; Sprint 8 starts their semantic triage.

## Implementation checkpoint

Implemented: five of five scoped consumers migrated. [Review the real app
components](../REVIEW-7.md) and [adoption evidence](../audits/07-checkbox-adoption.md).
Morning visual review remains open; Sprints 8–11 are planned, not running.
