# Sprint 3 — navigation and page structure

Preview page headers/notes, sections, link/list rows, action groups and tabs.
Distinguish navigation links from tab panels and action buttons. Retain the
current column widths, density, route semantics and mobile behavior. Include
long translated titles, active states, focus, overflow and narrow containers.

After approval, integrate settings navigation, search and account-list surfaces
identified by the opening audit. Keep cross-listed settings and existing paths.
Preserve keyboard navigation, route focus and accessible names.

Extend lint to catch local restyling of approved widget internals; pages still
own outer layout. Done: representative page screenshots match approved stories,
old duplicate header/tab/row CSS is removed, and a drift audit accounts for
remaining variants and consumers.

## Preview checkpoint, 2026-09-27

Implemented compact button toolbars, native navigation rows/tab-shaped links,
manual content tabs, page headers and labelled sections. The home feed and reader
are the visual references for toolbar density. Standalone pill actions stay
outside toolbars. See [review](../REVIEW-3.md) and [opening audit](../audits/03-navigation.md).

The preview has behavior specs, browser interaction/layout checks, and a focused
Angular template rule rejecting pill buttons inside toolbars. Full internal-style
ownership enforcement remains open; current lint is not a complete restyle detector.
Preview approved. The first [toolbar adoption batch](../audits/03-toolbar-adoption.md)
integrates the shared feed command bar, Home filters and reader text-size controls,
removing their duplicated internal button styling. Navigation/header/tab integration
and comprehensive ownership enforcement remain open. Native links/selects stay
outside the button-only toolbar focus sequence.
