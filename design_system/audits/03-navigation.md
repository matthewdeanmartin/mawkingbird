# Sprint 3 opening audit

The user explicitly requested compact toolbars instead of repeated pill buttons.
The existing home feed and reader already provide the visual reference:

| Surface                                          | Existing pattern                                                              | Proposed replacement after preview approval                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ui/src/app/pages/home/home.html` and `home.css` | Feed filters override pill-button styling with compact corners and tight gaps | `MbToolbar`/`MbToolbarButton` for the button cluster; retain selection controls separately |
| `ui/src/app/reader-toolbar/reader-toolbar.css`   | Repeated compact action styling                                               | Shared toolbar buttons, preserving reader-specific actions and tokens                      |
| Settings navigation                              | Destination links and active-page treatment                                   | `nav[mbNavigation]` with `a[mbNavLink]`, retaining router links and routes                 |
| Search category navigation                       | Tab-shaped destination links                                                  | Navigation presentation `tabs`; keep native links                                          |
| Feed content views                               | Related panels                                                                | `MbTabs` only where switching panels does not represent route navigation                   |

The initial toolbar contract is button-only. Existing command bars mix selects,
language pickers and buttons; do not put those controls inside this roving-focus
toolbar without a separately tested mixed-control contract. Page-specific sticky
positioning and available width remain with the page.

No application consumer is migrated in this preview. Before integration, enumerate
exact consumers and preserve translation keys, disabled conditions, focus behavior,
route semantics, reader overrides and service calls. Delete duplicate internal
button/tab/header CSS only when its consumers have moved.

Enforcement added now: Angular AST rule `mb/no-pill-in-toolbar`. It detects known
standalone-button misuse in toolbar markup, including nested control flow. CSS
token/escape rules still cover the shared components. Comprehensive restyle
ownership rules and mixed-control support remain explicit integration work.
