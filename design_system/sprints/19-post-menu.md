# Sprint 19 — post ••• menu

User-requested follow-up to the 2026-10-13 menu fixes. Status: checkpoint A
(preview) implemented, review ready. Checkpoint B (StatusCard integration)
waits for user review. One planned sprint remains, this one.

## Why

Sprint 16 left StatusCard's main menus as explicit backlog: private-like state,
native links, timed-mute groups, provider gates and notes do not fit ActionMenu's
simple action array. The panels are hand-built `<details>` menus. On 2026-10-13
they needed three local fixes: a phone sheet lost to source order, a Close menu
row because that sheet covered its own trigger, and native tag-mute rows that
the inventory now reports as partial adoption. Each fix was local CSS that the
next one had to work around. The menu needs one shared contract.

## Contract (checkpoint A)

Mixed content keeps the Sprint 16 decision: a nonmodal Popover dialog with
native Tab order, not menu/menuitem roles. New pieces, all in
`ui/src/app/design-system/menu/` plus two Popover variants:

| Piece                           | Responsibility                                                                                                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MbPostMenu` (`mb-post-menu`)   | ••• trigger with post-action geometry, list-layout Popover, required `label` and `closeLabel`, a built-in final Close row, click isolation from parent cards and `close()`.                                                                                     |
| `button/a[mbMenuItem]`          | One row: start-aligned, 32px (44px touch) target, hover/focus, `tone="danger"`, `pressed` (aria-pressed), `expanded` (aria-expanded with a direction-aware marker). Commands close the menu; toggles stay open.                                                 |
| `MbMenuGroup` (`mb-menu-group`) | Optional visible caption naming a `role="group"`. `layout="inline"` renders compact choices (mute durations); `nested` indents and bounds a long revealed list (many hashtags).                                                                                 |
| `MbMenuSeparator`               | `role="separator"` rule between sections; precedes the Close row.                                                                                                                                                                                               |
| `MbPopover` variants            | `icon="more"` renders the trigger as a PostAction showing ••• and active while open. `layout="list"` uses list padding/width and, when content is taller than the space beside the trigger, caps its height to that side so the panel never covers the trigger. |

Native popover supplies light dismissal (tap outside), Escape, top-layer
ordering above neighbouring cards and viewport clamping, replacing the local
`z-index` lift, phone sheet and fixed-position CSS.

Exit A: production widget source with unit specs; a real-widget preview
reproducing the StatusCard menu (own post, other's post, provider without server
actions, 2 and 7 hashtags, muted author); browser checks for keyboard entry,
Escape and Close focus return, outside dismissal, toggles staying open,
commands closing, native links, 320px/narrow dark/RTL geometry and the trigger
left uncovered; design static and browser gates; review notes.

## Integration (checkpoint B, after review)

Replace the three StatusCard `details.danger-menu` panels with `mb-post-menu`.
Migrate PrivateLikeButton (`pressed`), TagMuteMenu (`expanded` + nested group,
keeping the four-tag inline limit), mute durations (inline group), and the
open-original links (native `a[mbMenuItem]`). Preserve provider gates,
local/server mute and block semantics, report flow, card-navigation isolation,
translations and the narrow-layout action alignment.

Known B risks, to resolve before deleting legacy CSS:

- Dialogs opened from inside the menu (tag filter, report) must not stay inside
  a hidden popover. Close first, then open, as ActionMenu already does.
- Popover closes on window resize/scroll. Check mobile address-bar resizes do
  not close a menu the reader is still using.
- Delete `.danger-menu*`, `.mute-durations` and the `:host:has()` stacking lift;
  `status-card.css` is over its 8 kB warning budget.
- Update the StatusCard spec selectors; do not weaken the assertions.

Out of scope: the photo-viewer menu (coupled to picture navigation and Escape
layering, per Sprint 16), the policy menu and other non-post popups.
