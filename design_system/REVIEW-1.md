# Sprint 1 review

Open [the combined review page](http://127.0.0.1:6006/?path=/story/start-here-sprint-1-review--review).
The sidebar also has individual checkbox, settings-row and button examples.

Please assess:

1. Checkbox position next to one-line and wrapped labels, plus hint alignment.
2. Density and spacing: familiar enough for existing settings and login screens?
3. Narrow settings rows: the group heading stacks above the control column.
4. Error/saved placement and legibility in light and dim themes.
5. Button treatment: familiar pill geometry, neutral high-contrast fill. Should
   the next revision explore accent-colored fills with accessible foregrounds?

The toolbar changes theme, accent and LTR/RTL. Individual checkbox stories cover
checked, disabled, indeterminate, save failure, saved, long text and German copy.
Click labels, use Tab/Space and resize the browser. Buttons are preview-only
native controls with no application actions attached.

The app still uses its existing components. This checkpoint selects the reusable
solution before migrating Privacy, login consent and CORS-proxy screens.

## Decisions

- User accepted the working preview and requested Sprint 2 on 2026-09-27.
- Integration: **not started**.
- Rich linked descriptions, radios and general fields: Sprint 2.
- Preview error-color tokens: isolated until approved for runtime integration.
- Automated template/CSS enforcement: begins with Sprint 1 integration; the
  current preview does not yet enforce compliance on application screens.

## Verification record

Verified on Node 24.18.0:

- Clean `npm ci`: passed.
- `npm run design:build`: passed with the pinned Storybook 10.6.0 stack.
- `npm run design:browser`: 18 Chromium render/interaction/layout checks passed.
- `npm run design:check`: formatting and TypeScript passed.
- `npm run lint`: passed.
- `npm run design:test`: four checkbox behavior specs passed.
- `make test`: passed, 7,563 tests present and zero protected tests missing.
- `npm run build:mockingbird`: passed, 883,066-byte initial JS/CSS under 1 MB;
  startup-boundary and mock-leakage checks passed.

Browser verification now runs in headless Chromium. The original preview exposed
a declaration-file alias bug (`applicationConfig is not a function`), corrected
by allowing Webpack to resolve Storybook's JavaScript entry. Browser tests verify
the manager, every story, label and keyboard interaction, disabled behavior,
hint alignment and overflow at desktop/light and narrow/dim sizes. Both rendered
review screenshots were inspected. This is rendering evidence, not user approval
or a complete accessibility/contrast audit. Native Firefox remains unverified.
