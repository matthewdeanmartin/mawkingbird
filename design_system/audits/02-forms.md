# Sprint 2 opening/design audit

Scope: maintained `ui/` and Sprint 2 preview components. App migration has not
started. This audit identifies reusable solutions and remaining debt; it does
not grant user approval or silently create exemptions.

## Observed duplication and disposition

| Location                                                  | Source evidence                                                  | Action                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ui/src/app/pages/settings/content/settings-content.html` | Repeated radios followed by separate helper paragraphs           | Migrate to `mb-radio-group` after preview approval; preserve option values and translation keys.                 |
| `ui/src/app/pages/settings/content/settings-content.css`  | `.checkline-note` uses a 26px indent                             | Remove with the migrated control; radio component owns the text column.                                          |
| `ui/src/styles.css`                                       | `.scontrol` enumerates native field types and styles all of them | Approved fields will use `mb-field`/`mbControl`; retire global compatibility rules only after consumers migrate. |
| `ui/src/app/pages/settings/privacy/settings-privacy.html` | Repeated nearby saved/error presentation                         | Adopt `mb-save-feedback` with the approved control migration, preserving existing save/revert behavior.          |
| New shared widget CSS                                     | Literal palette values had lived in preview.css                  | Moved the error role to `design_system/tokens.css`; library lint now rejects new literals.                       |

These first four integration targets are all still pending; no adoption percentage
is claimed from a sample of screens. Sprint 1's app-integration backlog remains
visible rather than being marked complete by the existence of its catalogue.

## Color inventory

`cd ui && npm run design:audit-colors` produced
[501 diagnostic findings across 169 stylesheets](02-legacy-colors.json).
Each entry records the file, line, column, rule, source line and diagnostic.
The source glob is checked to ensure component files were actually scanned.

This inventory includes intentional palette definitions and possibly legitimate
product-specific colors. It is a triage list, not 501 proven defects or approved
exceptions. It scans `.css` files, not inline Angular styles or template style
bindings. Those remain a future enforcement gap. Re-run after migrations and
classify each affected entry as token extraction, approved specialized color,
or replacement with an existing semantic role.

## Enforced now

The shared-library, preview and token files run through pinned Stylelint. Literal
hex/named/function colors, including fallbacks and gradients, are rejected outside
the canonical token file. Token mixes, transparent and currentColor are supported.
`!important` and `::ng-deep` are rejected. Eight rule fixtures cover allowed and
forbidden examples. Application CSS is not automatically put on a blanket allowlist.

## Rendered evidence

The browser suite loads every story, tests native form behavior, saves and rolls
back the demo, checks radio arrow navigation, measures long-label alignment and
overflow, and samples computed text/background contrast across 12 theme/accent
combinations. Screenshots for desktop/light, narrow/dim and narrow/RTL were
visually inspected. Passing contrast samples do not replace manual a11y review
or establish that all possible application backgrounds are safe.

The [measured report](02-contrast.md) records 27 pairs per theme/accent combination.
