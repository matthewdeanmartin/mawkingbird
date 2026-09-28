# Sprint 5 content audit

## Opening inventory

Source inspection covers six candidate pattern groups below; this is not a count
of every eligible application instance. Zero application consumers are migrated
in this preview. Owner: Sprint 5 integration after visual review.

| Location                                                                                      | Evidence / classification                                                                                                   | Proposed action                                                                                                                      | Verification                       |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `ui/src/app/status-card/status-card.html:69`, `.css:99`                                       | Metadata protects names from clipping; hover cards and route links have semantics beyond layout. Medium-risk extraction.    | `MbMetadata` wrapping layout only. Preserve hover anchors, routing, timestamp titles and mobile placement.                           | Source; long-name preview          |
| `ui/src/app/status-card/status-card.html:406`, `.css:438`                                     | Actions mix buttons, links and static counts; touch target overhang is deliberate. Specialized exception.                   | Preview reuses `MbToolbar` for button-only groups. Do not replace the real row until links/counts and touch spacing are represented. | Source; keyboard/touch preview     |
| `ui/src/app/status-card/status-card.html:96`, `.css:561`                                      | Pinned/provider/visibility labels share small text; verified badge has separate trust semantics. Low-risk visual candidate. | Preview neutral/attention `MbBadge`; retain verification and source behavior.                                                        | Source; contrast preview           |
| `ui/src/app/pages/public-timeline/public-timeline.html:15`                                    | Repeated muted loading/empty paragraphs. Low-risk candidate.                                                                | `MbContentState` preserving translated copy and loading branches.                                                                    | Source; state preview              |
| `ui/src/app/pages/home/home.html:201`, `ui/src/app/pages/list-timeline/list-timeline.html:42` | Feed/loading-more states coexist with content and paging. Medium-risk integration.                                          | Retain posts and scroll position; change only state presentation.                                                                    | Source; local retry preserves post |
| `ui/src/app/compose/compose.html:694`, `.css:348`                                             | Posting errors include structured diagnostics and recovery behavior. Specialized exception.                                 | Keep details and posting friction. Existing `MbNotice` may host prose; do not flatten into a generic empty state.                    | Source only; not migrated          |

## Preview exit criteria and remaining work

Four primitives are added: metadata layout, content link, informational badge,
and content state.
Actions reuse the approved toolbar without new button styling. There are no new
palette literals, dependencies or root feature imports. `MbContentState` uses
explicit opt-in announcements; actions are outside its live region.

Sprint 4's 4px action-trigger gap is accepted by the user. Its five overlay
primitives are still preview-only; this sprint does not conceal that integration
backlog or earlier unadopted form/navigation patterns.

After Sprint 5 review, enumerate individual eligible consumers before migration,
preserve routing/localization/media/HTML boundaries, and record adopted counts
and residual exceptions. Real network retry, timeline scroll stability, hover
cards, reader media and assistive-technology announcements require integration
verification; fixture tests do not establish those outcomes.

See [validation evidence](../REVIEW-5.md#validation). Screenshot inspection found
that the inherited accent-colored content link missed the project contrast goal;
`MbContentLink` now provides the text-token treatment and native underlining, and
links are included in all twelve theme/accent contrast combinations.
