# Sprint 12 review: post dialogs

[Open Sprint 12](http://127.0.0.1:6006/?path=/story/start-here-sprint-12-review--read-and-recover).

The real liked/boosted-by lists, edit history and anonymous sign-in prompt now use
our shared dialog. Their local backdrops, focus traps, footer spacing and modal
geometry are removed. Shared button appearance now also supports native links;
the sign-in choices keep their URLs and link semantics while matching the other
actions. No blue legacy pills remain in this prompt.

## Try it

- Choose **Rows**, then open Liked by or Edit history. Long names, handles and
  formatted history wrap; the dialog scrolls internally. Close stays reachable.
- **Fail once** shows a distinct error. Retry loads rows. **Empty** shows the
  genuine empty state. A failed read no longer claims nobody liked a post or
  that its edit history is empty.
- **Hold** keeps the read pending. Close or Escape cancels it; the fixture's
  counter confirms cancellation. Public edit history exercises the anonymous
  service entry point separately from the signed-in service.
- **Nested post dialogs** opens history above a parent. Escape closes the child
  and restores its opener; a second Escape closes the parent.
- **Sign-in prompt** retains Not now, Create an account and Sign in. The latter
  two are native links. In this fixture they record a simulated account exit and
  route to a labelled local destination; no account or storage changes occur.
- Check the theme and direction controls, and narrow the window to a phone.

The fixture uses real dialog components with local read-service substitutes.
Rows/history arrive after a short delay; Hold has no timer. It does not exercise
live transport, account-list pagination or an external provider. Unit tests
verify real API paths, retry parameters and destruction cancellation. Existing
Sprint 11 browser tests continue covering dialog opening from actual StatusCards.

## Scope

Three dialog implementations; 16 adopted template consumers: three modal shells,
six content states, four read-dialog buttons and three sign-in actions. Long-list
account rows and edit snapshots retain their content-specific layout. The public
native-link API reuses the approved solid/outline appearance; it adds no synthetic
button role, click handler or disabled behavior to links.

The candidate ledger now records eight adopted scopes and 162 backlog files
(previously five and 165). These are file dispositions, not an adoption percentage.
Post menus, polls, larger forms and prior deferred variants remain in the backlog.
See the [audit](audits/12-post-dialogs.md).

Validation passed: 155 targeted app tests, the complete 7,606-test app gate
with no missing tests, all 214 catalogue browser checks, and 26 design-rule
checks. App lint, translation checks and inventory reconciliation passed. The
production build remains 883.54 kB initial size, below the unchanged 1 MB limit.
Wide/light and narrow/dark/RTL renders were inspected, including the final neutral
sign-in action appearance.
