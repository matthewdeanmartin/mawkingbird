# Sprint 19 — post ••• menu opening audit

Opening review, 2026-10-13: StatusCard template/CSS, PrivateLikeButton,
TagMuteMenu, the shared Popover/ActionMenu/Help/Disclosure contracts and the
Sprint 16 menu decision. Source inspection only; rendered checks are recorded at
checkpoint A below.

| Location                                              | Evidence                                                                                                                                                         | Classification                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `status-card.html` three `details.danger-menu` panels | Own post, other's post and provider-without-server-actions variants. Hand-built rows, a red-by-default `button` rule, mute-duration chips, local notes.          | Gap: missing shared mixed menu    |
| `status-card.css` `.danger-menu-panel`                | Absolute anchor on desktop, fixed bottom sheet at ≤720px (order-dependent), `:host:has()` z-index lift over sibling cards.                                       | Drift: local positioning/stacking |
| `private-like-button.ts`                              | Native toggle button copying the panel's row styling inline, `aria-pressed`.                                                                                     | Duplicate row styling             |
| `tag-mute-menu.ts`                                    | Native rows copying the same styling; five or more tags collapse behind an `aria-expanded` toggle with a bounded list.                                           | Duplicate row styling             |
| Close menu row (three panels)                         | Added because the phone sheet can cover the ••• trigger.                                                                                                         | Keep; becomes built-in            |
| `MbActionMenu`                                        | Action-array API with menuitem roles; cannot hold links, toggles, notes or groups.                                                                               | Not reused (Sprint 16 decision)   |
| `MbPopover`                                           | Native popover: light dismissal, Escape, viewport clamp, top layer. Trigger is an outline text button; no list layout; may overlap the trigger on short screens. | Extend with reviewed variants     |

Decision: extend Popover and add menu rows, groups and a separator, composed as
`mb-post-menu`. No new dependency. Checkpoint A is preview-only; no StatusCard
consumer changes until review.

## Checkpoint A

Recorded with the review notes in [REVIEW-19](../REVIEW-19.md).
