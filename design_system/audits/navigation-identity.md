# Navigation and identity adoption

Scope: left/right rails, profile stack, account hover/inline preview cards,
follow controls, ordinary/search-server discovery and server picker. This pass
consolidates the existing presentation, not provider business logic. The owner
of future changes is their contributor and maintainer reviewer; no review or
deployment approval is implied by automated checks.

| Consumer                                               | Finding and replacement                                                                                                                             | Preserved contract                                                                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell/left-rail/left-rail.html`                       | Duplicated card/suggestion styling → RailCard, IdentityRow and Button.                                                                              | Timeline ranking, real profile links, hover anchoring, follow orchestration and trends.                                                                                    |
| `shell/right-rail/right-rail.html`                     | Repeated cards, custom switch/actions and two overlays → RailCard, Switch, rail Navigation, Button/PostAction, Dialog, Field/Control, SaveFeedback. | Provider gates, endorsement labels/links/dismissal, donation and announcement behavior, absolute share URL, explicit list-update approval and busy dismissal lock.         |
| `shell/left-rail/profile-stack/profile-stack.html`     | Overlapping identity deck and card → ProfileStack/RailCard; native account action → Button.                                                         | Peek selection, persistent scoped key, stretched profile link, independent bio/stat links, real account switch and provider data.                                          |
| `account-hover-card/account-hover-card.ts`             | Inline/hover card body → AccountCard; links/follow → Button.                                                                                        | Delayed hover and phone suppression, inline preview, lazy relationship loading, verification, inbound relationship badge, sanitized bio and provider-specific actions.     |
| `account-hover-card/account-preview.ts`                | Preview toggle → Button, explicit native-element focus query.                                                                                       | Timers, touch click, pinned preview, Escape dismissal/focus return.                                                                                                        |
| `follow-button/follow-button.ts`                       | Legacy classes/local destructive hover ink → canonical Button variants.                                                                             | Follow/Following/Requested, anonymous/self/unknown hiding, foreign-account resolution on click, disabled busy state, visible failure, success-only changed output.         |
| `server-picker/server-picker.html`                     | Local popup styling → ServerPickerSurface; degraded confirmation → PostAction.                                                                      | Native input, debounced probes, stale-response protection and explicit media-degraded approval. Adds native Arrow/Enter/Escape selection and per-instance list/option IDs. |
| `server-discovery/server-discovery.html`               | Candidate/spinner/buttons/consent → DiscoveryCandidate, Spinner, Button/PostAction, Checkbox.                                                       | Current-server exclusion, cancellation, available/degraded/exhausted states and approval output.                                                                           |
| `search-server-discovery/search-server-discovery.html` | Same repeated presentation → shared candidate/spinner/actions.                                                                                      | Search canaries, rejected-host history, retry/forget, cancellation and explicit approval output.                                                                           |

Paths are relative to `ui/src/app`. Projected slot contracts are documented in
`design_system/components.md`. Native elements and domain events remain with
the app. Switch loading/disabled styling now reflects the actual disabled input.
Warning and shadow literals move into semantic tokens; degraded-media warning
ink has separate light/dark values. No new palette literals live in DS CSS.

## Evidence and guardrails

- **Adoption / Navigation and identity**: Mastodon, anonymous and Bluesky stories
  render real app consumers. Relationships/actions are in-memory; the profile
  selection preference stays confined to the preview origin. No credential
  store or real account-switch action is used by the fixture.
- **Adoption / Server selection**: working, degraded and unreachable stories.
  API probes, including manually entered hosts, are simulated while the real
  discovery/probe UI runs. No live server search or account mutation is needed.
- Browser coverage exercises provider gates, small-count statistics, identity
  selection, inline preview/focus return, requested follow, failure/retry, switch,
  guarded update dialog, read-only sharing/failure feedback, native feed links,
  hover/phone behavior and overflow at 320/412/1280px.
- Picker/discovery coverage includes keyboard and pointer selection, cancellation,
  usable search results, explicit degraded approval, exhausted retry and rejected
  host reset. Existing unit suites still test probe sequencing and domain behavior.
- Shared projection/native-checkbox contracts and FollowButton state/output
  contracts have additional unit tests. Existing discovery assertions now locate
  the same outline action using its DS attribute instead of the removed legacy
  class; no assertions or test inventory were dropped.
- Ownership checks constrain global projected styles to component namespaces
  and reject page-local appearance copies. Positive/negative rule fixtures remain
  distinct from integration assertions.

The source-adoption walker now includes Angular's `SwitchBlockCaseGroup` nodes.
Regression fixtures cover switch groups, if/for/empty and deferred alternatives
exactly once. The new report is 797 placements in 88 app templates, 37/40 widget
types. The candidate ledger is 216 files from 1,084 scanned sources. These are
source accounting numbers, not full-app coverage percentages or deployment state.

## Boundaries

Rail placement, provider-specific content, trend/announcement/endorsement copy,
hover timing and persistent state are not centralized into a generic rail widget.
The embedded PlusPromotion remains its own specialized consumer. Login's separate
OAuth/server-combo implementation is not silently replaced. No publishing,
OAuth redirects, storage keys, public origins or deployment configuration change.

Screenshots under ignored `design_system/test-results/navigation-identity*`
were inspected at narrow and wide sizes. These are component-level fixtures,
not screenshots of production/canary or a physical Pixel. There is no claim of
pixel-identical dialogs: adopting the existing Dialog adds its established focus,
scroll and dismissal behavior. The existing rail/deck/card shapes are retained.

Logs are under `ui/.test-results/identity-*.log`. Changes remain local; nothing
is committed, pushed or deployed by this task.

## Startup boundary

Application imports use individual identity modules rather than the combined
catalogue export. The initial all-in-one extraction unnecessarily made the rail
and profile-deck styles eager; splitting the modules removes that cost. A lint
check prevents reintroducing the barrel at application call sites. Dialogs retain
the original conditional mounting; no deferred-dialog runtime is introduced.

## Final validation

- Focused identity/rail/follow/picker/discovery specs: **83 passed**.
- Final `cd ui && make test`: **7,702 passed**, zero failed/pending/missing tests.
- All design verification stages pass. The final catalogue build's full browser
  suite passes **381 tests** (four workers); not only the nine new scenarios.
- Application lint, i18n checks, formatting/types, 41 CSS/ownership/inventory-rule
  tests and candidate reconciliation pass. Existing translation warnings remain.
- Production build passes at **903.10 kB initial output**, including CSS. This is
  3.10 kB above the existing 900 kB warning threshold but below the unchanged
  **1 MB error ceiling**. The first all-in-one extraction was 912.75 kB; leaf
  imports remove avoidable eager rail styling without changing runtime mounting.
  Existing shell/status-card CSS and CommonJS warnings remain. No budgets changed.
- Narrow light server selection, dark RTL rails, narrow light rails and wide
  hover-card renders were inspected. No horizontal overflow was found in the
  covered 320/412/1280px cases.

Final results: `identity-full-tests.log`, `identity-final-browser.log`,
`identity-split-production.log`, `identity-lint.log`, `identity-i18n.log` under
`ui/.test-results/`. No commit, push or deployment was performed.
