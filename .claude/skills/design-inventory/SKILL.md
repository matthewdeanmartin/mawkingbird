---
name: design-inventory
description: Update the Mawkingbird design-system control inventory after changing UI controls, or touch a shared design widget. Use when design:inventory-check fails, or after adding, removing or restyling buttons, toolbars, tabs, inputs or other controls in HTML/TS/CSS.
---

# Design inventory

Any HTML, TS or CSS edit can make the control inventory stale.
`npm run design:inventory-check` (about 1 s) says so.

## Steps

1. `cd ui && npm run design:audit-controls` regenerates
   `design_system/audits/06-control-inventory.json`.
2. **Review the diff.** Each change should be one you meant. An unexpected new
   control type, or a hand-rolled button where a design component exists, is a bug
   to fix in the code, not to record.
3. Update `design_system/audits/06-consolidation.md` and `11-reconciliation.json` to
   match.
4. `npm run design:inventory-check` passes.

Never regenerate without reviewing.

## Shared widgets

- A component that calls a new service method or changes controls: grep
  `design_system/stories` and the tests for it and run that one file
  (`npx playwright test --config ../design_system/playwright.config.mjs <file>`).
- `make design-verify` is about 10 minutes. It's a heavy gate: ask first.
- Use the design components (`mb-tabs`, `mb-toolbar`, `mbToolbarButton`, `mbButton`),
  not copied CSS. Text contrast is 7:1 on its real background; use `var(--muted)`
  for secondary text (`ops/engineering/contributing.md`). For control choices, see the
  ui-copy skill.
