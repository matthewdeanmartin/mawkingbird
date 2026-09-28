# Sprint 9 — dialogs and recovery

Targets: shared confirm-dialog and AppDialogs consumers first; then eligible
leave/translation/effective-audience dialogs. Reuse approved dialog, notice and
disclosure components. Treat nested, prompt and destructive flows as first-class.

Preserve the service's queued operations, caller result values, cancellation,
input values, focus return, Escape/backdrop policy and busy-state ownership.
Compare current tests before replacing focus-trap behavior. Load required overlay
tokens in the application before replacing its surface styles.

Review real-component stories for confirm, cancel, prompt, busy, failure/retry
and nested interactions. Keep hover previews and checkable/radio menus pending
their own reviewed contract. Delete duplicate dialog CSS only after parity passes.

Exit: explicit migrated service/consumer list, keyboard and viewport tests,
manual Firefox/assistive-technology checkpoint, full app gate and bundle check.
