# Sprint 16 — post menus and disclosure

Status: implemented, review ready. Sprint 17 is next; two planned
sprints remain (17–18).

Opening audit found StatusCard's main menus mix native links, private-like state,
timed-mute groups and provider-specific controls. They do not fit the simple
ActionMenu action-array API. Preserve them as explicit follow-up rather than
flattening them or hiding frequent actions. The photo viewer also has coupled
menu/navigation keyboard state and requires a separate integration pass.

The bounded eligible scope is RSS feed actions, used in headline and full-article
views, plus the poll-statistics disclosure embedded in posts. Four placements:
one Popover, two Button actions (including a native route link), one Disclosure.
No new shared variants. Preserve subscription identity, confirmation, output,
saved articles, statistics formulas and result visibility.

Exit: real-component previews; keyboard/light-dismiss/focus checks; native feed
link and cancel/confirm parity; hidden/missing-count/multiple-choice polls;
wide light, narrow dark and RTL screenshots; app and catalogue gates; ledger
and source adoption counts. Privacy's Sprint 15 width/alignment correction is
included and verified in its existing review story.
