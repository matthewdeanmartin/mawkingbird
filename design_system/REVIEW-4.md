# Sprint 4: overlays and transient interaction

Open [Sprint 4 review](http://127.0.0.1:6006/?path=/story/start-here-sprint-4-review--review).

- **Dialog:** familiar 440px surface, rounded corners and existing theme tokens.
  Try editing the name, saving, seeing a simulated failure, and retrying. The edit
  remains available after failure. Busy state blocks dismissal until the request
  finishes. “Review removal” opens a nested confirmation with the safe choice first.
- **Action menu:** a compact list of commands, including an unavailable item and
  a destructive command. Arrows, Home/End and typeahead move through enabled items;
  Escape returns to the trigger and Tab moves on. Choosing a destructive item
  opens confirmation; it does not perform an irreversible action.
- **Nonmodal panel:** “Reading options” opens a small form. Outside clicks and
  Escape dismiss it. A second example inside the dialog exercises overlay ordering.
- **Disclosure:** a native summary/details explanation with ordinary keyboard
  navigation. It does not trap focus or pretend to be an action menu.
- **Notices:** static information stays quiet. Saving and errors use explicitly
  requested status/alert announcements rather than announcing every message.

The **Long dialog** story exercises internal scrolling on small screens.
**Backdrop dismissal** explicitly enables outside-click closure; ordinary dialogs
require Close, Cancel or Escape. Dragging from content to the backdrop must not
close the dialog. Theme, accent and direction controls apply throughout.

The fixture uses in-memory state and a short timer, with no service calls or
preference writes. App overlays remain unchanged until this preview is reviewed.
The [opening audit](audits/04-overlays.md) lists integration targets and gaps.

This uses the browser's native modal/top-layer primitives, with a small Tab-boundary
handler for consistent focus wrapping, counted scroll locks, and explicit return
focus. Existing `FocusTrap` remains in existing overlays. No Angular CDK package
or tooling upgrade was added. See [contracts](components.md#dialog) before reuse.

User review: accepted after the compact action-trigger gap correction (4px).
App integration and post-integration drift audit: pending.
Chromium browser checks cover the preview; Firefox and assistive-technology
verification remain follow-up work before broad overlay adoption.

## Validation

- All 125 catalogue browser checks pass, including 23 overlay checks with runtime
  error guards. Keyboard navigation, nested dismissal, focus return, failed-save
  recovery, viewport containment and long-dialog scrolling are covered.
- Menu text passes the 7:1 project contrast target in both themes and all six
  accents, including disabled and destructive items.
- Inspected wide/light, narrow/dim and narrow/RTL screenshots. Menu captures use
  the actual viewport because full-page capture temporarily resizes Chromium and
  triggers the intentional resize-dismiss behavior.
- Design-system unit subset: 17 tests across eight files. Full `make test` gate:
  7,579 tests in the runtime manifest, zero missing. Angular lint, catalogue
  formatting/type checks and scoped design lint pass.
- Storybook build and production app build pass. Production initial bundle:
  883.21 kB, within the unchanged 1 MB error budget.

Screenshots are generated under `design_system/test-results/` by
`cd ui && npm run design:browser`; the generated files are not committed.
