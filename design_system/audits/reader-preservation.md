# Reader presentation preservation

Scope: user-requested extraction for future evolution, explicitly not a redesign.
The pre-extraction baseline already includes the prior small-command migration.
Owner: the contributor changing these components and their maintainer reviewer;
no deployment or human visual approval is implied by local verification.

| Location                                                            | Finding / action                                                                                                                                                             | Preserved ownership                                                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ui/src/app/pages/read/read-toolbar/read-toolbar.html`              | Preferences appearance moves to `MbReaderPreferences`; keep the existing native labels, fields, compact spacing and colors rather than substituting ordinary Field geometry. | Preference bindings, dictionary validation, typography placement and progress.                       |
| `ui/src/app/pages/read/library-panel/library-panel.html`            | Rail presentation moves to `MbReaderLibrary`, with namespaced projected slots instead of locally duplicated styles.                                                          | Shelf order/disclosure, current entry, replaceUrl links, pin/move/remove/clear behavior and storage. |
| `ui/src/app/pages/read/document-search/document-search-dialog.html` | Field, match rows and surface move to `MbReaderSearch`. Current-page results remain enabled.                                                                                 | Search index/query, snippets, translation, navigation, Escape and anchored nonmodal placement.       |
| `ui/src/app/pages/read/notes-rail/notes-rail.html`                  | Surface uses `MbReaderSurface`; content and annotation states stay specialized.                                                                                              | Rail placement, anchoring, moved-note warnings and note operations.                                  |
| `ui/src/app/pages/read/selection-tools/selection-tools.html`        | Selection variant of `MbReaderSurface` preserves the existing radius/shadow.                                                                                                 | Selection coordinates, wrapping and command outputs.                                                 |

No change to ReaderCore, ReadPage, extraction, pagination, annotation storage,
reader paper/measure, or thread readability. No extra host boxes, focus manager,
forms adapter, overlay replacement or shared runtime library service. Commands
continue to reuse `MbPostAction size="small"`.

## Evidence

Before extraction, `reader-foundation.browser.mjs` passed against the existing
built real-reader Storybook fixture. It captured closed controls, typography,
invalid dictionary, Find, library and library menu at 320px light LTR touch,
412px dark RTL touch, and 1280px light LTR desktop. Baselines were copied to
ignored `ui/.test-results/reader-preservation-before/` before changing source.

After extraction, all six focused reader browser tests passed and all recorded
computed styles and bounding boxes matched exactly in all 18 states. Seventeen
of 18 screenshots were byte-identical; the remaining wide invalid-dictionary
image differed at 11 border-edge pixels, with identical geometry and computed
border/color. Both images were visually inspected. This is same-platform local
evidence, not a cross-platform golden-image assertion or a production screenshot.

Portable CI checks exercise native font/range/URL controls, validation recovery,
Find snippets/current results/Escape, native library links, row menu and shelf
disclosure, including narrow overflow checks. They also assert the established
field, row and panel dimensions independently of screenshots. Four shared
component unit tests cover projected/native forms, shelf navigation, search
events and surface semantics. Existing domain tests remain intact. Ownership
rules guard CSS namespacing and prevent local presentation copies.

Storybook's four **Reader / Presentation** stories isolate the contracts; the
existing **Adoption / Reader controls** story renders the actual consumers.
Both use the shipped shared components directly. Screenshot/layout artifacts
remain ignored under `design_system/test-results/`.

Not checked here: a physical phone, live documents on deployed production/canary,
or visual parity in every browser/font/locale. No change has been deployed.

## Final gates

- Focused reader/shared/provider specs: 296 passed.
- `cd ui && make test`: 7,692 passed; zero failed, pending or missing tests.
- `npm run design:verify`: formatting/types, ownership/color rules, inventory,
  Storybook build and all 366 browser tests passed.
- `npm run lint` and `npm run check:i18n`: passed (existing translation warnings remain).
- `npm run build:mockingbird`: passed, 896.99 kB initial output, unchanged 1 MB
  ceiling and lazy startup boundary. Existing shell/status-card CSS and CommonJS
  warnings remain.
- Narrow light typography and dark RTL library-menu screenshots were inspected;
  the final complete browser run reproduces the same geometry/image comparison.

Logs: `ui/.test-results/reader-foundation-{unit,full-tests,design-verify,lint,i18n,production}.log`.
No commit, push or deployment was performed.
