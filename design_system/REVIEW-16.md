# Sprint 16 review: feed actions and poll disclosure

Follow-up: user review rejected the unnecessary Feed popup. The same preview now
shows direct View feed and compact Unsubscribe actions, with confirmation retained.
See [Sprints 17–18](REVIEW-17-18.md). The original popup review below is historical.

[Open Sprint 16](http://127.0.0.1:6006/?path=/story/start-here-sprint-16-review--feed-actions-and-polls).

The real RSS feed-action component uses the shared popover and spaced actions.
The real post poll-results component uses the shared disclosure. Frequent post
actions remain visible; this batch adds no overflow hiding.

## Try it

- Open **Feed ···**. View feed remains a native link. Escape returns focus to the
  trigger; clicking outside dismisses the popup without unsubscribing.
- Unsubscribe opens the existing confirmation. Cancel retains the subscription;
  confirm removes only the exact fixture URL. Reopen to see View feed retained
  without an unsubscribe action. Reset subscription restores the fixture.
- Open **Voting statistics** by keyboard. Switch between single and multiple
  choice, missing counts and hidden results. Hidden results expose neither counts
  nor statistics. Existing statistical explanations and formulas are unchanged.
- Try dark mode, narrow width and RTL. Actions retain a small gap and the popup
  stays inside the viewport.

Subscriptions and output are in memory; no storage, accounts or real feeds are
changed. Following View feed navigates to the existing app route; this isolated
catalogue does not implement that destination.

[Privacy correction](http://127.0.0.1:6006/?path=/story/start-here-sprint-15-review--privacy-and-trust):
Post visibility, Media and Posting language now share a bounded 24rem column.
The existing settings-row container query stacks Media's heading above its
checkbox. All three controls share the same starting edge in LTR and RTL.
Full-width dropdowns were a migration composition mistake, not an intentional
long-text scenario. No shared-control CSS override is needed.

## Integration

All four selected placements are in real app source. The RSS component serves
both headline and full-article views; a repeated row is counted once per source
placement. Main StatusCard mixed-content menus and photo-viewer keyboard/menu
coupling remain explicit backlog. No new shared widget variants were introduced.

Sprint 16 is implemented and review ready; Sprint 17 is next. Two planned sprints remain
(17–18). This working tree is uncommitted and not deployed. Final verification
and cumulative counts are recorded in the audit and progress report.

Cumulative source adoption: **21/27 toolkit types (78%)**, **200 direct placements
in 29 app templates**. This is toolkit reach, not whole-app completion. The
ledger retains 10 adopted scopes, 19 partial and 156 backlog files, plus 15 shared
and 9 lexical-only candidates. See [progress](PROGRESS.md).

Final verification passes: 7,622 full app tests with zero missing inventory
entries; 254 catalogue browser checks; 26 rule checks; types, formatting,
reconciliation, lint and translation checks. Production build/startup boundary
passes at 883.99 kB initial size against the unchanged 1 MB budget. Final wide
light, narrow dark and RTL previews were inspected, including the opened popup
and corrected Privacy column. No commit or deployment was performed.
