# Sprint 12 — dialogs reached from post tools

The user accepted Sprint 11 and requested the next batch. Adopt the reviewed
modal, content-state and ordinary-action widgets in AccountListDialog,
HistoryDialog and SignInPrompt. Preserve account destinations, anonymous exit,
origin-specific history reads, HTML rendering and close behavior.

Distinguish failed account/history reads from empty results; offer guarded Retry
and cancel subscriptions when the dialog is destroyed. Remove local overlay,
focus-trap, footer and geometry duplication. Share the approved solid/outline
appearance with native anchor actions, preserving href/routerLink semantics.

Preview the real components with long lists/history, empty/error/held reads,
small screens, light/dim, RTL, native navigation and nested modal dismissal.
Verify the existing real StatusCard fixture still opens these dialogs correctly.

Deliverables: [review](../REVIEW-12.md), [audit](../audits/12-post-dialogs.md),
updated candidate ledger, targeted specs, full app gate, production budget and
catalogue verification. Remaining post menus and larger form dialogs stay in the
backlog. No additional visual variant, provider policy or posting flow is invented.
