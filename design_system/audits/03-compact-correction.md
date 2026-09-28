# Compact stacked toolbars and analytics consent

User review found that the first toolbar adoption lost the previous compactness.
The source audit found nested row and toolbar padding/separators, a 32px minimum
button height, and a growing action group that pushed the destination link away.

The correction introduces explicit `compact` and `embedded` toolbar options.
Feed actions, presentation, sources, Home filters and reader text-size controls
now consume the compact option. Groups inside an already styled row are embedded.
Removed the redundant command-bar border and action-group flex growth. This
restores dense rows while leaving regular standalone toolbar spacing intact.
Touch pointers retain 44px minimum button targets. No font size was reduced.

The new **Adoption / Sprint 3 toolbars / Stacked compact** story places four rows
together: actual command bar and reader components with representative projected
Home filter controls. Desktop geometry checks cap each single-line row at 36px
and the whole four-row stack at 144px. Mobile/RTL checks permit wrapping and
require no horizontal document overflow. This is a component composition fixture,
not a screenshot of a logged-in Home route.

“Count my page views” had three native implementations: LoginChooser, Mastodon
Login and Settings Privacy. All three now use `MbCheckbox`, retaining their
translation keys, `analytics` name and existing `ClientPrefs.setAnalytics` handler.
Removed Login's old nowrap/flex workaround. The checkbox owns start-aligned label
and hint layout even in centered parents. Its optional native `name` input keeps
existing control lookup and form semantics. Empty feedback has no status role;
the persistent polite region remains available when a status message is provided.

Verification includes label-click persistence in the real LoginChooser suite,
the existing login/OAuth and privacy behavior tests, and browser geometry checks
for checkbox/label/hint alignment in light, dim and RTL layouts. The illustrated
consent fixture intentionally sits inside a centered container to catch inheritance
regressions. Screenshots are in `design_system/test-results/compact.browser.mjs-*/`.

This corrects the adopted toolbar batch and migrates three analytics controls;
it does not complete the remaining settings/form adoption backlog. The unrelated
“Refresh Bluesky Chats” standalone action is not made denser by these variants.

Verification results: all 99 catalogue/browser checks passed, including the new
stack-height, centered-consent alignment, RTL and coarse-pointer checks. Inspected
wide/light and narrow/dim screenshots. Full `make test` passed with 7,577 runtime
tests present and zero protected tests missing. Design formatting/type checks,
changed app-file formatting and all 14 lint-policy checks passed.
Angular lint passed. Production build passed at 883,206 bytes initial JS/CSS,
below the unchanged 1 MB limit; the startup-boundary check also passed.
