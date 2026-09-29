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

## Subsequent adoption

[Sprint 7](07-checkbox-adoption.md) resolves the four listed Privacy checkbox
candidates and Admin Announcements' publish toggle: five production controls now
use the approved widget. Registration consent and the other opening findings
remain pending. See Sprints 8–11 for the next bounded adoption batches.

[Sprint 8](08-forms-adoption.md) subsequently resolves registration consent and
17 admin form controls. The seven-screen batch now uses the approved checkbox,
field/control and button widgets. Remaining row actions, other Login fields and
list states remain open inventory findings; this is not whole-screen completion.

[Sprint 9](09-dialog-adoption.md) adopts three production dialog implementations:
shared confirmation/prompt, Leave and Translate. Its audit lists service/direct
consumers and the individually deferred Effective Audience layout, destructive
button and consequence-card variants. Legacy overlays are not globally exempted.

[Sprint 10](10-navigation-and-states.md) adopts 18 template consumers in Settings
navigation, Public Timeline and List Timeline. Shared states now distinguish
failed reads from empty results, retain posts through refresh/pagination retry,
and preserve current-route marking with query parameters. Search's richer
results and remaining list controls stay explicit migration debt.

[Sprint 11](11-post-tools-and-enforcement.md) adopts 40 post-row/count/notice and
nested-library consumers. Its ledger accounts for all 209 current candidates,
including 165 explicit backlog files. Candidate patterns now include navigation
and remaining shared widget names; counts are not adoption percentages. Lint
protects adopted post actions, and the gate rejects missing ledger entries.
Deep semantic reconciliation of the backlog remains work, not an exception.

[Sprint 12](12-post-dialogs.md) adopts 16 modal/state/action consumers in the
account-list, history and sign-in dialogs. Three candidate templates move from
backlog to adopted scope; the ledger retains 162 explicit backlog files. The
obsolete sign-in stylesheet is removed, accounting for the source-file decrease.
Native link actions now reuse the approved solid/outline button appearance.

[Sprint 13](13-bookmark-and-report.md) adopts eight consumers in bookmark/report
forms. Their two templates become partial adoption, with specialized choice cards
and destructive action styling retained as explicit work. The ledger now has 160
backlog files. Native dialog and retained-report behavior have browser coverage.

[Sprint 14](14-list-membership.md) adopts 22 shared placements in ListDialog.
The ledger moves its template to partial adoption: 159 backlog files remain.
Read-state recovery stays explicit debt. Badge gains its first app consumer;
source usage is 17/27 widget types and 183 placements in 26 templates.

[Sprint 15](15-settings-forms.md) adopts 13 placements in Privacy and Trust settings.
The ledger now has 19 partial and 158 backlog files. RadioGroup and SettingsRow
gain app consumers; source usage reaches 19/27 types and 196 placements in 27 templates.

[Sprint 16](16-post-menus-and-disclosure.md) adopts four placements in RSS feed
actions and post poll statistics. Both scoped templates are adopted: 10 adopted,
19 partial and 156 backlog files remain. Source usage reaches 21/27 types and
200 placements in 29 templates. Privacy's compact-column correction changes
inventory line positions, not adoption counts. Mixed-content post menus remain
explicit backlog; specialized poll charts remain purpose-specific content.

[Sprints 17–18 combined](17-18-final-batch.md) add eight placements and replace
three RSS popup/action placements with direct compact actions. Source usage is
24/27 types and 208 placements in 30 templates. Ledger: 10 adopted, 20 partial,
155 backlog, plus 15 shared and 9 lexical-only candidates. Shared local-tab lint
is enabled for the migrated client-list template. Zero sprints remain in this
plan; the explicit app migration backlog is not complete.

Notification preferences now live under Content → Notifications, outside the
Appearance/Blue controls. The new page adopts PageHeader, three SettingsRows,
and four Field/Control pairs, with shared labels, hints and validation feedback.
The inventory and reconciliation ledger include this adopted scope; existing
preference storage and delivery behavior remain unchanged.

Profile link helpers adopt Dialog, Field/Control and Button for both website and
other-profile forms. The metadata rows also adopt labelled shared fields and
buttons, while the rest of the Profile form remains partial adoption. Helpers
reuse blank rows, preserve existing details and defer publishing to Save changes.

Profile rows now use Field's opt-in visually hidden labels to retain compact
editing and accessible names. The two helper buttons remain available at the
four-row limit; each dialog explains the limit and blocks adding, including form
submission, until a row is removed. Guided dialog labels remain visible.

Writing's publish wizard and vocabulary fields adopt shared two-column settings
rows. Wizard checkboxes, vocabulary inputs, actions and saved feedback use the
design system; preference semantics and the upper sections remain unchanged.

Privacy's posting defaults now use full-width SettingsRows for visibility,
media and language. Only the select fields retain a width cap, so the containing
rows no longer trigger the narrow-screen stacked layout on a wide page.

Write's posting-language question adopts Dialog, Field/Control and Button,
including an Other language field for custom tags. Both schedule controls use
the shared Button for Now, which clears the scheduled timestamp.

## Settings bug fixes, 2026-09-29

Connections uses shared local tabs for Basic and Advanced. The filter wizard uses shared buttons and fields; suggested hashtag selection uses shared checkboxes and buttons with results in place. Removed the network outage report action. Regenerated the control inventory, preserving existing classifications and recording the new wizard.
