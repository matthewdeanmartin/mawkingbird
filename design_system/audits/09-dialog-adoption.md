# Sprint 9 adoption audit

## Migrated implementations

| Production component                        | Adopted contracts                                     | Preserved behavior                                                                                   |
| ------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `confirm-dialog/confirm-dialog`             | Dialog, prompt field/control, ordinary buttons        | Alert-dialog semantics; single OK alert; cancel/confirm/prompt results; backdrop/Escape cancellation |
| `leave-dialog/leave-dialog`                 | Dialog, ordinary action buttons, error notice         | All leave choices, identity-specific copy, backup failure and teardown calls                         |
| `compose/translate-dialog/translate-dialog` | Dialog, select/textarea fields, buttons, error notice | Busy language guard, failure/retry, edited Replace/Append result, cancellation during work           |

AppDialogs remains lazy and its service implementation is unchanged. Three dialog
implementations are counted, not every caller as a separately migrated widget.
Old overlay/header/control CSS was removed; specialized consequence-card and
pending destructive-button styles remain explicitly scoped. Overlay tokens now
load in both production configurations through the shared app stylesheet.

## Consumers of the shared confirmation surface

Paths relative to `ui/src/app/`. Their request logic was not rewritten.

Service callers:

- `admin/accounts/admin-accounts.ts`
- `admin/announcements/admin-announcements.ts`
- `bulk-follow-confirmation.ts`
- `compose/reply-mentions.ts`
- `config-sync.ts`
- `pages/observability/observability.ts`
- `pages/pastes/pastes-page.ts`
- `pages/profile/profile.ts`
- `pages/settings/config/settings-config.ts`
- `pages/settings/content/settings-content.ts`
- `pages/settings/storage/settings-storage.ts`
- `pages/storage-diagnostics/storage-diagnostics.ts`
- `post-confirmation.ts`
- `status-card/status-card.ts`

Direct component consumers:

- `compose/compose.ts`
- `pages/collection/collection.ts`
- `pages/drafts/drafts-page.ts`
- `pages/home/home.ts`
- `pages/list-timeline/list-timeline.ts`
- `pages/lists/lists.ts`
- `pages/rss/feed-actions/feed-actions.ts`
- `pages/settings/accounts/settings-accounts.ts`

## Keyboard parity and evidence

The shared dialog preserves `alertdialog` semantics and can omit its header close
button when all dismissal actions already exist in the footer. Unique IDs replace
fixed title/message IDs. Prompt Enter prevents default activation before focus is
restored. Legacy FocusTrap ignores keyboard events belonging to an open native
dialog, and the native dialog contains both Escape press and release propagation to legacy listeners.

Service specs retain duplicate-request, confirmation, notice, prompt and cancel
coverage and add queued decisions and Enter consumption. The RSS unsubscribe
spec still verifies both cancellation and removal; its obsolete CSS selector was
replaced with the Cancel action text. Legacy-trap coverage now includes a native
child. Browser checks exercise the real service, nested/legacy parents, pending
translation, error recovery, keyboard boundaries, focus return and viewport fit.

## Individually deferred

- Effective Audience: preserve its 520px four-metric layout until a wide native
  dialog composition has been previewed. Its read-only scan/stop behavior is
  unchanged. This is migration debt, not a permanent exemption.
- Leave consequence cards: each choice embeds important explanatory text. A plain
  button substitution would lose the composition; retain until that variant is
  reviewed. Its existing danger text now uses the shared theme-aware error token.
- Destructive confirmation button: the shared button currently has solid/outline
  variants only. Keep its existing danger treatment pending a reviewed contract.
- Hover previews and checkable/radio menus: still outside the approved contract.
- Manual Firefox/assistive-technology review: still open; automation alone cannot
  sign off screen-reader announcements and navigation.

The lexical inventory remains 1,052 source files / 205 candidate files. This is
not an adoption percentage and does not hide remaining legacy dialog candidates.
See [review notes](../REVIEW-9.md) for the working preview and final gate results.
