# Component contracts

Approved widgets are being adopted in production batches. See [sprint status](SPRINTS.md) and the per-batch audits for actual consumers; catalogue availability alone does not mean app adoption.

| Component                         | Owns                                                                               | Consumer owns                                               | Preview             |
| --------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------- |
| `mb-checkbox`                     | Native checkbox, label column, description/error IDs, focus, hint/status placement | Translated strings, checked/form value, saving and rollback | Forms/Checkbox      |
| `mb-settings-row`                 | Group-heading column and stacking below 500px container width                      | Heading and child controls, page placement                  | Layout/Settings row |
| `button[mbButton]`, `a[mbButton]` | Pill geometry, solid/outline, regular/small, focus/disabled treatment              | Native type, action, disabled state, accessible name        | Actions/Button      |

Use `(checkedChange)` with `[checked]`, or Angular forms, not both on one checkbox.
The component supports `ControlValueAccessor`; form disable/reset/touch propagate
to the native input. `label` is required. Errors and hints describe the input;
status is a separate live region, not part of its name. Indeterminate is a native
visual state. Linked descriptions/rich content are not yet supported.

For confirmed-membership controls without Angular forms, a caller may restore
its authoritative value through `writeValue` during `checkedChange`, then update
`checked` after a successful request. Writes restore the native input even when
rejected synchronously; they do not emit a second change. Keep pending guards and
errors with the consumer, as in ListDialog. Do not combine this pattern with a
separate form value owner.

Buttons require an explicit `type` at usage sites. Navigation uses native links;
`a[mbButton]` shares the same solid/outline action appearance with href/routerLink,
without adding a button role or disabled behavior. Use a real button for disabled
commands. Ordinary prose links use MbContentLink. There is no arbitrary internal
style API. Pages may control available width and external spacing.

Buttons use the selected accent through contrast-safe `--ds-action-*` tokens in
both themes. `tone="danger"` identifies a destructive action. Solid, outline,
hover, selected, disabled and link states share one stylesheet, imported by the
app's global styles. The legacy `.btn`, `.btn-outline`, `.btn-sm`/`.btn-small`
classes are compatibility aliases for that same implementation, including file
input labels; new actions use MbButton. Do not add page-specific button colors,
padding, typography or radii. Pages own width, placement and external spacing.

Use RadioGroup for mutually exclusive form choices, Toolbar for button-only
roving-focus groups, and PostAction for compact mixed actions. Keep their native
interaction semantics; making every control a pill is not the goal. Selected
compact actions use the same readable accent text token. See **Actions / Button /
Consistency** for shared/legacy states, all accents, narrow layouts and keyboard
interaction. The review stories use fixture strings and never persist preferences.

## Field and native control

Compact editors can set `hideLabel` on `mb-field` to keep the label available
to assistive technology without repeating a visible caption on every row.
Keep visible labels in guided forms and dialogs; the default is unchanged.

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

For stacked, dense app controls use `density="compact"`: 28px minimum desktop
buttons with 3px vertical / 4px horizontal padding, and a 35px single-line row.
Use `embedded` when the parent row already supplies padding and a separator.
Embedded toolbars add neither, preventing nested spacing from inflating the stack.
The parent owns row layout; do not override shared button internals. Regular
standalone toolbars retain their existing spacing. Both densities retain 44px
minimum targets for coarse pointers and wrap when their labels need room.
See **Adoption / Sprint 3 toolbars / Stacked compact**, which composes actions,
presentation, filters and reader controls without gaps between the rows.

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

## Dialog

For a dialog opened after an asynchronous operation disables its trigger, pass
`[returnFocusTo]="triggerElement"` (an HTMLElement). Otherwise Dialog captures
the focused element on opening. Restoration still requires a connected target.

Import `MbDialog`, and mount it under `@if (open())`. Supply translated `title`
and `closeLabel`, optional `description`, and handle `dismissed` to remove it.
Dismissal reasons are `button`, `escape` or `backdrop`; none means confirmation.
Project ordinary content and mark each footer action with `mbDialogActions`.
Use native `type="button"` and caller-owned click handlers. Do not submit a
`method="dialog"` form or manipulate the internal native dialog directly.

`dialogRole="alertdialog"` preserves urgent confirmation semantics. `[showClose]="false"` is for flows whose footer already
provides all dismissal actions, such as the single-OK alert. Always retain an
accessible dismissal action. Prompt Enter handlers must prevent the default before
closing, so restoring focus cannot activate the opener with the same key.

`closeOnBackdrop` defaults to false. `busy` blocks the dialog's dismiss controls;
the caller also owns disabling projected actions. Native modal behavior supplies
background inertness and stacking. Focus enters at the Close button by default
(or a projected autofocus target); Tab wraps among visible, enabled controls.
Nested dialogs retain the scroll lock until the last one closes and return focus
to a connected opener. The fixed-size surface scrolls internally on small screens.
There are no entrance/exit animations. The component owns width, internal padding,
border, focus handling and scrolling. Do not apply the legacy `appFocusTrap` too.

Long dialog titles and the Close action wrap onto separate header rows when
necessary. The Close button does not shrink into a vertical stack of letters;
its appearance still belongs to MbButton, not the caller. Keep a safe dismissal
action above long consent disclosures rather than initially focusing acceptance.

## Popover and action menu

`MbPopover` takes a translated `label` and projects rich content. It is a click-open,
nonmodal dialog by default: normal Tab order, outside-click/Escape dismissal,
and a viewport-clamped surface. Opening focuses its first control or the panel.
Resize/page scroll closes the popup. Callers can use `openedChange` to observe
state; keep network/loading logic outside the surface. No hover behavior is implied.

`MbActionMenu` takes `label` and `actions` with unique IDs, translated labels,
optional `disabled` and `danger` flags. Handle `chosen` with the stable action ID.
The popup closes and returns focus before emitting so a follow-up dialog has a
valid opener. Arrow keys wrap through enabled commands, Home/End reach the ends,
and typeahead finds labels. Enter/Space activate; Escape returns to the trigger;
Tab closes and continues outside the menu. Use a real confirmation for destructive
actions. Links, submenu trees, checkbox/radio items and rich forms are not action
menu items; use the appropriate native controls or a separately reviewed contract.

## Disclosure and notice

`MbDisclosure` wraps native details/summary with a translated `label`, projected
content and optional two-way `expanded` state. It retains native Enter/Space and
Tab behavior. Do not put interactive controls inside the summary label.

`MbNotice` accepts optional `title`, `tone` (`info` or `error`), and explicitly
chosen `announcement` (`off`, `status`, `alert`). Static information defaults to
off; a new asynchronous error may use alert. Project translated content/actions.
Do not announce the same error through multiple notices/fields. This is not a
toast scheduler and does not decide when to dismiss or retry a request.

All five families are previewed under **Start here / Sprint 4 review**, including
long-dialog and opt-in backdrop examples. Dialog and notice have real app consumers;
menu, popover and disclosure remain catalogue-only at the Sprint 13 checkpoint.
See [current integration counts](PROGRESS.md).

## Metadata and badges

`MbMetadata` is a wrapping, baseline-aligned layout for projected text, native
links and `<time datetime>` elements. Callers own URLs, router links, hover-card
behavior, localization and accurate dates. It does not truncate content or
sanitize supplied HTML. Keep projected children shrinkable; complex account
wrappers need their own measured layout before adoption. Isolate handles with
`dir="auto"` when mixing writing directions.

`a[mbContentLink]` keeps native link behavior and supplies an underlined text-token
style with visible keyboard focus. Use it for links in metadata/content-state
surfaces; preserve actual destinations and router-link bindings.

`MbBadge` is informational plain text with `tone="neutral"` (default) or
`"attention"`. No interactive role, automatic announcement, or verification
meaning is supplied. Use explicit text rather than color alone. Buttons, filters
and verification entitlements retain their own contracts.

## Content states and post actions

`MbContentState` requires `title`; optional `description` and
`kind="empty|loading|error"` provide presentation only. `announcement` defaults to
`off`; opt into `status` or `alert` for an actual transition requiring announcement.
Projected native buttons/links sit outside the live message. Callers own retry,
loading state, retained posts, translations and focus. Do not remove existing
content during pagination, or attach `aria-busy` to a region containing its own
live loading announcement. No spinner, timer, service or animation is included.

Use existing `MbToolbar density="compact" embedded` for related button-only post
actions. Icon-only buttons require a localized accessible name; decorative icons
must be hidden from accessibility APIs. Use `pressed` for toggles and native
`disabled` for unavailable commands. Native links and read-only counts must not
be converted to buttons to fit that toolbar. Sprint 5 previews this composition;
real mixed-action rows await a reviewed contract.

## Post actions

`MbPostActions` is a labeled, wrapping group for mixed links and buttons. Keep
frequent commands visible; add rows as needed instead of hiding commands, clipping
counts or abbreviating them to make a row fit. Use `button[mbPostAction]` with
`type="button"` for commands and `a[mbPostAction]` with a native href/routerLink
for navigation. Use `pressed` only on toggle buttons; links are never toggles.
The group preserves native Tab order and does not capture arrow keys. Use the
existing `MbToolbar` when a button-only roving-focus group is appropriate.

`span[mbActionCount]` keeps a formatted count on one line with tabular numerals.
Its containing action moves intact to another row. Counts with their own account
list behavior remain separate buttons from Like/Boost toggles. Localize labels
and number formatting at the caller; use accessible names for icon-only actions.

The shared toolbar button stylesheet provides visual states; post actions add
compact wrapping and retain 44px touch targets. No per-post sizing overrides are
needed. The preview includes 21 controls and millions-scale counts; adding more
commands requires extending the stress story, not a one-off fixed width. Menus
are appropriate for moderation/removal, not the default escape for normal tools.

### Post-action state and production adoption

StatusCard and SaveToLibrary consume the post-action widgets. `pressed` controls
ARIA toggle semantics. `active` supplies the same visual selection for a menu
trigger reflecting an existing action, without inventing toggle semantics.
Neither input owns the action handler, request, permission or provider state.
Retain native button/link behavior, count-list actions and confirmation flows.
Consumer CSS may set outer spacing; it must not replace shared target geometry.
See [Sprint 11](REVIEW-11.md) for actual-provider fixtures and residual menus.

### Settings composition in app source

SettingsPrivacy adopts SettingsRow for its grouped checkboxes and Field/Control
with direct SaveFeedback for native selects. SettingsContent adopts RadioGroup
and Checkbox for trust choices. Pass translated labels/hints at the caller and
keep persistence in the page/service; disabling trust must not erase stored choices.
See [Sprint 15](REVIEW-15.md) for real-component examples and remaining scope.

### Popovers and disclosures in app source

RSS FeedActions exposes a direct native View feed link and a conditional
Unsubscribe button through PostActions/PostAction. Confirmation remains separate.
Do not add an intermediate popup when direct actions fit. Popover remains a
catalogue option for surfaces that actually need mixed-content disclosure.
PollResults uses Disclosure for optional statistics; its caller owns result
visibility and statistical calculations.
Privacy's post-default group bounds the composition to 24rem; SettingsRow's
existing container query then stacks its heading. Do not override widget internals
or stretch a short select merely because the surrounding page is wide.

### Adopted local panels and identity content

ClientListPage uses Tabs/Tab for local Posts/Members panels. Keep its inner
conditional content: Tabs mounts both panel templates, while this consumer must
preserve post unmounting on selection changes. Do not replace native route links
with local tabs. ContentLink retains native routes; Metadata supplies wrapping
identity/version content. History uses native time elements for timestamps.
The scoped local-tab lint rule protects ClientListPage from copied tab geometry.
