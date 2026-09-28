# Sprint 14 — list membership dialog

Status: **implemented; review ready**. Sprint 15 is next; four planned sprints
remain (15-18). See [review](../REVIEW-14.md), [audit](../audits/14-list-membership.md)
and [progress](../PROGRESS.md) for source integration and counts.

Adopt reviewed widgets in the real ListDialog. Its opening source review found a
local overlay/focus trap, three checkbox/label implementations, three create-name
inputs without visible labels, local ordinary-button geometry and visibility tags.

Use the shared modal, checkboxes, field/control pairs, buttons, notices and badges
where their existing contracts fit. Preserve server lists, anonymous lists,
browser-private lists and public collections as separate choices. Preserve the
explicit follow-and-add gate: following is a visible social action, never implied
by checking a box. Preserve Enter, busy, failure and membership behavior.

Before changing controls, audit native input rollback against the controlled
shared checkbox, asynchronous collection updates and duplicate submissions.
Keep richer/new behavior outside the migration unless it is needed for parity.

The real-component preview must cover long names, current membership, local and
server branches, the follow gate, pending/failed writes, create-and-add, keyboard
operation, nested dialogs and narrow/light/dark/RTL layouts. Use local fixtures;
no real follow, list or collection writes during preview.

Exit: exact adopted/eligible counts, residual classifications, targeted ListDialog
and caller specs, full app gate, production budget and catalogue verification.
Report Sprint 14 complete, Sprint 15 next, four planned remaining (15–18).
