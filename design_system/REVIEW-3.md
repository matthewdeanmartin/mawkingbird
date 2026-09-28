# Sprint 3: compact actions and navigation

Open [Sprint 3 review](http://127.0.0.1:6006/?path=/story/start-here-sprint-3-review--review).

The home-feed example makes the requested distinction visible: a standalone
writing action, a compact toolbar of feed controls, and tabs for content views.
Toolbar buttons use flat surfaces, 5px corners and 2px gaps, following the
existing home and reader treatments. Selected actions have an underline as well
as a background. Touch pointers get at least 44px targets.

Try toggling Boosts and Calm feed, refreshing, switching content tabs, and the
narrow reader toolbar. Tab enters each toolbar once; Left/Right, Home and End
move between enabled actions. Space/Enter activate. Direction follows RTL.
Content tabs use manual activation: arrows move focus; Space/Enter select.
Native navigation links retain normal browser behavior and mark the current page.

Review light/dim, narrow widths, RTL, and the individual long-label stories.
The fixtures do not call services or persist preferences. Header and section
components preserve the app's dense column layout.

The new lint rule rejects `mbButton` inside `mb-toolbar`, including Angular
control-flow blocks. It runs through the app's existing external/inline template
lint pipeline. Shared-widget CSS continues to enforce theme tokens and reject
styling escape hatches. These checks do not detect every possible local restyle.

Preview approved: “Continues to look good, proceed.” The first toolbar integration
batch is recorded in the [adoption audit](audits/03-toolbar-adoption.md).
Navigation/header/tab adoption remains open. See the [opening audit](audits/03-navigation.md)
and [component contracts](components.md#toolbar). Existing Sprint 1/2 integration
backlogs remain visible.

Browser verification uses Chromium; assistive-technology and Firefox checks
remain manual follow-up work. Screenshots are review evidence, not automatically
accepted visual baselines.

## Verification

- Storybook build and design formatting/type checks pass.
- All 88 catalogue/browser checks pass. An initial Sprint 1 manager load timed
  out; the unchanged check passed in the complete rerun.
- New toolbar/navigation text samples meet 7:1 in both themes and all six accents.
- Fifteen widget specs and thirteen lint-policy tests pass, including inline
  Angular template processing.
- Desktop/light, narrow/dim and narrow/RTL screenshots inspected.
- Full `make test` passed: 7,574 tests present, zero protected tests missing.
- Angular lint passed. Production build passed: 883,066 bytes initial JS/CSS,
  below the unchanged 1 MB limit. Existing component stylesheet size warnings remain.
- Existing unrelated starter-kit membership and app-wide formatting findings
  from Sprint 2 remain outside this change.
