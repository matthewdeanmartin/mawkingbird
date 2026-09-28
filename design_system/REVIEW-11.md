# Sprint 11 review: real post tools and enforcement

[Open the real post review](http://127.0.0.1:6006/?path=/story/start-here-sprint-11-review--provider-tools).

The production StatusCard action row now uses the reviewed mixed button/link
post-action group. Provider gates, ownership, counts, posting friction, menus,
confirmation and the default unified-share preference stay intact. Tools wrap;
none were removed to make the row fit. The nested Save to library control now
uses the same widget instead of copying the old action CSS.

## Try it

- Switch Signed in / Own post / Anonymous / RSS / RSS anonymous / Twitter /
  Bluesky. These are actual StatusCards with their existing capability rules.
- Favourite or Boost, then Fail action. The optimistic state rolls back and a
  shared error notice appears. Retry and Complete action to retain the state.
- The separate full-count buttons still open account lists. Counts are not
  abbreviated: the fixture stresses 123456 replies, 2000000 boosts and 12345678
  favourites. Ordinary counts fit using the same geometry.
- Own post retains visible edit, pin, policy and destructive controls. Delete
  opens the actual confirmation; Cancel restores focus without removing the post.
- RSS keeps native thread/original links. RSS anonymous also exercises the nested
  library control. The existing signed-in RSS branch does not expose that control;
  this provider discrepancy is recorded for follow-up, not silently changed.
- Unified share is off initially, matching the production default. Turn the
  preview preference on to exercise its existing menu and focused Boost action.
  A boosted menu trigger retains its selected treatment without claiming to be
  an ARIA toggle.
- Use Theme, Accent and Direction in Storybook, and narrow the viewport. Desktop
  actions use the approved compact 28 px targets; coarse pointers use 44 px.

The preview holds favourite/boost responses in a local service substitute. Other
Angular HTTP requests receive local empty results. This exercises real rendering,
capability gates and StatusCard state transitions, not live provider transport.
Existing app specs cover provider dispatch. Account-list contents are empty
fixtures; route destinations and unrelated composer workflows are not implemented
by this catalogue. Preference/flag changes are in memory; theme remains owned by
Storybook. The Sprint 6 superset remains available for combinations no single
provider supports.

## About the pale blue

It is the app's existing `--accent-soft`, not a new hard-coded baby-blue palette.
Selected navigation/tabs and pressed actions use the soft tint; ordinary buttons
remain neutral. Blue is the default accent. Rose, green, purple, orange and yellow
substitute their own tints, and dim mode derives the tint from the active accent.
Text/border/underline markers keep selection distinguishable without color alone.
The browser suite checks all six accents in both themes.

## Adoption and remaining work

This batch adopts 40 template consumers: one action group, 26 live StatusCard
button/link branches, ten count spans, two action notices, and the nested library
button. Commented reader links are not counted or re-enabled. Native disclosure
triggers/panels, polls, inline editors, translator choice and other controls
outside the action-row batch remain migration work.

The [audit](audits/11-post-tools-and-enforcement.md) and
[candidate ledger](audits/11-reconciliation.json) account for every current
scanner candidate. A new candidate without a ledger entry now fails the gate.
Backlog entries require deeper template/style/runtime review; their presence is
not an exemption or a claim of whole-app completion.

Validation passed: 155 targeted app specs, the complete 7,600-test app gate
(with zero missing tests), all 202 catalogue browser checks and 26 design-rule
checks. Lint, translation checks, inventory reconciliation and the production
build passed. The initial bundle remains 883.54 kB, below the unchanged 1 MB
limit. Wide light and narrow dim/RTL screenshots were visually inspected.
