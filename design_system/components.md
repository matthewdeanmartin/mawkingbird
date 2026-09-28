# Component contracts — Sprints 1 and 2

Status: Sprint 2 forms are in preview; app migration remains a separate checkpoint.

| Component          | Owns                                                                               | Consumer owns                                               | Preview             |
| ------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------- |
| `mb-checkbox`      | Native checkbox, label column, description/error IDs, focus, hint/status placement | Translated strings, checked/form value, saving and rollback | Forms/Checkbox      |
| `mb-settings-row`  | Group-heading column and stacking below 500px container width                      | Heading and child controls, page placement                  | Layout/Settings row |
| `button[mbButton]` | Pill geometry, solid/outline, regular/small, focus/disabled treatment              | Native type, action, disabled state, accessible name        | Actions/Button      |

Use `(checkedChange)` with `[checked]`, or Angular forms, not both on one checkbox.
The component supports `ControlValueAccessor`; form disable/reset/touch propagate
to the native input. `label` is required. Errors and hints describe the input;
status is a separate live region, not part of its name. Indeterminate is a native
visual state. Linked descriptions/rich content are not yet supported.

Buttons require an explicit `type` at usage sites. Navigation continues to use
native links; link styling will be reviewed in Sprint 3. There is no arbitrary
internal style API. Pages may control available width and external spacing.

The review stories use fixture strings, not new app translation keys or service
calls. Theme toolbar controls use the app's existing attributes without persisting
preferences. Solid buttons currently use text/surface tokens for high contrast;
this is a visible review decision, not an approved change to existing buttons.

## Field and native control

Import `MbField` and `MbControl`. Put exactly one native input/select/textarea
with `mbControl` inside `mb-field`. Keep the native `ngModel` or `formControl`,
type, autocomplete, min/max, rows, required and disabled semantics. The directive
owns ID, label association, hint/error descriptions and invalid presentation.
Do not replace those IDs/ARIA attributes at the call site. Pass an error string
when the page chooses to expose validation or a failed write.

```html
<mb-field
  [label]="'profile.name' | transloco"
  [hint]="'profile.nameHint' | transloco"
  [error]="nameError()"
>
  <input mbControl type="text" required [formControl]="displayName" />
</mb-field>
```

Example translation keys are illustrative. Reuse the actual page's keys during
migration. Required validation stays with Angular/native forms; the wrapper is
not a second value accessor. The `*` marker derives from the native directive's
required input. The page owns value validation, saving, rollback and outer width.
Use the dedicated checkbox/radio components for choice controls, not `mbControl`.

Field CSS is intentionally namespaced global CSS because Angular-scoped styles
cannot reach projected native controls. Every selector starts with `mb-field`;
it must not acquire generic `input`, `label` or `select` rules.

## Radio group

Import `MbRadioGroup`. Provide `label` and `options` with unique, stable string
values, visible labels, optional hints and disabled flags. Use Angular forms,
or `[value]`/`(valueChange)`, not both. Reset selects no option. Group disable
uses native fieldset semantics; option disable remains available separately.
Touched state is set when focus leaves the group, not between options.

The component owns the legend, radio names/IDs, keyboard behavior through native
inputs, and hint/error associations. Pages provide translated strings and decide
when errors should become visible. Application rules and persistence remain
outside the design system. Rich linked descriptions remain an explicit gap;
do not insert interactive links into radio labels to work around it.

## Save feedback

Import `MbSaveFeedback`. Pass `state` (`idle`, `saving`, `saved`, `error`) and a
translated `message`. Ordinary progress uses a persistent polite status region;
errors use a separate alert. Idle clears both. Optional `errorId` lets a native
control reference an error. Avoid announcing the same error through both a field
and a second save-feedback instance.

There are no timers, requests, automatic rollback or hardcoded user-facing messages
in this component. The review demo's simulated request lives only in Storybook.
Keep one save policy per page when integrating these presentation primitives.

## Toolbar

Import `MbToolbar` and `MbToolbarButton`. Use a named `mb-toolbar` for a cluster
of related actions (normally three or more), containing native buttons with
`mbToolbarButton`. Pass `[pressed]` only for toggles; provide translated visible
labels or `aria-label` for icon-only actions. Decorative icons use `aria-hidden`.
Bind `[disabled]` for unavailable actions. Caller owns actions, state and saving.

```html
<mb-toolbar label="Feed controls">
  <button mbToolbarButton [pressed]="boosts()" (click)="toggleBoosts()">
    Boosts
  </button>
  <button mbToolbarButton [pressed]="replies()" (click)="toggleReplies()">
    Replies
  </button>
  <button mbToolbarButton (click)="refresh()">Refresh</button>
</mb-toolbar>
```

This is a button-only toolbar. Do not insert links, selects or text inputs into
its roving focus sequence. Tab enters once; horizontal arrows wrap and skip
disabled buttons, Home/End reach the ends, and Space/Enter retain native activation.
RTL reverses horizontal arrows. Wrapped rows retain logical DOM order. With all
buttons disabled the toolbar has no Tab stop. Keep standalone `mbButton` actions
outside; `mb/no-pill-in-toolbar` enforces that distinction. Do not override button
padding, radius or state colors at call sites. Stories: **Actions / Toolbar**.

## Navigation and content tabs

Import `MbNavigation` and `MbNavLink` for `nav[mbNavigation]` and `a[mbNavLink]`.
Supply the navigation `label`, native `href` or `routerLink`, and `[current]` on
the active destination. `presentation="tabs"` changes appearance, retaining native
link semantics and ordinary Tab navigation. The default presentation is rows.

Import `MbTabs` and `MbTab` for actual local content panels. Provide a translated
group `label` and direct `ng-template mbTab` children with unique stable `value`
and translated `label`. Bind `selected`/`selectedChange` for controlled selection.
Arrow/Home/End move focus; Space/Enter activate. Disabled tabs are skipped. Missing
or disabled selection falls back to the first enabled tab without emitting a
user change. Panels remain mounted while hidden, preserving local form state;
callers own loading and expensive data work. Do not use panels to replace routes.
Stories: **Navigation / Links and tabs**.

## Page header and section

Import `MbPageHeader` and `MbSection`. Header accepts `title`, optional
`description`, and `level` (1 or 2), with projected actions. Choose the heading
level to fit the page. Section supplies an h2 and a labelled section with projected
content. Pages own outer width and placement. Stories: **Layout / Page structure**.
