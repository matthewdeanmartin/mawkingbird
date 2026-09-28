# Sprint 10 adoption audit

Paths below are relative to `ui/src/app/`.

| Consumer                                     | Former pattern                                                    | Replacement                                    | Count | Owner     |
| -------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- | ----- | --------- |
| `pages/settings/settings-shell.html`         | Native nav, per-link CSS, white-on-accent active styling          | MbNavigation and repeated MbNavLink template   | 2     | Sprint 10 |
| `pages/public-timeline/public-timeline.html` | Loading/empty paragraphs; silent failed reads                     | Three MbContentState branches and Retry button | 4     | Sprint 10 |
| `pages/list-timeline/list-timeline.html`     | Page-head div and conversion button                               | MbPageHeader and MbButton                      | 2     | Sprint 10 |
| Same list template                           | Conversion summary, warnings, member-removal error                | Three MbNotice consumers                       | 3     | Sprint 10 |
| Same list template                           | Timeline and member loading/empty paragraphs; silent page failure | Five MbContentState branches                   | 5     | Sprint 10 |
| Same list template                           | Pagination action and new failed-page retry                       | Two MbButton consumers                         | 2     | Sprint 10 |
| Total                                        | Template consumers, not rendered loop iterations                  |                                                | 18    |           |

Priority: misleading empty states and lost active-route indication are functional
issues; duplicated presentation rules and preview spacing are visual drift.

## Behavior and cleanup

- Public refresh retains the exact post elements while pending, after failure and
  after a successful retry with the same IDs. Changing All/Local clears the prior
  scope before requesting the new one. Existing streaming subscription behavior
  and request cancellation remain.
- List failure retains the current page. Retry reuses the initial/append mode and
  cursor; pending retries are guarded. Appended results retain existing duplicate
  filtering and exhaustion policy. Error/retry placement is after retained posts.
- Navigation stays native anchors with routerLink. Both copies of cross-listed
  Privacy reflect the current destination. Query/fragment values no longer erase
  the active marker, while paths retain each item's exact/subset policy.
- Removed obsolete sidebar link rules, header action geometry and notice styles.
  Pagination has only an outer layout wrapper; the button owns its geometry.
- The legacy-parent preview now reuses `ds-dialog-tools` spacing. Its old focus
  trap intentionally remains to exercise migration parity.

## Evidence and limits

The catalogue mounts actual PublicTimeline and ListTimeline, including real post
cards, and actual SettingsShell with fixture child destinations. HTTP responses
are held/released locally and Streaming is replaced. A catalogue-only preference
factory retains ClientPrefs' state API but suppresses its apply/persist methods;
theme and direction assertions guard that boundary. `testing/storybook-http.ts`
resolves Angular HTTP exports from the UI workspace without changing Storybook
pins or production imports.

Angular checks cover retained DOM, local-scope failure, exact pagination cursor,
duplicate retry, initial-error versus empty state, active nested/cross-listed
routes and all existing cases. Browser checks cover the real flows, history,
query strings, retained nodes/scroll position and light/dim narrow/wide RTL.
Rendered screenshots are in ignored `design_system/test-results/`; final results
are recorded in [review notes](../REVIEW-10.md).

Remaining findings are migration debt, not approved directory exemptions:

- Public/list mode tabs and member action rows: preserve existing mount and
  analytics behavior pending a separately exercised tab/toolbar adoption.
- List member-fetch and metadata failures: unchanged; existing member-removal
  errors are adopted, but not every list request has new recovery behavior.
- Settings profile card and routed page content: not rewritten by adopting its
  navigation. The review child is a fixture, not a migrated settings page.
- Search (`pages/search/search.html`, result sections): separate accounts/posts
  branches include slow-response explanations, timeouts, unavailable reasons and
  directory links. Review that composition separately instead of flattening it
  into one generic empty/error message.
- Sprint 9's Effective Audience wide dialog and specialized danger/consequence
  variants remain open. This sprint resolves the reported preview spacing.

The source inventory now scans 1,053 files and still identifies 205 candidate
files. The additional file is the catalogue HTTP import helper. These lexical
counts are not adoption percentages; the 18 consumers above are the semantic
batch inventory. No dependencies, deployment settings or storage keys changed.
