# Sprint 8 review: registration and admin forms

[Open the working preview](http://127.0.0.1:6006/?path=/story/start-here-sprint-8-review--app-forms).

This batch adopts 18 production controls across seven screens: ten fields,
seven buttons and one registration-consent checkbox. The announcement publish
checkbox was adopted in Sprint 7 and is not counted again.

## What to review

- Labels remain visible after typing. Existing translated placeholders provide
  the labels; both moderation selects now have a “Moderation action” label.
- Each admin create action deliberately fails once in the local preview. Values
  remain in place, an inline error appears, and retry succeeds. Inspect the
  displayed payload after changing values or moderation options.
- Try Enter in the domain, email and IP-comment inputs. Existing handlers and
  payload trimming are retained. Pending requests disable the relevant button.
- Canonical email lookup also fails once, then returns no match on retry. A new
  attempt clears its previous result; duplicate pending lookups are blocked.
- Click the registration consent text and toggle it with Space. Check narrow
  layouts and the catalogue's light/dim and RTL controls.

The six admin sections render actual production components with local service
fixtures. Registration is explicitly an isolated control example; actual Login
consent gating and the account request's agreement value are covered by its
Angular test. Preview actions do not contact an account or save preferences.

## Scope and follow-up

Existing approved field, native-control, button and checkbox contracts are reused.
Obsolete control styling is removed. A shared admin stylesheet handles only the
outer form layout. Three English source keys cover moderation labels and request
recovery; other locales use the established fallback. Dependencies and Storybook
configuration are unchanged.

Row-level remove/publish actions, initial list-loading states and the remaining
Login fields are outside this batch. Existing structured server errors were not
replaced: these admin callbacks previously discarded create/lookup failures.
See the [consumer audit](audits/08-forms-adoption.md) for exact adoption counts.

## Validation

- Targeted Angular specs: 78 tests passed.
- Complete `make test`: passed; runtime manifest contains 7,592 tests, none missing.
- Angular lint and translation checks passed.
- `design:verify`: passed, including 170 browser tests and the CSS contract tests.
- Production build passed: initial JavaScript/CSS is 883.30 kB, below the unchanged
  1 MB error budget. Existing stylesheet-budget and CommonJS warnings remain.
- Rendered screenshots inspected at 1280px light LTR, 380px dim LTR and 380px
  light RTL. Browser checks cover visible labels, associations, retained values,
  retry, keyboard actions and horizontal overflow.

Implementation is ready for visual review. Sprint 9 is the next adoption batch:
shared confirmation service and eligible dialogs.
