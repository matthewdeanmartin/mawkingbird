# Sprints 17 and 18 — combined final planned batch

User-requested combination. Status: implemented; review ready.
Zero planned sprints remain after this batch. App migration remains incomplete.

Opening scope: ClientListPage's local Posts/Members panels, heading and account
identity content; HistoryDialog's version metadata. Existing tabs eagerly create
projected panels, so preserve the caller's original conditional post/member
mounting inside each panel. Do not convert URL navigation into tabs, refetch on
tab activation or change read semantics. Keep profile links native.

User correction: replace Feed's popup indirection with direct View feed and,
for subscribed feeds, compact Unsubscribe plus existing confirmation. Use the
existing mixed-action group; no new split-button contract is necessary.

Deliver 11 placements (eight added, three replaced), real-component previews,
semantic and lifecycle tests, scoped drift lint and a reconciliation of Sprints
14–17. Report remaining candidate files, unused toolkit types and delivery status
separately from the plan's zero remaining count. See [review](../REVIEW-17-18.md)
and [audit](../audits/17-18-final-batch.md).
