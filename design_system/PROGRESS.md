# Design-system progress

## Search and composer consistency

The shared composer now uses PostActions/PostAction for its mixed tool group and
Button for standalone actions. The tool group wraps within the available column;
the action row and selects no longer force a minimum-content width. File attachment
is a named native button that opens the existing file input, preserving upload
behavior while making the action keyboard-accessible. Toggle state is exposed
through the shared active/pressed contracts. Existing compact/chat visibility
policies, submission handlers and provider gates are unchanged.

The emoji panel is sized and anchored to the composer rather than to its icon.
EmojiPicker uses the library's dynamic-width layout and bounds the library's
off-screen accessibility content inside its own viewport, preventing RTL page
overflow without hiding composer controls. Storybook **Adoption / Composer**
renders the real full, compact and chat composers with all optional tool buttons
available, local nonpersistent drafts, blocked posting and fixture-only AI errors.

Search changes are deliberately conservative: standalone action buttons/links
use MbButton with explicit native button types. Query behavior, result/refinement
layout, saved-search disclosure semantics and specialized controls are unchanged.
Neither Search nor Compose is classified as fully migrated. The adoption snapshot
is **470 direct placements across 63 templates**, using 24 of 27 widget types.

Validation: all 7,670 tests pass through the full gate (610 targeted search/composer
tests). Ten browser checks cover full/compact/chat at 320, 480 and 1100px plus
dark RTL touch targets and actual emoji insertion. Narrow screenshots were reviewed.
Angular/design lint, format/type checks, inventory reconciliation, Storybook and
production builds pass. The initial bundle is 896.83 kB with the 1 MB limit unchanged.

## Shared-dialog migration, batch 2

Shortener proxy consent and Twitter proxy consent now use Dialog, Button,
ContentLink and Notice. Service-specific disclosure text, destinations and
accepted/cancelled outputs remain unchanged. External credential risk stays
distinct from self-hosted and credential-free requests; closing the dialog never
grants consent. Native modality adds focus containment, inert background content
and focus restoration to these formerly bespoke overlays. The initial focus is
the safe Close action above the disclosure, not the acceptance action below it.

Storybook **Adoption / Consent dialogs / Interactive** imports both production
components and exercises all five scenarios without storing consent or sending
requests. Seven browser checks cover explicit acceptance, decline/Escape/backdrop,
focus restoration/wrapping and long disclosure scrolling at 320px in both themes.
Twenty-two targeted tests cover the migrated components and existing consent stores.

Narrow-screen visual review exposed a shared header defect: long titles squeezed
Close into a column of letters. Dialog now wraps its header and preserves the
button width; the consent browser tests guard this at 320px. This fix lives in
the shared widget, not a consent-specific override. The full test gate passes
all 7,668 tests with no missing runtime inventory entries.
All 35 consent, batch-1 dialog and shared-overlay browser checks pass. Angular
lint, design lint, formatting/type checks, inventory reconciliation and both
Storybook and production builds pass; the initial bundle remains below 1 MB.

Source adoption is now **416 direct placements across 61 templates**. No new
widget was needed; the existing contracts cover this batch. Remaining shared
dialogs still precede search/composer and then settings/connections in the queue.

## Shared-dialog migration, batch 1

BugReportDialog, BulkAddDialog and BulkActionsDialog now compose the production
Dialog and Button widgets. Report/add fields use Field/Control; report choices
use Checkbox and the report preview uses Disclosure. Their bespoke modal shells,
focus traps and control styling have been removed. Existing requests, outputs,
stop-counting/retry behavior and explicit destructive confirmation remain owned
by the app components. Native modal stacking replaces local overlay z-indexes.

Storybook **Adoption / Shared dialogs / Interactive** imports those production
components with local fixtures. Try reporting, mixed add outcomes using
@alice @missing @error, and Stop counting followed by Count again. No requests
or account writes occur; the fixture GitHub action opens only a blank tab.

Source adoption is now **400 direct placements across 59 templates**. This is
the first dialog batch, not completion of the migration backlog. Next: remaining
shared dialogs, then search/composer, then settings/connections. Reuse existing
widgets before creating new ones; this batch required no new public component.

Validation: the full `make test` gate passes all 7,663 tests with no missing
inventory entries. Five real-browser checks cover bindings, mixed add outcomes,
stop/retry/confirmation, Escape, focus restoration and narrow light/dark layouts.
Angular lint, design lint, design format/type checks, inventory reconciliation,
Storybook build and the production build pass. Initial production JS/CSS is
896.70 kB under the unchanged 1 MB limit; optional collection data stays lazy.

## Button consistency follow-up

The [button batch](REVIEW-buttons.md) unifies action appearance and expands source
adoption to **377 direct placements across 56 templates**, still using 24 of 27
widget types. Legacy action classes share the canonical button implementation.
The historical sprint checkpoints below retain their original counts; the current
machine-readable snapshot is [adoption-status.json](audits/adoption-status.json).

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
