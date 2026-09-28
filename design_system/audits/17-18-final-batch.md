# Sprints 17–18 — combined adoption and reconciliation

The user requested combining the final two sprints and challenged Feed popup
indirection. Opening audit reviewed RSS actions/callers, client-list templates,
load handlers and duplicated tab CSS, shared tab lifecycle, history markup,
shared identity/heading contracts, and route-based alternatives. Client lists
are local panels; route navigation and persistent writing panes were not selected.

| Location                        | Finding and adopted result                                                                                                                                                                  | Classification                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| RSS FeedActions                 | View feed behind Feed was an extra step, especially when alone. Replace the popup with direct native View feed and conditional compact Unsubscribe. Keep confirmation and exact URL/output. | User-requested correction, three placements replaced |
| ClientListPage                  | Copied tab strip had no shared focus/panel contract. Use Tabs and two Tab templates; retain conditional inner content mounting and no activation reads.                                     | Three placements adopted                             |
| ClientListPage heading/identity | Local heading CSS and member identity layout. Use PageHeader, two ContentLinks (member/back) and Metadata. Preserve native routes and full count interpolation.                             | Four placements adopted                              |
| HistoryDialog                   | Version/time metadata used local font sizing and textual timestamp. Use Metadata plus native time; remove unused small-text CSS.                                                            | One placement adopted                                |
| Enforcement                     | Prevent hand-built tablist/tab-button geometry returning to the migrated local page. Rule remains narrowly enabled there; native route links are allowed.                                   | New scoped lint, five positive/negative cases        |

11 selected placements, eight net added: source usage is 24/27 types, 208 direct
placements in 30 templates. Metadata, ContentLink, Tabs and Tab gain app use;
Popover loses its sole app use after correcting the unnecessary interaction.
That decrease is intentional. Shared widget availability is not a target to force
100% use regardless of semantics. No shared variant or dependency was introduced.

## Behavior and evidence

44 targeted tests pass. Four new client-list tests cover local-panel switching
without refetch, original post component unmount/remount behavior, loading across
selection changes, empty and missing lists, and native identity/back destinations.
Existing RSS confirmation/exact-feed/saved-article tests and history retry tests
remain. Shared Tabs behavior tests remain unchanged. Browser checks cover real
keyboard focus/manual activation, native links, history timestamps and focus,
read states, direct Feed actions and confirmation. Real browser fixtures use
isolated providers; the post lifecycle unit test deliberately uses a counted stub.

The existing shared tab widget creates both panel templates. Caller conditions
retain the previous page's post/member lifecycle; hidden panels do not instantiate
StatusCards. Do not remove those conditions merely because the panel is hidden.
No source request, endpoint, storage key, translation key or provider policy changed.
The page's pre-existing read-failure/racing-route limitations are not repaired by
this layout adoption, and remain partial work.

## Reconciliation of Sprints 14–17

- Sprint 14: ListDialog controls remain adopted, including failed write rollback;
  initial read recovery and unsupported-versus-failed discovery remain partial.
- Sprint 15: Privacy and Trust controls remain adopted. User-reviewed correction
  bounds post defaults to 24rem and aligns Media. Initial-read/overlapping saves
  and Trust's account actions remain partial.
- Sprint 16: Poll disclosure remains adopted. Feed popup removed following user
  feedback; direct compact actions replace it. Rich StatusCard mixed menus and
  photo-viewer keyboard coupling remain backlog.
- Sprint 17: Client-list heading, panels and identities adopted; initial read
  feedback remains partial. History keeps its adopted shell/read states and gains
  native metadata. Specialized snapshot/chart content remains purpose-specific.

Ledger: 209 candidates, 10 adopted scopes, 20 partial, 15 shared, 9 lexical-only,
155 backlog. Source scanner remains 1053 files. The 175 backlog/partial files
are not equal-sized tasks or an app completion percentage. Next contributors own
bounded review of the surface they change, with a maintainer reviewer. Sensible
future batches include mixed post menus, list/settings read recovery, and remaining
navigation/content consumers; size those from opening audits, not guessed sprints.

The combined batch closes the current plan with **zero planned remaining**.
ActionMenu, Section and Popover remain available only in the catalogue. No blanket
exception, full-app migration claim, commit or deployment is implied.

Full app gate: 7,626 tests with zero missing inventory entries. Targeted cases: 44. Production build/startup boundary passes at 883.99 kB initial size with the
unchanged 1 MB budget. Lint and translation checks pass. Types, formatting,
ledger reconciliation, catalogue build and all 31 rule checks pass.

The first full browser run exposed a new test locator race after Cancel: the
confirmation action briefly overlapped the underlying Unsubscribe action. Scope
the locator to the compact action group and wait for dialog dismissal before
asserting focus. No runtime workaround or weakened assertion is needed.
The final complete browser rerun passes all 261 checks. All required gates are green.

Inspected narrow dark member rows, RTL edit-history timestamps and corrected
Feed controls. Geometry checks additionally cover wide light and 320px RTL.
Screenshots are under `test-results/adoption-17-18.browser.mjs-*/` and the updated
Sprint 16 directory. No live-provider or manual screen-reader certification is
claimed; preview routing retains native hrefs but does not implement destinations.
