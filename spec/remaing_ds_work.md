# Remaining Design-System Work

## Current position

The planned sprint sequence is complete. The entire app has not been migrated.

The design system now provides reusable Angular widgets, Storybook previews, tests, lint rules and an adoption workflow.
App source uses 24 of 27 widget types, with 208 direct placements across 30 templates.

These counts describe the working tree. They do not establish that changes have been committed or deployed.

## What “155 backlog files” means

The inventory identifies app files containing potential design-system adoption work. 155 remain classified as backlog.

They need closer review to determine:

Which existing controls can use approved shared widgets.
Which controls need a new or extended widget.
Which specialized layouts should remain specific to their feature.
Which apparent matches do not require changes.

A backlog file is not necessarily a confirmed defect, one widget, or one sprint’s work. One file might need a single
replacement; another might contain several substantial interactions.

## What “20 partially adopted files” means

These files already use shared widgets, but some eligible controls or related interaction states remain outside the
completed migration scope.

Examples:

List membership: shared controls and failed-write recovery are integrated. Initial loading failures and distinguishing
unavailable data from failed requests still need attention.
Privacy: shared settings controls are integrated. Initial-read recovery and overlapping save/status behavior remain
existing limitations.
Trust settings: radio choices and global checkboxes are integrated. Named-account actions and other remaining controls
need review.
Client lists: shared headings, tabs, identity links and metadata are integrated. Read-state feedback and existing
request-race behavior remain separate work.

“Partial” records the boundary of completed work. It does not mean the adopted widgets are unfinished.

## Important remaining areas

Main post menus containing links, private-like state, timed mute choices and provider-specific actions.
Photo-viewer menus coupled to keyboard navigation and Escape handling.
Remaining settings, list and content surfaces.
Loading, failure, empty and retry states where existing behavior remains incomplete.

Keep frequent power-user actions visible. Do not introduce unnecessary menus merely to adopt a menu widget.

## How to continue

Select a bounded feature from design_system/audits/11-reconciliation.json.
Review its template, styles, behavior and existing tests.
Reuse approved widgets; preview new variants before integration.
Preserve navigation, persistence, confirmation and lifecycle behavior.
Verify rendering and behavior, then update the ledger and adoption report.

Use design_system/AUDIT.md for the audit procedure and design_system/PROGRESS.md for reporting conventions.

## Completion accounting

There are zero remaining sprints in the completed plan, but 155 backlog files and 20 partially adopted files remain in
the migration inventory.

Those 175 files are not 175 equal-sized tasks. Further sprint estimates require reviewing and grouping their actual
work.