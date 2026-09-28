# Sprint 10 — navigation and content-state adoption

Targets: public/list timeline loading/empty/pagination states; settings shell
navigation and page headers; eligible search/feed status notices from the audit.
Use existing native-link navigation, page header, content-state and notice widgets.

Preserve routes, query strings, browser history, active destination, translations,
loading-more scroll stability and existing content during retries. Do not replace
navigation links with buttons, or remove a feed to show a loading component.

Build actual-component previews for empty, loading, retained-content error and
recovery. Review long translated titles, narrow settings navigation and RTL.
Remove duplicate presentation CSS per migrated consumer, not via blanket cleanup.

Exit: named adoption inventory, routing/pagination regression checks, screenshots,
full test gate, production budget and refreshed drift inventory.

## Implementation checkpoint

Settings navigation, Public Timeline and List Timeline adopt 18 template
consumers. See [review notes](../REVIEW-10.md) and the
[consumer audit](../audits/10-navigation-and-states.md). Search's richer result
composition, mode tabs, member actions and member/metadata request recovery
remain explicit follow-ups. The legacy-parent preview spacing reported after
Sprint 9 is corrected here.
