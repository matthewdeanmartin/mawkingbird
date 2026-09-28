# Sprint 3 toolbar adoption

User approved the preview with “Continues to look good, proceed.” This batch
integrates the approved toolbar contract before starting another widget family.

## Scope and adoption

Three source scopes were selected; all three now consume `MbToolbar` and
`MbToolbarButton`. They contain **18 button declarations**, including a repeated
provider template; this is a source count, not a count of rendered buttons.

| Consumer                                                 | Evidence and change                                                                                                          | Remaining difference                                                                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/src/app/command-bar/command-bar.ts`                  | 13 button declarations adopted across actions, presentation and sources; removed local button state/radius/padding overrides | Feed Doctor is a native route link outside toolbar focus management, retaining local link styling                                             |
| `ui/src/app/pages/home/home.html` and `home.css`         | 3 filter buttons adopted; removed old `.btn-sm`, `.feed-filter`, hover and active overrides                                  | Time-range select and language picker remain native controls beside the button group; Calm now sits beside Retweets/Replies before the select |
| `ui/src/app/reader-toolbar/reader-toolbar.ts` and `.css` | 2 text-size buttons adopted; removed `.reader-item` styling                                                                  | Font-family and theme selects retain existing styling and Tab behavior; size readout is noninteractive                                        |

The shared command bar reaches Home and Public Timeline; the reader toolbar
reaches Home and Thread. No page routes, storage keys, save handlers or network
calls changed. Filter meanings, reader limits and view-toggle behavior remain
owned by existing app code. Reader and provider toggles now consistently expose
their state through `aria-pressed`.

Each button group has its own name and one Tab entry, with arrow navigation.
Outer containers with mixed controls use `role="group"`, avoiding nested or
misleading toolbar semantics. Links and selects remain outside roving button
focus. The two-button reader group uses the same contract for consistency with
the feed text-size actions; the small group is an intentional reuse.

## Drift enforcement

`mb/no-pill-in-toolbar` now rejects the legacy static `.btn` class as well as
`mbButton` inside toolbar markup. Positive/negative fixtures cover standalone
buttons, compact buttons, Angular control flow, and inline app templates.
This is a focused guard, not a complete detector of dynamically bound classes
or external CSS restyling. Shared component CSS retains its existing token rules.

No `mbToolbarButton` in the migrated scopes retains `.btn`, `.command-item` or
`.reader-item` internal styling. Outer layout remains with each consumer.

## Verification boundary

The **Adoption / Sprint 3 toolbars / App controls** story renders the actual
`CommandBar` and `ReaderToolbar` with in-memory service providers. Browser checks
exercise view toggling, refresh, reader/image recovery, source toggles, font size,
native select Tab order, narrow layouts and RTL. Home's actual filter template is
covered by its Angular behavior suite. Full route-page screenshots, Firefox and
screen-reader testing remain follow-ups; isolated component screenshots do not
claim to cover every surrounding page layout.

Storybook alone replaces the unused OAuth SDK with a throwing fixture module.
Importing the app components exposed a Babel failure in the SDK's disposable
helpers. App service fixtures never call it; an accidental call fails loudly.
Production dependency resolution, authentication and exact package pins are unchanged.

## Results

- Targeted Angular suites: 109 tests passed across 10 files.
- Full `make test`: 7,577 tests present, zero protected tests missing.
- Catalogue build, design formatting/type checks and 14 lint-policy tests passed.
- Application Angular lint passed with zero warnings.
- All 94 browser checks passed, including zero-error rendering of the actual app
  components. Inspected desktop/light, narrow/dim and narrow/RTL screenshots in
  `design_system/test-results/adoption.browser.mjs-*/app-toolbars.png`.
- Production build passed: initial JS/CSS 883,199 bytes, below the unchanged 1 MB
  limit. The startup-boundary check passed; optional collection data remains lazy.
- The initial new-story failures were fixture issues: router initial navigation
  tried to resolve `/iframe.html`, and one link assertion expected a relative URL.
  Fixed the fixture configuration and checked the exact resolved destination;
  no runtime-error assertions or production tests were removed.

## Remaining rollout

- Sprint 3 navigation, headers and content tabs are approved but not migrated.
- Sprint 1/2 checkbox, field, radio and save-feedback integration backlogs remain.
- Mixed-control roving-focus support remains unnecessary for these consumers:
  selects and links have independent native navigation.
- Sprint 4 overlay preview remains next in the widget-family plan, after this
  initial adoption checkpoint. This record does not mark any whole sprint complete.
