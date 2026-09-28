# Sprint 2 review — forms that fit together

Open [Sprint 2 in Storybook](http://127.0.0.1:6006/?path=/story/start-here-sprint-2-review--review).

New solved patterns:

- A single label/hint/error layout around real text, number, password, select and textarea controls.
- Native radio groups with stable option-label/hint alignment and keyboard behavior.
- Consistent saving/saved/error feedback, with polite status and alert semantics.

Try changing the display name and choosing **Save successfully**. Change it again
and choose **Simulate failed save**: the last confirmed name returns and the error
appears beside the field. An empty name exercises required validation. This is
an in-memory fixture; nothing is sent to a server or persisted.

Please review field border weight, label spacing, textarea size, option spacing,
and feedback placement. Switch light/dim and direction in the toolbar; narrow
the viewport. Separate stories show required, invalid, disabled and long-copy
examples without needing to trigger each state manually.

## Evidence and limits

- All 55 current browser checks pass, including both manager review routes and every widget story.
- Inspected desktop/light, narrow/dim and narrow/RTL screenshots.
- Tested form text/background pairs meet 7:1 across both themes and all six accents.
  The checks include actual control, hint, error and disabled-control surfaces;
  this is not a claim that the whole app has compliant contrast.
- Twelve Angular widget behavior tests and eight CSS-policy tests pass.
- Full `make test`: 7,571 tests present, zero protected tests missing.
- Production build: 883,066-byte initial JS/CSS, below the unchanged 1 MB budget.
- Clean `npm ci`, catalogue verification and Angular lint passed.
- The broader `check:static` run stopped at the existing starter-kit membership
  check. No catalogue data or starter-kit scripts were changed by this sprint.
- The standalone app-wide format check reports 18 untouched files. Design-system
  formatting passes; unrelated files were not reformatted.
- Native Firefox and assistive-technology testing remain outside this Chromium pass.

User response: **accepted to proceed to Sprint 3**. New form integration: **not started**. The existing
app screens retain their current controls until this preview is reviewed, per
the requested workflow. See the [audit](audits/02-forms.md) for migration targets
and the distinction between library enforcement and legacy inventory.

See [measured contrast results](audits/02-contrast.md): the lowest sampled ratio
was 7.07:1 in light mode and 7.45:1 in dim mode.
