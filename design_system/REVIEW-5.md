# Sprint 5: content and repeated states

Open [Sprint 5 review](http://127.0.0.1:6006/?path=/story/start-here-sprint-5-review--review)
and the **Long names** variant.

- **Metadata:** account link, handle, timestamp and informational badges wrap on
  narrow screens. Links and semantic time remain caller-owned native elements.
- **Post actions:** reuse the approved embedded compact toolbar. Arrow keys skip
  the unavailable boost; Favorite and Bookmark expose their toggle state. Reply
  and reader actions show local feedback. Icon-only actions have accessible names.
- **Content states:** loading, caught-up, failure/retry and translated copy share
  spacing. Try again simulates recovery while the post remains in place.
- **Badges:** neutral labels and an attention variant use words and a border;
  neither variant claims account verification or acts like a button.

The fixture is local and makes no requests or preference writes. User-supplied
HTML, real post rendering, reader typography and posting friction remain owned
by their existing consumers. The post-action fixture is button-only; existing
rows containing links or read-only statistics need a separate reviewed contract.

[Sprint 5 opening audit](audits/05-content.md) records the integration boundaries.
Ordinary post/long-name preview accepted. Full-tools extension review and application integration are pending. Sprint 4's revised preview
was accepted; its application migration remains an explicit backlog item.

## Validation

The catalogue browser suite has 145 passing checks, including 18 content checks.
Coverage includes keyboard navigation, pressed/disabled states, native link/time
semantics, retained post content on retry, long names, narrow RTL, reduced motion,
44px coarse-pointer targets, and 7:1 text contrast across both themes and all six
accents. Links are included in the contrast checks. Runtime error guards apply.

Inspected screenshots: wide/light, narrow/dim and narrow/RTL under
`design_system/test-results/content.browser.mjs-content-layout-*/content.png`.
These are generated artifacts, not committed baselines.

Design-system unit subset: 18 tests across nine files. Full `make test` passed
with 7,580 tests in the runtime manifest and zero missing. Angular lint, scoped
CSS lint, formatting/types and Storybook build pass. Production app build passes
with an 883.21 kB initial bundle, within the unchanged 1 MB error budget. Existing
stylesheet-size and CommonJS warnings remain. No dependency versions changed.

Actual feed/network integration and assistive-technology verification remain
pending; the preview does not claim to test those production behaviors.
