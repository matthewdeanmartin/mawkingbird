# Sprint 2 measured contrast

Measured in headless Chromium against the rendered Sprint 2 review story.
These are sampled field labels, hints, controls (including disabled fields),
radio labels/hints and the visible failed-save error, on their actual opaque
backgrounds. The requirement is 7:1. This does not certify the rest of the app,
reader-mode/test-build surfaces, focus indicators, or native control glyphs.

| Theme | Accent | Pairs checked | Lowest ratio |
| ----- | ------ | ------------: | -----------: |
| dark  | blue   |            27 |       7.45:1 |
| dark  | green  |            27 |       7.45:1 |
| dark  | orange |            27 |       7.45:1 |
| dark  | purple |            27 |       7.45:1 |
| dark  | rose   |            27 |       7.45:1 |
| dark  | yellow |            27 |       7.45:1 |
| light | blue   |            27 |       7.07:1 |
| light | green  |            27 |       7.07:1 |
| light | orange |            27 |       7.07:1 |
| light | purple |            27 |       7.07:1 |
| light | rose   |            27 |       7.07:1 |
| light | yellow |            27 |       7.07:1 |

Reproduce with `cd ui && npm run design:verify`. Raw computed colors and ratios
are written to `design_system/test-results/**/contrast.json` (ignored test output).
Source: `design_system/tests/forms.browser.mjs`.
