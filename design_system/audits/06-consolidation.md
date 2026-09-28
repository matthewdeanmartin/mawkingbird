# Sprint 6 opening consolidation audit

## Scope and accounting

`npm run design:audit-controls` scans all maintained `ui/src/app` HTML, non-spec
TypeScript and CSS, including public entry points and admin. The checked-in
[control inventory](06-control-inventory.json) records source paths and line
numbers: 1,051 files scanned, 205 with lexical control/style candidates.
Comments and inline templates can produce candidates. These numbers are neither
violations nor adoption percentages. Every non-library candidate remains marked
**needs semantic review** until its behavior is inspected. No blanket exception
or invented migration count is assigned to the remaining files.

The following reconciles known patterns; it does not pretend the entire source
inventory has already received a semantic audit.

| Evidence                                                                                   | Status / risk                                                                               | Next step / owner                                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `command-bar`, Home filter controls, reader size controls; `audits/03-toolbar-adoption.md` | Adopted toolbar batch; retain compact density correction                                    | Keep existing browser coverage; DS maintainer                                      |
| Analytics checkbox in chooser/Login/Privacy; `audits/03-compact-correction.md`             | Adopted alignment correction                                                                | Preserve actual save ownership; DS maintainer                                      |
| `pages/login/login.html:330`, `.css:318` registration agreement                            | Pending checkbox migration; text and registration semantics distinct from analytics consent | Sprint 1 backlog; preserve ngModel and consent behavior                            |
| `pages/settings/privacy/settings-privacy.html:15,35,59,118`                                | Remaining native checkbox candidates; page save behavior must survive                       | Sprint 1/2 backlog; inspect each before migration                                  |
| `admin/announcements/admin-announcements.html:10`, `.css:25`                               | Publish toggle has local flex/gap layout                                                    | Candidate for approved checkbox; admin maintainer reviews submit/publish semantics |
| `admin/ip-blocks/admin-ip-blocks.html:8`, `admin/domains/admin-domains.html:9`             | Native selects and add forms                                                                | Candidate for field/control contracts; preserve labels and server failure state    |
| Existing dialogs and popup consumers; `audits/04-overlays.md`                              | Approved preview, app integration pending                                                   | Sprint 4 backlog; focus/async parity before deletion of legacy CSS                 |
| Metadata and content states; `audits/05-content.md`                                        | Ordinary preview accepted; integration pending                                              | Sprint 5 backlog; preserve media/HTML, translations and scroll stability           |
| `status-card/status-card.html:448` reader links commented out; `:493` unified-share menu   | New full-tools preview closes a known mixed-action gap                                      | Review `MbPostActions`; no production preference/behavior changed                  |
| Structured compose errors, verified badges, provider/ownership-specific commands           | Specialized contracts; not safe to flatten                                                  | Retain pending explicit parity review, not a permanent blanket exception           |

## Enforcement begun

- Existing Angular template lint now rejects pill styling in `mb-post-actions`
  as well as `mb-toolbar`, with replacement guidance and positive/negative tests.
- Scoped CSS rules cover new post-action/count styles; raw palette literals and
  styling escape hatches remain forbidden in shared widgets.
- `design:verify` checks that the source inventory matches, then checks types,
  formatting, CSS contracts, builds Storybook and runs browser assertions.
- The client-build workflow has a separate design-system job using existing
  pinned checkout/setup actions, Node 22, `npm ci`, pinned Playwright and Chromium.
  It runs lint and `design:verify`. No deployment configuration changed.
- Browser layout/interaction/contrast checks become a CI gate. Screenshots remain
  review artifacts rather than pixel-diff baselines. Local commands were tested;
  the new hosted job still needs its first GitHub run.

## Ownership and remaining work

Each change to an adopted widget belongs to its author and reviewer: update
stories, run `make design-verify`, run affected app tests, and reconcile the audit.
Run the LLM protocol after shared-widget changes and at each sprint boundary;
review the inventory monthly during active UI work. The repository maintainer
owns assigning a human reviewer; no person has been silently assigned here.

Sprint 6 remains in progress. Finish the semantic inventory, review this new
mixed-action variant, migrate eligible consumers in small tested batches, then
remove duplicate CSS. Earlier preview approvals are retained; outstanding app
integration is not hidden by the sprint number. Completion requires recorded
consumer counts and parity evidence, not just a green catalogue.
