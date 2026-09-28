# Sprint 4 opening audit

## Observed consumers

| Source                                                                                                      | Finding                                                                                                                   | Approved direction / migration prerequisite                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/src/app/confirm-dialog/confirm-dialog.{ts,html,css}`                                                    | Existing shared alert/confirm/prompt surface, fixed title IDs, backdrop and Escape cancellation, 440px width, 16px radius | New `MbDialog` previews the same surface shape. Preserve prompt value, caller outputs, mode, localization and each caller's dismissal policy during migration                          |
| `ui/src/app/a11y/focus-trap.ts`                                                                             | Already tested for stacked dialogs, wrapping and return focus                                                             | Keep existing consumers unchanged. Native modal handles inert background/top layer; new preview adds a local boundary handler because native Shift+Tab can leave the dialog's controls |
| `ui/src/app/feed-language-picker/feed-language-picker.html`                                                 | Mixed radio and checkbox menu items, active selections and cap behavior                                                   | Not eligible for the plain-action menu yet. Add and review checkable/radio item contracts before migrating                                                                             |
| `ui/src/app/effective-audience-dialog/effective-audience-dialog.html`                                       | Inline details explanation within a dialog                                                                                | Candidate for `MbDisclosure`; preserve existing text, initial open state and links                                                                                                     |
| `ui/src/app/compose/translate-dialog/translate-dialog.html` and `ui/src/app/leave-dialog/leave-dialog.html` | Local alert/error presentations and asynchronous work                                                                     | Candidate for `MbNotice` after preserving retry/cancel behavior and avoiding duplicate announcements                                                                                   |

## Boundaries and decisions

This sprint adds five preview widgets: dialog, anchored nonmodal popover, plain
action menu, disclosure and notice. There are zero migrated application consumers
in this sprint. The native primitives avoid adding a dependency for top-layer
ordering and background inertness. Their use does not change existing focus traps.

Dialogs mount/unmount under caller control; closing does not mean confirming.
The caller owns persistence, validation, error messages, destructive confirmation
and eventual success. Default backdrop dismissal is off; busy dialogs reject
Escape/backdrop and disable their own Close button. Callers must also disable
projected cancel/confirm actions while a transaction must not be interrupted.

Popovers are click-open and nonmodal. They close on outside interaction, Escape,
focus leaving, window resize or page scroll. Position is clamped to the viewport
and flips above a trigger when necessary. This is not a hover-preview replacement,
nor a nested submenu/checkable-menu contract. Preserve product-specific hover
behavior until it has its own reviewed replacement.

New palette literals are limited to two overlay tokens copied from existing
confirm-dialog CSS. New widget CSS remains under the token/escape lint policy.
No blanket rule forces legacy dialogs to migrate before their supported behaviors
are represented. The existing lint does not prove overlay interaction correctness.
The catalogue loads `design_system/tokens.css`; ensure those overlay tokens are
also loaded by the application before integrating the new surfaces there.

## Reference behavior

Native modal behavior follows [showModal](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal).
Action-menu keyboard behavior is based on the [WAI menu pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/).
Our documented menu skips disabled actions and supports plain commands only.

Integration is pending preview approval. Before migration, compare each target's
keyboard/hover behavior, URL semantics, localization, async failure, focus return
and backdrop policy. Delete duplicate surface CSS only after parity is verified.

## Preview exit check

The preview now has passing interaction, contrast and viewport coverage; see
[validation evidence](../REVIEW-4.md#validation). No duplicate application overlay
CSS has been removed because consumer migrations have not begun. The next audit
must record the actual migrated callers and retained exceptions after review,
including manual Firefox and assistive-technology verification.
