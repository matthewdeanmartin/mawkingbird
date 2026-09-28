# Sprint 1 — foundation and the checkbox problem

## A. Preview checkpoint

- [x] Verify latest stable Storybook; pin 10.6.0 packages and compatible Angular peers.
- [x] Add a catalogue under `design_system/`, consuming real Angular widgets.
- [x] Implement checkbox with native semantics, hints, feedback and forms support.
- [x] Implement responsive settings row and bounded native button variants.
- [x] Add combined review page and isolated state examples.
- [x] Verify clean install, static build, behavior tests, lint and production build.
- [x] Verify browser rendering, interaction and layout with headless Chromium; inspect screenshots.
- [x] User accepted the working preview and requested Sprint 2 (2026-09-27).

Review: label/control alignment, long-label wrapping, compact density, narrow
settings rows, focus rings, disabled states, and button color treatment. The
neutral solid button intentionally avoids unreadable white-on-bright-accent
text. Accent-aware accessible fills can be designed before integration if desired.

## B. Integration checkpoint — after preview approval

- [ ] Migrate Privacy checkboxes, login consent, and CORS-proxy checkbox layout.
- [ ] Preserve save/revert behavior, existing text keys, and focus semantics.
- [ ] Promote required preview tokens to the shared runtime foundation.
- [ ] Remove replaced `.checkline`/`.checkbox-field` layout rules in those consumers.
- [ ] Add an AST-backed no-raw-checkbox rule for migrated templates, with helpful diagnostics.
- [ ] Verify app screenshots, unit inventory, complete test gate and bundle report.
- [ ] Run and record a drift audit; use findings to refine Sprint 2.

Done means the approved widget is used in these real screens, checks catch
reintroduction of local checkbox layouts, and the audit has evidence. A working
Storybook alone completes only checkpoint A's implementation, not the sprint.
