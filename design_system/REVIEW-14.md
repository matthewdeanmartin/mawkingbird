# Sprint 14 review: list membership

[Open Sprint 14](http://127.0.0.1:6006/?path=/story/start-here-sprint-14-review--memberships).

The real ListDialog now uses shared modal, checkbox, field/control, button,
notice and badge components. Private server lists, anonymous local lists,
browser-private lists and public collections retain their separate behavior.
The three create-name fields now have visible labels. Long names wrap beside
aligned checkboxes, and the dialog scrolls internally on small screens.

## Try it

- **Lists and collections** shows all three sections. Add/remove membership by
  label or keyboard. Checks reflect confirmed membership; pending writes disable
  the affected choice. **Slow** keeps the write pending for two seconds.
- **Fail once** shows a recoverable write error without a phantom check. Retry
  the same choice. A failed create retains the entered name.
- **Follow first** shows the explicit public-follow warning. Cancel performs no
  follow. Follow and add follows once and retries the exact list.
- **Anonymous lists** exercises local lists and browser-private lists without
  any public follow or server writes. **Empty lists** supports create-and-add;
  Enter works in each named field. **Collections unavailable** retains its message.
- **Nested membership** opens above an account-actions parent; Escape returns
  focus to its opener and leaves the parent's scroll lock intact.
- Try dark mode, RTL and a narrow window. The public badge uses the existing
  attention style; privacy is also written explicitly, not conveyed by color alone.

All preview services are in memory. No storage, real account, follow, list or
collection is changed. Existing Angular HTTP tests also exercise real payloads.
A newly created collection stays visible if adding its member fails, allowing
membership retry without creating another collection.

## Integration and remaining plan

**Sprint 14 implemented; Sprint 15 next; four planned remaining (15–18).**
All **22 selected shared-widget placements** are integrated into real app source:
one shell, three checkboxes, three field/control pairs, six buttons, three notices
and three badges. The shared checkbox also correctly restores its native value
when a consumer rejects a change synchronously.

Cumulative source adoption: **17 of 27 component/directive types (63%)**, with
**183 direct placements across 26 app templates**. This is toolkit usage, not
percentage of the app migrated. The candidate ledger has 8 adopted scopes,
18 partial and 159 backlog files (plus 15 shared and 9 lexical-only).

ListDialog remains partial: initial read failure/retry and unsupported-versus-failed
collection discovery still need a dedicated read-state pass. Its static loading/
empty paragraphs remain outside this control batch. No claim of whole-dialog
functional modernization is made. See [audit](audits/14-list-membership.md).

Changes are in the working tree, uncommitted and not deployed. See
[progress](PROGRESS.md) for the next four scopes and reproducible counts.

Validation passed: 29 targeted app cases; the final complete app gate passed
7,616 tests with zero missing inventory entries. `design:verify` passed all 238
catalogue browser checks and 26 design-rule checks, plus types, formatting,
build and inventory reconciliation. App lint and translation checks passed.
The final production build is 883.54 kB initial size, within the unchanged 1 MB
budget. Final light/dark and 320 px RTL screenshots were inspected after the
translation correction.
