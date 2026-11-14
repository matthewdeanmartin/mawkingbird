# Plan B for preserving reading position

Status: reference and contingency plan; no implementation proposed today.

Date: 2026-11-13.

## Problem and required behavior

A reader loads ten more pages of a feed, opens a thread, visits a profile,
and presses Back. They should return to the same post at the same position,
with their loaded posts, filters, and ability to continue pagination intact.
Browser Back/Forward and the application's Back button should agree.

Saving a pixel coordinate alone is insufficient. If the returning feed only
contains page one, the document is too short to restore that coordinate.
Even with all posts present, changed image heights or newly inserted posts can
move the reader away from the content they were reading.

This document preserves findings from source inspection of Mawkingbird and the
local `../REFERENCE/elk`, `../REFERENCE/phanpy`, and `../REFERENCE/mastodon`
checkouts. It does not claim runtime verification of those clients. The
reference paths below are relative to this document. No test suites were run
for this investigation.

## Current Mawkingbird implementation

The current solution already addresses this problem. Keep it unless a concrete
failure or resource constraint justifies a change.

- [ReadingHistory](../ui/src/app/shell/reading-history.ts) implements Angular's
  `RouteReuseStrategy`. It detaches and retains reading pages, including their
  DOM, component state, and component-scoped pagination services.
- History metadata distinguishes individual visits and retained views. Separate
  visits to the same URL can retain separate state; query-only changes can
  share a mounted view.
- It records scroll coordinates, a visible post/article element and its viewport
  offset, and keyboard focus. Reattachment restores the same page instance.
- Restoration uses the anchor element when available, falling back to saved
  coordinates. A `ResizeObserver` corrects layout changes for up to three
  seconds, stopping on user interaction or subsequent navigation.
- [ReadingOutlet](../ui/src/app/shell/reading-outlet.ts) invokes optional
  suspend/resume hooks. Home suspends its live subscription when detached.
- Retention is bounded to ten detached views and 100,000 DOM elements across
  retained views. Ten pagination clicks within one feed are still one view.
- State is memory-only. Reloads, account/server changes, and eviction invalidate
  retained state. An evicted view must be rebuilt.

Existing evidence to preserve:

- [Unit coverage](../ui/src/app/shell/reading-history.spec.ts) exercises nested
  navigation, pagination continuity, Forward, separate visits, query changes,
  eviction, scope changes, canceled navigation, and direct-entry fallback.
- [Browser coverage](../design_system/tests/reading-history.browser.mjs) loads
  ten more pages, visits a thread and profile, checks Back/Forward, position,
  focus, late layout changes, and continued pagination at desktop and mobile
  widths. This is a controlled story, not proof that every production feed
  follows the same lifecycle correctly.

Before switching, reproduce the failing production route and determine whether
the cause is missing reading-route coverage, eviction, a component reset,
background updates, a different scroll container, or restoration timing.

## Reference approaches

| Client | Data and view preservation | Position preservation | Applicability |
| --- | --- | --- | --- |
| Elk | Nuxt/Vue KeepAlive retains pages and paginator state | Framework router restores saved positions | Not a migration option; do not introduce Nuxt or change framework |
| Phanpy | Feed stays mounted beneath thread/profile presentation | Existing scroll container keeps its position | Can be implemented with Angular routing and persistent reading surfaces |
| Mastodon | Redux retains timeline data independently of mounted views | Per-history-entry scroll storage plus cached row heights | Can be implemented using Angular services/stores and current routing |

Elk's [`keepalive: true`](../../REFERENCE/elk/nuxt.config.ts) and
[paginator](../../REFERENCE/elk/app/composables/paginator.ts) confirm the
retained-page approach; automatic pagination stops while deactivated. No custom
scroll-restoration implementation was found in that checkout. Nuxt's
[default router implementation](https://raw.githubusercontent.com/nuxt/nuxt/main/packages/nuxt/src/pages/runtime/router.options.ts)
restores saved Back/Forward positions after page loading. That upstream link is
moving source, not a pinned version of Elk's dependency. Elk is architectural
context only: the practical Angular equivalent is already our retained-route
implementation.

## Preferred fallback: data snapshots and anchor restoration

Use Mastodon's separation of data from mounted views if retaining large DOM
trees becomes too expensive, or if readers need restoration after view eviction.
This is the general-purpose fallback, without a framework change.

### What Mastodon does

- [Timeline reducer](../../REFERENCE/mastodon/app/javascript/mastodon/reducers/timelines.js)
  retains ordered timeline IDs and pagination-related state in Redux rather
  than relying on the lifetime of the rendered timeline component.
- [ScrollContext](../../REFERENCE/mastodon/app/javascript/mastodon/containers/scroll_container/scroll_context.tsx)
  integrates the `scroll-behavior` library with router navigation.
- [Position storage](../../REFERENCE/mastodon/app/javascript/mastodon/containers/scroll_container/state_storage.ts)
  saves coordinates in session storage keyed by history-entry key and optional
  scroll-container key. This supports independently scrolling columns.
- [ScrollableList](../../REFERENCE/mastodon/app/javascript/mastodon/components/scrollable_list/index.jsx)
  keys height caches by history entry and scroll container.
  [Offscreen articles](../../REFERENCE/mastodon/app/javascript/mastodon/components/scrollable_list/intersection_observer_article.jsx)
  retain measured-height placeholders while reducing rendered content.

Session-stored coordinates do not by themselves guarantee restoration of ten
pages after a reload: the corresponding data and layout must also be available.
Do not infer full reload recovery from Mastodon's coordinate storage.

### Angular adaptation

Introduce a bounded reading-state store independent of component lifetime.
Reuse existing history-entry identity and account/server scoping where possible.
Do not key restoration solely by URL: two visits to the same feed can represent
different reading sessions.

A snapshot needs enough information to reconstruct the exact loaded window:

- Account/server identity, history visit, route parameters, query/filter state,
  and scroll-container identity.
- Ordered item IDs and the data needed to render them immediately. A snapshot
  of IDs alone is inadequate if the entity cache has already evicted the posts.
- Provider-specific pagination cursor(s), exhaustion state, and any accumulated
  state needed to request the next page without restarting or duplicating it.
- Stable visible-item ID and its viewport offset, with pixel coordinates as a
  fallback. Unlike the current DOM anchor, an ID survives component destruction.
- Focus target identity, rather than a reference to a destroyed element.
- Optional measured row heights, qualified by layout conditions such as width.

Restoration sequence:

1. Before leaving, capture the loaded window, cursors, anchor, and focus.
2. On Back/Forward, locate the snapshot for the visit and current identity.
3. Hydrate the page from the snapshot before normal initial-load logic runs.
   Do not fetch page one and overwrite the retained window.
4. Render the saved window. If virtualized, establish spacer geometry and bring
   the anchor item into the rendered range first.
5. Restore the anchor's viewport offset after rendering; correct subsequent
   layout shifts for a bounded interval and stop when the reader interacts.
6. Restore focus without scrolling, and resume pagination from saved cursors.
7. Buffer incoming posts or expose a new-posts action instead of prepending
   content that displaces the reader during restoration.

If the anchor post was deleted, choose a surviving neighboring item from the
saved ordering, then fall back to coordinates. If the snapshot was evicted or
cannot be reconstructed, load normally; do not replay ten network pages merely
to reach an old pixel coordinate.

Keep the first implementation memory-only unless reload recovery is explicitly
required. Durable storage is a separate product decision involving private
content, quotas, expiration, schema migration, and logout/account cleanup.
Persisting only coordinates is not a substitute for that design.

### Tradeoffs

This can retain more reading history with less DOM memory and allow components
to follow normal destruction lifecycles. It requires explicit snapshot contracts
for different providers and feed types, careful ownership of cached entities,
and reliable render timing. Virtualization adds another geometry problem;
measure actual memory pressure before introducing it.

A useful incremental form is a hybrid: retain a small number of recent Angular
views exactly as today, but snapshot their data before eviction. Restore from
the live view when present and reconstruct from a snapshot otherwise. Define
one owner for each visit so the live view and snapshot cannot diverge silently.

## Alternative fallback: keep the feed mounted beneath details

Use Phanpy's approach if the main problem is frequent feed-to-thread/profile
round trips and preserving a live feed surface is simpler than snapshotting it.

### What Phanpy does

- [App routing](../../REFERENCE/phanpy/src/app.jsx) keeps Home mounted beneath
  secondary pages. For status routes, `SecondaryRoutes` renders the previous
  location as the background while a separate route renders the status.
- [Account links](../../REFERENCE/phanpy/src/components/account-block.jsx) can
  open profile previews through modal state or hash navigation.
- [Modals](../../REFERENCE/phanpy/src/components/modals.jsx) render account
  previews without destroying the underlying feed.
- [Deck CSS](../../REFERENCE/phanpy/src/app.css) hides the underlying Home surface
  without discarding it. A comment explicitly avoids `content-visibility:
  hidden` there because it resets `scrollTop`.

This is not a universal retained-history cache for every full profile or
secondary route. Preserving Home and a status background does not establish
that arbitrary sequences of full-page navigation retain every previous view.

### Angular adaptation

Keep a reading surface mounted in a persistent shell and render profile/thread
details in a separate routed surface. On smaller screens that surface can fill
the viewport; on larger screens it could be a panel. The visual presentation is
a product choice, not a requirement of the preservation technique.

- Give the feed and details explicit scroll-container ownership.
- Preserve canonical URLs, direct linking, and browser Back/Forward. A directly
  opened thread must work without a background feed or invented history entry.
- Keep background-route state separate from the currently visible detail route.
- Define nested navigation deliberately: feed → thread → profile → another
  thread must unwind predictably, with a bounded number of retained surfaces.
- Make covered content inert and inaccessible to keyboard/screen-reader
  interaction; hiding it visually is insufficient. Restore focus on return.
- Suspend background pagination, streaming changes that move content, and
  unnecessary timers/media while preserving the feed's data and scroll position.
- Verify hiding and sizing rules in real browsers; CSS changes can reset scroll
  position even when component state survives.

This avoids reconstructing the feed and can make short reading excursions very
reliable. It still retains DOM memory and can become complicated for deep nested
navigation. It is therefore a narrower alternative to the snapshot approach,
not an automatic replacement for the current general reading history.

## Choosing a fallback

| Observed problem | First response or fallback |
| --- | --- |
| One route returns to the top | Diagnose route registration, reset logic, outlet wiring, and scroll ownership first |
| Media shifts the reader after returning | Improve stable anchoring and layout readiness; changing frameworks or data architecture is unnecessary |
| Large retained feeds cause memory pressure | Consider bounded data snapshots, then measured-height virtualization if needed |
| Evicted views should preserve reading progress | Add snapshots beneath the existing retained-view mechanism |
| Feed-to-detail navigation repeatedly destroys useful state | Consider a persistent feed with routed detail surfaces |
| Reload must restore deep reading position | Specify durable data/window recovery separately; coordinates alone cannot deliver it |

Do not adopt Nuxt, replace Angular, or add a scroll library merely to obtain
functionality already present. The transferable ideas are view preservation,
data preservation, history-entry identity, stable anchors, and layout geometry.

## Acceptance checks for any future switch

Preserve existing tests and add coverage for the chosen fallback rather than
weakening current expectations. Validate at least:

- Ten pagination steps, thread/profile nesting, application Back, browser Back,
  Forward, and continued pagination without restarting or losing posts.
- Independent visits to the same URL, query/filter/tab changes, replaced history
  entries, canceled navigation, and direct-entry fallback.
- Exact visible-item offset and focus recovery, including delayed media layout,
  changed viewport width, and a deleted anchor item.
- No surprise prepending while restoring; user scrolling immediately overrides
  automated correction.
- Isolation and cleanup on logout/account/server changes.
- Memory bounds, eviction behavior, and correct destruction/suspension of
  subscriptions, timers, media, and pending requests.
- Real production feed/provider integration as well as controlled story tests.

Any implementation should follow the repository's then-current gate cadence.
This document is a contingency record only and does not authorize an
implementation, dependency change, commit, or push.
