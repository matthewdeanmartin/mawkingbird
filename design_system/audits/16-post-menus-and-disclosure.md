# Sprint 16 — post menus and disclosure audit

The user requested the next sprint along with a Privacy layout correction.
Opening review covered StatusCard, RSS FeedActions and both its callers,
PollResults, the photo viewer, shared popover/menu/disclosure contracts and
existing consumer specs. This is a bounded adoption pass, not all post menus.

| Location              | Evidence and change                                                                                                                                                                                                                     | Classification                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Privacy post defaults | Full-page selects surrounded a two-column Media row. Bound the composition to 24rem; the existing row container query stacks its heading. Controls share a starting edge.                                                               | Corrected Sprint 15 composition                       |
| RSS FeedActions       | Local details popup, manual absolute alignment and copied action styling. Adopt Popover and two Button placements, retaining a native RouterLink and confirmation. Existing group label identifies the feed; the trigger stays compact. | Adopted scope                                         |
| RSS callers           | Headline/full-article views share this component. Remove obsolete align input from the full-view caller; native viewport clamping owns positioning.                                                                                     | Parity retained                                       |
| PollResults           | Local statistics details/summary become Disclosure. Keep result gating, formulas, explanatory text and charts. Prevent numeric result strings splitting in narrow RTL layouts.                                                          | Adopted disclosure scope; specialized charts retained |
| StatusCard main menus | Private-like state, native links, timed mute groups, provider gates and notes do not fit ActionMenu's simple action array.                                                                                                              | Explicit backlog; preserve visible frequent actions   |
| Photo viewer          | Menu state couples to picture navigation, document arrow handlers and Escape layering.                                                                                                                                                  | Separate integration pass required                    |

Four selected shared placements are integrated: one Popover, two Buttons and
one Disclosure. Popover and Disclosure gain their first direct app uses.
No shared variant, dependency, translation key, storage key, publishing or provider
policy changed. ActionMenu remains available but unused in the app: choosing a
mixed-content Popover preserves native navigation and avoids incorrect menu roles.

## Verification and residuals

42 targeted app cases pass. Existing RSS page tests retain exact-feed unsubscribe,
cancellation, saved-article retention and unchanged sibling-row assertions.
Their summary selector is updated to the shared trigger. jsdom lacks native
showPopover/hidePopover: only those browser methods are stubbed in that test;
real dismissal and focus are exercised in browser checks. Two added unit cases
cover an absent subscription and a non-feed author identity.

Six new browser cases cover native href, first focus, Escape, outside dismissal,
cancel then confirmed exact-feed removal/output, no storage writes, hidden/missing/
multiple poll counts and wide light/narrow dark/320px RTL geometry. Existing
Privacy geometry cases now assert bounded select width and shared starting edges.
Screenshots are under `test-results/adoption-15.browser.mjs-*/` and
`test-results/adoption-16.browser.mjs-*/`. Popup screenshots use the viewport;
full-page screenshots can resize the viewport and correctly dismiss the popup.
No live-provider or manual screen-reader testing is claimed.

Specialized poll charts and the larger mixed-content menus remain separate work,
owned by the next contributor to those surfaces and a maintainer reviewer.
The RSS popup retains its existing two choices; no frequent action is moved into
an overflow menu. Its confirmation continues to explain saved articles/history
are retained. The fixture uses in-memory subscriptions only.

The ledger has 209 candidates: 10 adopted scopes, 19 partial, 15 shared,
9 lexical-only and 156 backlog. Source scan remains 1053 files. The parsed usage
report records 21/27 types (78%), 200 placements and 29 app templates. These
measure source reuse, not percentage of the app migrated. Sprint 17 is next;
two planned sprints remain (17–18). Changes are uncommitted and not deployed.

Final verification passes: 7,622 full app tests with zero missing inventory
entries; 254 catalogue browser checks; 26 rule checks; types, formatting,
reconciliation, lint and translation checks. Production build/startup boundary
passes at 883.99 kB initial size against the unchanged 1 MB budget. Final wide
light, narrow dark and RTL previews were inspected, including the opened popup
and corrected Privacy column. No commit or deployment was performed.
