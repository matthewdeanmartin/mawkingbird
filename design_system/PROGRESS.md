# Design-system progress

Current checkpoint: **Sprints 17 and 18 combined and implemented; review ready. Zero planned sprints remain.** This closes the bounded 1–18 plan,
not the migration of every app surface. Further adoption needs a newly scoped
batch from the explicit backlog; no Sprint 19 is implicitly promised.

## Integrated into app source

As of the combined 17–18 checkpoint:

| Measure                                         | Result                                         | Meaning                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Public component/directive types with app usage | **24 of 27 (89%)**                             | All 24 used directly; SaveFeedback also runs inside adopted Fields. This measures toolkit reach, not completion of app migration.   |
| Direct shared-widget placements                 | **208 across 30 app template files**           | Source nodes, not rendered instances. A field and its control each count; a repeated post row counts once.                          |
| Candidate-file dispositions                     | **10 adopted scopes; 20 partial; 155 backlog** | Plus 15 shared implementation files and 9 lexical-only candidates, totaling 209. These file counts are not per-control percentages. |
| Sprints 17–18 scoped integration                | **11 of 11 selected placements integrated**    | Eight added header/tab/link/metadata placements; three RSS placements replaced with direct compact actions.                         |

These are actual maintained `ui/src/app` consumers, including:

- Home, command-bar and reader compact toolbars.
- StatusCard and SaveToLibrary post actions and full counts.
- Privacy and registration checkboxes; moderation/admin form fields and actions.
- Settings navigation, Privacy/Trust forms, public/list timeline states and list-page header.
- Direct RSS feed actions and post poll-statistics disclosures.
- Client-list local tabs, headings and member identity links; edit-history metadata.
- Nine dialog implementations: confirmation/prompt, Leave, translation,
  account lists, history, sign-in prompt, bookmark chooser, report form and list membership.

The 3 types with no app usage are ActionMenu, Section and Popover. They remain
available in the catalogue. RSS no longer uses Popover after user review found
that the extra step was unnecessary. Availability does not mandate adoption;
widget presence in one surface does not mean every eligible surface uses it.

## Source, commit and deployment are separate

These counts describe the current working tree, including the uncommitted
Sprint 12–18 work. The last sprint passed the production build; that does not
mean it was deployed. No publication was performed or live deployment verified
in these sprints. Do not report source adoption as live-site coverage.

## Planned remaining: zero

The user requested combining Sprints 17 and 18. Metadata/content adoption,
local-panel tabs and final reconciliation are delivered together. See the
[combined review](REVIEW-17-18.md) and [closeout audit](audits/17-18-final-batch.md).

The reconciled ledger still has **155 backlog and 20 partially adopted candidate
files**. Those are file dispositions, not 175 equal-size tasks. Next candidates
include StatusCard's mixed-content menus, initial-read recovery in list/settings
surfaces, and route navigation/content surfaces. Scope and preview the next batch
before making another completion estimate. No remaining candidate is silently
exempted by closing this plan.

## Required sprint report

Every sprint closeout includes:

1. **Completed / next / planned remaining**, with the remaining range. Include
   the next sprint in the remaining count; after Sprint 15, report three (16–18).
2. **This sprint's integration:** adopted placements against the selected scope,
   real app consumers, and any preview-only or deferred pieces.
3. **Cumulative source adoption:** toolkit types with app usage, direct placements
   and app template files, plus candidate-file dispositions. Never label this
   percentage of the whole app migrated.
4. **Delivery status:** working tree, committed and/or deployed, each separately
   verified. Include tests and preview link as usual.

Refresh the usage report from Git Bash with `cd ui && npm run design:adoption`.
It parses Angular templates and component metadata; it excludes stories/specs,
counts direct uses separately from shared composition, and fails on template
parse errors. Its JSON lists the source file and count for each widget consumer.
The current snapshot is [adoption-status.json](audits/adoption-status.json).
Refresh that snapshot and this page at each sprint closeout; reconcile the
candidate ledger separately with `npm run design:inventory-check`.
