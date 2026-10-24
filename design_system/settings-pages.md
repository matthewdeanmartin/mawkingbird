# Adding a Settings page

Use `ui/src/app/pages/settings/profile/settings-profile.html` as the accepted
page composition reference. The Home and Algo page and its Storybook preview
show the same layout with shared widgets. Do not infer a new page layout from
a component catalogue or from older pages with partial adoption.

1. Use `.spage-head` for the title and introductory paragraph. Put the content
   inside `.spage-body`. The body owns the 22px horizontal inset.
2. Use `.ssection` for sections with headings and dividers. Do not make every
   section another rounded card. Notices inside a panel must retain the body
   inset; padding inside a notice does not create space outside it.
3. Use `mb-settings-row` for the heading and responsive control column,
   `mb-field`/`mbControl` for labelled native inputs/selects, `mb-checkbox` for
   boolean preferences and `mbButton` for actions. Consumers own external
   placement, never widget internals, pill radii, typography or button padding.
4. Pick one save contract for the whole page. Home and Algo stages every change,
   including factory reset, until Save. Immediate-save pages put feedback beside
   each changed control. Explain errors and preserve unsaved values.
5. Preserve account scope and existing storage keys. Register new keys and use
   translation source comments. Keep optional provider catalogues behind lazy
   imports; check the production initial bundle rather than assuming it stayed small.
6. Check narrow layouts (320px and 375px), long labels, keyboard controls, theme
   and direction. A component adoption count does not prove a composed page fits.
7. Inspect package scripts, Makefile and CI. Refresh and review the control
   inventory and reconciliation ledger, then run the full test gate and client
   production build. Shared widget changes additionally require design-verify.

The historical sprint/review documents record bounded migrations. They are not
alternative page templates and do not override this recipe or contributor rules.
