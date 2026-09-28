# Sprint 10 review: navigation and timeline states

[Open Sprint 10](http://127.0.0.1:6006/?path=/story/start-here-sprint-10-review--app-pages).

This batch adopts 18 template consumers across the real Settings shell, Public
Timeline and List Timeline: navigation and repeated link templates, one page
header, eight content states, three notices and four ordinary actions. This is a
bounded adoption count, not a claim that every control on those pages migrated.

## Try it

- **Public timeline:** the local response starts held. Choose Return empty, or
  Fail request then Retry. A failed request no longer looks like an empty feed.
- Choose Return posts, then the feed's More/refresh action. Existing posts stay
  mounted while loading and after failure. Retry keeps the feed visible. Switching
  All to Local clears the previous scope so an error cannot display All's posts
  as Local results.
- **List timeline:** Return posts supplies a full 40-post page. Scroll to Load
  more, fail its request, and retry. The error/retry sits below existing posts,
  the same cursor is reused, and the next two posts append without duplication.
  The long real list title wraps in the shared page header.
- **Settings navigation:** follow native links, including both Privacy entries;
  use Back/Forward. The destination remains marked even with query parameters.
  Nested destinations such as Filters still highlight their parent. The shell
  is real; routed destination text in this fixture is explicitly a placeholder.
- Check narrow layouts, RTL and the catalogue's light/dim theme controls.

Responses are local HTTP fixtures; live streaming is disabled. Preference state
uses the real API/defaults with DOM application and persistence suppressed so the
catalogue owns theme/accent and preview edits stay in memory. These are navigation
and loading fixtures; unrelated post actions are not a simulated full backend.

## What changed in the app

The Settings sidebar uses approved native-link navigation, including its active
marker and focus treatment. Its old per-link geometry, white-on-accent selection
rules and decorative chevrons were removed. Route paths, feature visibility and
cross-listing remain. Active matching now ignores query/fragment values while
retaining each item's exact-versus-child path policy; navigation URLs themselves
are unchanged.

Public refreshes retain posts and expose a retry. List failures preserve the page
and cursor, with a retry that prevents duplicate pending requests. Existing list
conversion summaries, feed warnings and member-removal errors use shared notices.
Two source translation keys cover post-load failures and Retry; existing keys,
payloads, translations and locale fallbacks remain intact.

The previous **Legacy parent confirmation** example is an interoperability test
for old dialogs during migration, not a proposed new widget. Its child actions
now have the existing preview action-row spacing instead of touching.

## Boundaries

Mode tabs, member-management action rows and specialized settings profile cards
remain separate work. Search's multi-kind results, slow-search/timeout feedback,
unavailable explanations and directory links need their own composed fixture;
no blanket Search migration is claimed. Member-fetch and list-metadata failure
handling are also unchanged; the new retry contract here covers timeline pages.
See the [adoption audit](audits/10-navigation-and-states.md).

Validation passed: 32 targeted Angular tests, the complete 7,600-test app gate,
and all 191 catalogue browser checks. Lint and translation checks passed. The
production build passed at 883.54 kB initial size, below the unchanged 1 MB limit.
Narrow dark and RTL previews and the corrected legacy action spacing were visually
inspected.

Sprint 11 is next: real post tools, provider parity and enforcement reconciliation.
