# Button consistency

Preview: [Actions / Button / Consistency](http://127.0.0.1:6007/?path=/story/actions-button--consistency).

Standalone buttons and action links now use the selected accent in both themes.
The shared semantic colors are darker in light mode and lighter in dim mode to
meet the existing 7:1 text contrast policy. Destructive actions use the error
palette. Disabled controls remain readable and have a dashed border; they no
longer fade their text. Small controls retain 44px touch targets.

MbButton and legacy `.btn` classes share one global stylesheet. This applies the
same geometry, font, hover, focus, selected and disabled states throughout the
app without requiring every old template to change at once. Page-specific pill
appearance overrides were removed; layout and placement remain with pages.
A design-rule check rejects new overrides of those shared classes.

Import/export actions adopt MbButton. Its network direction is a mutually
exclusive choice, so it now uses RadioGroup, with native keyboard selection and
the existing disabled gate. The accent-on-accent active override is gone.
First-run, onboarding, Bluesky login/callback, analytics, member sampling,
people-follow, profile back, shell and admin row actions also adopt MbButton. ConfirmDialog
uses the shared danger tone. Algo, Thread, Drafts, Write, Feed Doctor and the
language picker use PostAction for compact controls. Native link destinations, form submission, disabled handling,
translation keys and action handlers are preserved.

This batch unifies action appearance, not every menu, navigation tab, card,
disclosure or form in the app. Those retain their own interaction contracts.
Legacy action classes are supported aliases, not a second visual system.

The refreshed source report records 377 direct placements across 56 templates,
using 24 of 27 widget types. Counts describe the current source tree, not this
batch's delta or deployment coverage. The inventory and reconciliation remain
explicit about partial adoption and other control families.

Validation includes the complete audited Angular test gate, production bundle
budget, design ownership checks, and browser checks for all six accents in both
themes. The button matrix covers legacy/shared parity, hover, selected and
disabled states (including disabled fieldsets), focus, radio keyboard interaction,
narrow wrapping and touch target sizing. Source changes only; no publication.

## Validation results

- Mockingbird production build passes at 885.74 kB initial, below the unchanged
  1 MB error budget. The admin production build also passes.
- ESLint, changed-file formatting, design formatting/types, CSS ownership and
  inventory/reconciliation checks pass.
- The final browser regression run passes 48 checks, covering buttons, compact
  rows, navigation and sign-in dialogs. The broader run passed 268 checks before
  correcting its eight failures; all eight are covered by the final run.
- The complete `make test` gate was run. Its final result is 7,656 of 7,657 tests
  passing: `Streaming never pauses a server whose handshakes succeed, however
often sockets drop` captures profile-sync warnings from other work. No streaming
  or profile-sync code was changed. An earlier run hit an intermittent
  server-discovery assertion; that test passes in the 111-test targeted run.
  The isolated streaming suite passes all 26 tests.
- The broader static gate stops at existing starter-kit membership drift.
  Full-source formatting also reports 18 untouched files. Those unrelated files
  and catalogue data were left unchanged.
