# Mawkingbird design system

Status: Sprint 11 adopts real post action rows and the nested library button, with provider/state previews and candidate reconciliation. Remaining migrations are explicit backlog, not whole-app completion.

## Open the preview

[Sprint 11 real post tools](http://127.0.0.1:6006/?path=/story/start-here-sprint-11-review--provider-tools)
shows actual StatusCards, large counts, provider/ownership branches and held action responses.
See [review notes](REVIEW-11.md), the [adoption audit](audits/11-post-tools-and-enforcement.md)
and [candidate ledger](audits/11-reconciliation.json).
[Sprint 10 app pages](REVIEW-10.md) and [Sprint 9 dialogs](REVIEW-9.md) remain available.

Latest correction: [Stacked compact toolbars](http://127.0.0.1:6006/?path=/story/adoption-sprint-3-toolbars--stacked-compact)
shows four contiguous control rows and the aligned analytics checkbox.
See the [density/alignment audit](audits/03-compact-correction.md).

From Git Bash: `cd ui && npm ci && make design`. Open http://127.0.0.1:6006
and select **Adoption / Sprint 3 toolbars / App controls** for the real app components,
or **Start here / Sprint 3 review** for the approved widget collection. Use the theme, accent and direction
toolbar controls. `make design-build` produces a standalone catalogue in
`design_system/dist/`. `make design-test` runs the widget behavior specs.

Install the headless test browser once with `cd ui && npx playwright install chromium`.
Then `make design-verify` checks formatting/types and CSS contracts, rebuilds Storybook and runs
the browser smoke/interaction tests. The test server uses port 6008 and shuts
down automatically; it does not control your desktop browser. Screenshots and
failure traces go in ignored `design_system/test-results/`.

[Sprint 3 review notes](REVIEW-3.md) describe compact toolbars, navigation, tabs
and page structure. [Sprint 2](REVIEW-2.md) covers forms and save feedback. [Component contracts](components.md) show how to reuse them.
Stylelint 17.15.0 is pinned; `npm run design:lint` rejects literal colors and
styling escape hatches in shared-widget CSS. It runs in `check:static` and
`make check`. Application-wide color findings are an [audit inventory](audits/02-forms.md),
not approved exceptions or a new blocking rule across unmigrated screens.

Keep the Storybook TypeScript path alias extensionless: TypeScript resolves its
declarations while Webpack resolves JavaScript. Pointing it at `index.d.ts`
produces a build that succeeds but fails at runtime. The browser checks guard
against that regression by requiring every story to render real content.

Storybook packages are pinned to **10.6.0**, the latest stable npm release checked
on 2026-09-27. Angular runtime/build packages and added adapter peers are pinned
to the existing **21.2.23** patch. Use the committed UI lockfile with `npm ci`.
The established Angular adapter is used; Angular/Vite is still preview. No
Storybook initializer or legacy `addon-essentials` setup is required.

The active delivery plan is [six preview-first sprints](SPRINTS.md). Each sprint
has a user preview checkpoint before app integration and an [LLM drift audit](AUDIT.md).
See [component contracts](components.md). The original proposal below provides
architectural context; the six-sprint plan supersedes its delivery-stage schedule.

## The pitch

Make the existing Mawkingbird visual language reusable and enforceable. A developer
adding a setting should choose its behavior and wording, then use an established
control. They should not have to invent checkbox alignment, label wrapping, hint
indentation, focus treatment, or save-message placement.

Build four things together: shared Angular primitives, a small token vocabulary,
a live Storybook catalogue, and checks that reject unsupported implementations
with instructions for fixing them. A catalogue without enforcement will drift;
lint without good components will just make development unpleasant.

Preserve the current typography, density, pill buttons, column layout, light/dim
themes, accents, and reader preferences. Consolidate accidental differences.
Accessibility corrections can change colors or wrapping; show those changes
explicitly in review instead of treating today's screenshot as automatically correct.

## What the repository tells us

The starting inventory is [DUDE_WHERE_IS_MY_DESIGN_SYSTEM.md](../spec/DUDE_WHERE_IS_MY_DESIGN_SYSTEM.md).
Inspection confirms Angular 21, plain CSS, 162 component stylesheets, existing
Angular ESLint/template accessibility checks, and no Stylelint or Storybook setup.

There is already a useful foundation in [styles.css](../ui/src/styles.css): theme
tokens, `.btn`, `.srow`, `.scontrol`, `.checkline`, focus styling, and mobile rules.
Extract and formalize these patterns before introducing new ones.

Examples that the first release should retire:

| Current implementation                                                    | Problem to eliminate                                                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Global `.scontrol label.checkline`                                        | Alignment depends on an ancestor class; checkbox margin is separately prescribed.                                               |
| `pages/login/login.css`                                                   | A documented wrapping bug is addressed with a local `nowrap` rule. Long translations still need an intentional wrapping policy. |
| `pages/login-chooser/login-chooser.css` and `tag-actions/tag-actions.css` | Both recreate checkbox rows, with different gaps and centered alignment.                                                        |
| `pages/settings/connections/cors-proxy/connection-cors-proxy.css`         | Yet another checkbox layout and input offset.                                                                                   |
| `pages/settings/content/settings-content.css`                             | Helper text uses a hardcoded 26px left indent to imitate a control's label column.                                              |
| `pages/settings/privacy/settings-privacy.html`                            | Labels, hints, saving state, and errors are manually composed repeatedly.                                                       |

The [UI contribution rules](../ui/docs/contributing.md) also establish behavior:
7:1 contrast for all text against its actual background; one save pattern per
page; inline success; revert and explain failed saves; intentional cross-listing
of settings. These belong in the system's contracts, not just its visual examples.
The contrast policy is broader than the DUDE inventory's emphasis on `--muted`.

## Tool choices

| Area               | Recommendation                                                        | Reason                                                                  |
| ------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Components         | Small standalone Angular components and native-element directives     | Fit the current app and retain native semantics.                        |
| Styles             | Plain CSS and CSS custom properties                                   | Build on the existing themes without a framework migration.             |
| Catalogue          | Storybook for Angular                                                 | Interactive states, usage examples, and isolated production components. |
| Template contracts | Local ESLint rules using Angular's template AST                       | Extend the toolchain already running here.                              |
| CSS contracts      | Stylelint plus a few focused local rules                              | Enforce token usage and component ownership.                            |
| Rendered checks    | Playwright screenshots, geometry assertions, and accessibility checks | Catch failures source lint cannot see.                                  |

Borrow the excellent diagnostic approach from
[@shadcn/lint](https://github.com/shadcn-ui/lint): tell developers what violated
the contract, what component or variant to use, and where its example lives.
Its documented target is Tailwind v4 with React, Svelte, and Vue. This app has
neither Tailwind nor a documented supported framework, so adopting or porting it
would add work unrelated to our immediate problem. Do not introduce Tailwind to
obtain its lint rules.

Use the established [Storybook Angular adapter](https://storybook.js.org/docs/get-started/frameworks/angular)
as the initial choice, subject to a small compatibility spike against the committed
Angular/Node toolchain. It documents support for Angular 21. The
[Angular Vite adapter](https://storybook.js.org/docs/get-started/frameworks/angular-vite)
is currently preview; reconsider when stable rather than making it a prerequisite.
Storybook's builder does not require replacing the production app builder.

A separate Angular gallery application is the fallback if the spike exposes a
real compatibility or maintenance problem. It would consume the same components,
tokens, and examples, but we would have to build its navigation and controls.
No paid hosting or Chromatic subscription is required for this proposal.

## Repository home and boundaries

`design_system/` is the authoritative home for the system and its development
experience. Keep executable Angular primitives inside the existing Angular source
tree so normal compilation, dependency resolution, and audited spec discovery
continue to work. This is one implementation, imported by both app and catalogue.

Target layout (Sprint 1 implements the catalogue and first three widgets):

```text
design_system/
  README.md                 entry point and rollout
  foundations.md            typography, spacing, color, interaction contracts
  components.md             inventory, ownership, API and story links
  tokens.css                canonical tokens and theme overrides
  contracts.json            selectors, variants, styling ownership, rule guidance
  exceptions.json           specific legacy findings and intentional exceptions
  .storybook/               catalogue configuration and theme/locale decorators
  stories/                  primitive and composed-pattern stories
  rules/                    local ESLint/Stylelint rules and rule tests
  tests/                    browser scenarios and reviewed visual baselines
ui/src/app/design-system/
  checkbox/                 production component, CSS, template, audited specs
  radio-group/
  field/
  settings-row/
  button/
  save-feedback/
```

Use the existing `ui/package.json` and committed lockfile for development tools;
run installs with `npm ci` after intentionally updating that lockfile. Commands
run from `ui/` and explicitly point at `../design_system/`. Extend lint/format and
rule-test coverage to those files; current source-only globs will not find them.
Verify external story/config resolution in the spike. Do not create a second
independently versioned component package for one app.

`ui/src/styles.css` imports the canonical token file once. Move values rather
than maintaining copies. Keep existing token names and theme attributes stable;
add semantic tokens for missing roles. Keep app-specific global rules, including
styles for injected reader content, separate from the reusable foundation.

Storybook imports production components directly, with deterministic fixture
providers. It must not boot the real app, log in, access live services, or change
persisted preferences. Theme controls set the existing attributes on the preview
document. Storybook, fixtures, and screenshots stay outside production imports.

Contributor documentation under `docs/` and `ui/docs/` links here. Read the Docs
remains the documentation publishing system. Initially the catalogue runs locally
and builds as an artifact; it does not alter site publishing or public origins.

## First components: solve the checkbox problem completely

Ship a small initial family, not a speculative library of every possible widget:

1. **Checkbox and radio group:** own the control/label/hint geometry and native
   semantics. Label text occupies an explicit text column; wrapped lines and
   helper text align with that column. Controls do not shrink. Radio groups use
   native group behavior and a meaningful legend.
2. **Field:** label, native input/select/textarea, hint, required and invalid state,
   accessible description/error associations. Keep native controls where possible.
3. **Settings row/section:** adopt the existing desktop label-column layout and
   mobile stacking behavior; distinguish a group heading from an input label.
4. **Button directive and action row:** preserve native buttons/links, existing
   pill treatment, supported sizes, and explicit action/navigation semantics.
5. **Save feedback:** consistent nearby saving/saved/error presentation. The page
   remains responsible for persistence, rollback, and its save policy.

Use typed variants with a small documented set. Pages own placement, available
width, and spacing between components; components own internal alignment,
padding, typography, focus treatment, and state styling. Add a variant only for
an actual use case, with a story and review. Do not expose arbitrary internal
style inputs as an escape hatch.

Proposed usage, to validate during the pilot:

```html
<mb-checkbox
  [checked]="locked()"
  (checkedChange)="commit('locked', $event)"
  [disabled]="saving() === 'locked'"
  [label]="'settings.privacy.locked' | transloco"
  [hint]="'settings.privacy.locked.hint' | transloco"
/>
```

The component owns stable unique IDs, label activation, description wiring,
focus, and wrapping. Saving/error inputs or slots must compose without becoming
part of the accessible label accidentally. Existing translation keys stay at
call sites. Support explicit bindings and Angular forms through a tested
ControlValueAccessor where applicable; preserve touched, disabled, reset, and
validation behavior. Test these paths rather than assuming a styled wrapper is
forms-compatible. Complex linked descriptions need a documented content slot,
not nested interactive elements inside a clickable label.

Checkbox acceptance cases: single and multi-line labels, long untranslated
tokens, translated text, RTL, narrow parent containers, disabled/indeterminate,
keyboard focus and Space, label click, hint/error/saved combinations, and 200%
zoom. Hints must align without caller-supplied pixel offsets. Wrapping must not
require a global `nowrap` workaround.

## Tokens and appearance

Extract existing colors and layout values first. Inventory repeated spacing,
type sizes, radii, control sizes, focus rings, and layers before choosing a small
scale. Preserve intentional differences such as pill buttons versus field corners.
Do not force every length, percentage, media-query breakpoint, or content-driven
dimension into a token.

Add semantic roles such as error text, link text, action fill, and text on action
fill where existing accent colors cannot serve every purpose. A decorative accent
is not automatically a readable text color. Existing white-on-accent buttons,
accent links, translucent surfaces, and the test-build background need measured
contrast before being declared compliant. Disabled text behavior must be documented
against the existing policy rather than silently creating a broad exemption.

Retain `--reader-*` overrides, `.is-test-build`, `data-theme`, and `data-accent`.
Test those contexts explicitly. System font rendering and the existing responsive
breakpoints are part of the baseline, not invitations to rebrand the app.

## Enforcement: fail with a useful replacement

Use existing [Angular ESLint tooling](https://github.com/angular-eslint/angular-eslint)
for external and inline templates, and [Stylelint's extension mechanisms](https://stylelint.io/user-guide/customize/)
for CSS. Parse source with the relevant ASTs rather than using regex as the main
enforcement engine.

| Proposed rule                 | Enforced contract                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mb/use-design-control`       | A checkbox/radio in governed application templates must use the supported component; raw native inputs are allowed inside its implementation. Expand to other controls only when a replacement exists. |
| `mb/no-component-restyle`     | Reject known overrides of owned internals through template styles, style bindings, forbidden classes, and CSS selectors. External layout remains allowed.                                              |
| `mb/use-theme-token`          | Reject literal UI colors, including fallbacks and colors inside gradients/shadows; allow documented semantic values such as `transparent` and `currentColor`.                                          |
| `mb/known-token`              | Reject misspelled or undeclared design tokens; distinguish registered runtime reader values and local custom properties.                                                                               |
| `mb/no-style-escape`          | Reject unapproved `::ng-deep`, `!important`, and overrides of protected custom properties.                                                                                                             |
| `mb/require-contract-example` | Each public primitive/variant has a contract entry and a corresponding catalogue example.                                                                                                              |

Start with the first three high-value rules and contract/example validation.
Add the others when their scope and false-positive behavior are demonstrated.
Read one contracts registry for selector ownership, variants, and diagnostic
links. Angular types handle invalid input variants; do not duplicate the compiler.

Example diagnostic:

```text
MB001 settings-example.html:42: Use <mb-checkbox> for checkbox/label layout.
Move label and hint text into the documented inputs/slots; remove .checkline.
See design_system/components.md#checkbox and Forms/Checkbox in Storybook.
```

CSS checks also cover global rules and Angular inline styles; bindings that set
protected style properties need template checks. Test valid and invalid fixtures
for external/inline templates, Angular control flow, style/class bindings,
shorthand CSS, token fallbacks, and approved exceptions. Autofix only unambiguous
changes; never guess at label semantics or persistence bindings.

Static lint cannot prove computed alignment or understand every dynamic class,
inherited style, opacity, or background image. Block known escape routes and use
rendered tests for the actual result. Do not promise a universal CSS theorem prover.

## Browser verification and the catalogue

Every component's catalogue page shows its contract, supported variants, copyable
Angular usage, keyboard behavior, and representative states. Include composed
settings/login examples, since many failures occur in the parent layout.

Use a bounded matrix:

- Core primitives: light/dim, all six accents, normal/hover/focus/disabled/error
  as applicable; automatic computed contrast checks across supported pairings.
- Checkbox/settings compositions: desktop, narrow container/mobile, long-label
  locale, RTL, zoom, and save feedback. Verify geometry as well as screenshots.
- Reader and test-build fixtures: confirm their inherited tokens do not damage
  controls or violate the text contrast policy.

Assert the documented 7:1 text policy explicitly; a default accessibility scanner
does not enforce this project's stronger policy. Resolve `color-mix()` and
transparency in a browser and measure foreground/background pairs on actual
surfaces. Complex backgrounds and semantics still require review.

[Playwright screenshot comparisons](https://playwright.dev/docs/test-snapshots)
provide reviewed visual evidence. Pin the browser, viewport, OS/font environment,
locale, fixtures, and animation settings. Use one reproducible baseline environment
and separate Windows snapshots if needed; platform font differences must not be
hidden behind large diff tolerances. Baseline changes need human review, never
automatic acceptance. Native input behavior also gets cross-browser smoke checks.

Keep Angular unit/behavior tests local as the repository requires. Add design
static checks and catalogue-build validation to CI. Run browser visual checks
locally first; making them a required CI job is a separately explicit workflow
decision, not an assumption that today's GitHub Actions runs the unit suite.

## Adoption without a rewrite

New and migrated code must comply. For legacy code, record exact findings with
rule ID, path, source fingerprint, reason, and migration owner/issue. Match
individual violations, not just totals: deleting one violation must not allow
adding another elsewhere. Reject new unmatched findings and stale exceptions.
Do not baseline by whole directory or silently regenerate the baseline in CI.

Permanent exceptions (for example, data-driven chart colors or supplied reader
content) are distinct from migration debt and must explain their scope. New
exceptions require review. The design-system maintainer owns token, contract,
variant, and exception changes; name that maintainer during implementation.

Once a component is migrated, remove its obsolete CSS. Do not leave the old
implementation available as the next developer's example. Keep compatibility
styles only while listed consumers remain, with a removal issue.

## Delivery plan

Estimates are planning ranges for one developer familiar with the app, not measured
commitments. The initial inventory and tooling spike should refine them.

| Stage                                | Work and reviewable result                                                                                                               | Exit condition                                                                                                                                              | Estimate          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1. Establish the baseline            | Capture representative current screens; inventory tokens and control variants; try Storybook with one real component and production CSS. | Catalogue works with locked Angular/Node dependencies; theme controls work; current visual and contrast debts are recorded.                                 | 1–2 days          |
| 2. Deliver the checkbox pilot        | Build checkbox/radio/settings-row contracts and stories; migrate Privacy, Content, login consent, and CORS-proxy examples.               | Wrapped labels/hints align in narrow and translated cases; native/forms behavior and existing saving/rollback tests pass; obsolete styles removed.          | 3–5 days          |
| 3. Close the enforcement loop        | Add initial template/CSS rules, precise legacy baseline, contrast/browser checks, and useful diagnostics.                                | Deliberately inserting a raw checkbox, raw UI color, or protected style override fails the gate and points to the fix; migrated pages have no debt entries. | 2–4 days          |
| 4. Expand the reusable family        | Standardize fields, buttons, action rows, and save feedback; migrate remaining settings in reviewable batches.                           | Each migrated batch reduces inventory/debt and preserves behavior; new work uses the system by default.                                                     | Scope after pilot |
| 5. Expand by demonstrated repetition | Consider dialogs, tabs, menus, notices, empty/loading states, and page headers.                                                          | Each addition solves observed duplication with documented behavior and examples.                                                                            | Separate backlog  |

Stages 1–3 are the first useful release: roughly 6–11 working days including
hardening, with the checkbox fix visible before the broader migration is done.
Do not begin with a comprehensive redesign or a long catalogue of unused widgets.

Proposed commands under `ui/`: `npm run design:dev`, `design:build`,
`design:check`, and `design:test`. Add Make aliases. Wire static design enforcement
into `check:static` and the Make check path; neither currently covers these new
files automatically. Keep browser/rule tests explicit and ensure the complete
documented gate invokes them without replacing audited Angular tests.

For implementation changes, use targeted specs during development, then
`cd ui && make test`; preserve test inventory checks. For runtime changes also
run `cd ui && npm run build:mockingbird`, inspect the bundle report, and retain
the 1 MB initial error budget. Verify both app configurations when shared global
styles change. Keep catalogue dependencies and optional feature data out of root
imports and guards. Use the real-client integration suite when persistence or
API behavior changes, against the PyPI wheel as documented.

Publishing, OAuth origins, storage keys, base href `/`, and the frozen sibling
client are outside this migration. Read `MIGRATION.md` before any later catalogue
publishing proposal that touches deployment configuration.

## What success looks like

A developer can find one canonical checkbox example, use it without writing
alignment CSS, and see all supported states. An agent that invents another
implementation gets an actionable error. Reviewers see intentional visual
changes with browser evidence. Legacy exceptions shrink with each migration,
while the app remains recognizably Mawkingbird.
