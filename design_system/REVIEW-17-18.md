# Combined Sprints 17–18 review

[Open local panels and metadata](http://127.0.0.1:6006/?path=/story/start-here-sprints-17-and-18-review--local-panels-and-metadata).
[Open corrected Feed actions](http://127.0.0.1:6006/?path=/story/start-here-sprint-16-review--feed-actions-and-polls).

Feed no longer opens a second button to navigate. **View feed** is a direct native
link. Subscribed feeds also show **Unsubscribe**, which still opens confirmation.
Cancel retains the feed; confirmation removes the exact subscription and retains
saved articles/history. When the component remains mounted, focus moves to View
feed after unsubscribe. Both actions use the compact mixed-action group.

The real client-list page now uses the shared heading, local tabs, member links
and metadata. Names/handles wrap. Posts and Members keep their original mount/
unmount behavior; switching tabs does not refetch accounts or posts. Edit history
uses shared version metadata with native time elements and unchanged content.

## Try it

- In the final-batch preview, focus Posts and press an arrow: focus moves without
  activating. Enter/Space selects Members. Home/End also work; arrows follow RTL.
  Member links retain their native account destinations.
- Switch back to Posts; the read counter stays unchanged. The fixture has no
  posts, so its existing empty-post message remains. Unit tests additionally use
  a post stub to verify mount/unmount parity with real page logic.
- Loading lets you switch panels before Finish loading. Empty list and Missing
  list preserve their distinct messages and Back to feeds navigation.
- Edit history shows two versions and native timestamps. Escape closes it and
  returns focus. Try dark mode, long names and 320px RTL.
- The corrected Feed preview includes subscribed and unsubscribed states. Verify
  direct View feed, Cancel, confirmation and retained navigation after removal.

All preview reads/subscriptions are isolated in memory. Native destination routes
are not implemented by this isolated catalogue. No real account, storage,
subscription or publishing action is performed.

## Completion and integration

**Sprints 17 and 18 are combined. Zero planned sprints remain.** All **11 selected
placements** are integrated: seven client-list header/tab/link/metadata placements,
one edit-history metadata placement, and three replacement RSS action placements.
Net growth is eight, giving **208 direct placements across 30 app templates**.
**24/27 toolkit types (89%)** have app consumers; this is toolkit reach, not the
percentage of the whole app migrated.

The ledger retains **10 adopted scopes, 20 partial and 155 backlog files**, plus
15 shared and 9 lexical-only candidates. Main post menus and initial-read recovery
remain explicit work. Section, ActionMenu and Popover remain catalogue-only;
closing the plan does not require forcing these into unsuitable consumers.

Changes remain uncommitted and not deployed. See [progress](PROGRESS.md) and the
[closeout audit](audits/17-18-final-batch.md) for evidence and residual scope.

Final validation passed: 7,626 app tests (zero missing inventory entries),
261 browser checks, 31 rule checks, types, formatting, reconciliation, lint and
translations. Production initial size is 883.99 kB within the unchanged 1 MB
budget. Narrow dark, wide light and RTL layouts were checked; screenshots of
member identities, history and direct Feed actions were inspected.
