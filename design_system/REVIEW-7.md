# Sprint 7: shared checkboxes in real screens

Open [Sprint 7 app controls](http://127.0.0.1:6006/?path=/story/start-here-sprint-7-review--app-controls).

This batch changes the production templates, not just sample widgets. Storybook
renders the actual Privacy settings and Admin Announcements components, supplied
with local service fixtures so review cannot change a real account or publish.

## Morning review

1. Under Privacy, click **Require follow requests**. The first request is
   deliberately rejected. The checkbox disables while saving, then returns to
   unchecked with an error. Retry and it stays checked with Saved feedback.
2. Toggle discovery, automated-account and sensitive-media settings. The visible
   payload below the section contains only the changed field, matching the app's
   existing instant-save contract. Analytics remains browser-local in the app;
   the fixture keeps it in memory.
3. Under Admin, uncheck **Publish immediately**, enter text and create. The local
   result is a draft. Creation with the checkbox checked remains supported too.
4. Inspect narrow width, dim theme and RTL. The admin action row wraps with an
   8px gap rather than pushing the checkbox and Create button into each other.

Five controls were migrated: four server-backed Privacy checkboxes and the admin
publication checkbox. The existing analytics checkbox remains shared. Native
names, translated labels, hints, feedback and service handlers are preserved.
The admin's obsolete `.publish-toggle` CSS was removed. Other admin text fields,
buttons and server-error presentation are explicitly Sprint 8 work.

See the [adoption audit](audits/07-checkbox-adoption.md) for exact consumers and
[the five-sprint adoption plan](SPRINTS.md#adoption-phase-five-additional-sprints)
for what follows. No new visual variant, save policy or production request logic
was introduced in this batch.

## Completed verification

- Targeted Privacy/admin tests: 11 passed, including five new integration cases.
- Complete `cd ui && make test`: 7,585 runtime tests, zero protected tests missing.
- `npm run design:verify`: inventory, formatting/types, 17 policy tests,
  Storybook build and all 158 browser checks pass.
- Angular lint and changed app-file formatting pass. Production build passes at
  883.21 kB initial, below the unchanged 1 MB error limit; startup boundary passes.
  Existing stylesheet-size and CommonJS warnings remain.
- Inspected wide/light, narrow/dim and narrow/RTL screenshots under
  `design_system/test-results/adoption-7.browser.mjs-adopted-checkboxes-*/adoption.png`.

Sprint 7 implementation is complete for its five-control scope. Morning visual
review is ready; the next four sprints are planned rather than silently running.
The background HTTP server only keeps this catalogue available at port 6006.
