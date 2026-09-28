# Sprint 2 — complete the form vocabulary

Status: preview checkpoint implemented; user review and app integration pending.

## A. Preview checkpoint

- [x] Shared native field wrapper/directive for text, number, password, select and textarea.
- [x] Native radio group with descriptions, required/disabled/error states and Angular forms support.
- [x] Save feedback with separate polite status and error alert regions.
- [x] Working in-memory save/validation/rollback demonstration.
- [x] Reactive/template-driven forms tests; keyboard, narrow/RTL and contrast browser checks.
- [x] Scoped CSS enforcement and an exact inventory of legacy CSS color findings.
- [ ] User reviews [the preview](../REVIEW-2.md).

## B. Integration checkpoint — after preview approval

- [ ] Migrate Content radio groups and remove their manual helper-text indent.
- [ ] Integrate fields/save feedback into reviewed settings/connection batches.
- [ ] Preserve validation, localization and one save policy per page.
- [ ] Extend enforcement to migrated consumers and classify their color findings.
- [ ] Run app screenshot, test/bundle and post-integration drift checks.

The Sprint 1 integration checklist remains outstanding; creating the next preview
does not count as migrating that earlier batch. Combine the approved form migrations
into reviewable follow-up changes after the new form vocabulary is reviewed.

## Scope and acceptance

Preview native radio groups, text/number/password inputs, select, textarea,
field label/hint/error composition, and saving/saved/error feedback. Establish
required, disabled, invalid, long-copy and keyboard states. Preserve one save
policy per page; persistence belongs to the consumer.

After preview approval, migrate remaining settings and connection forms in
bounded batches. Begin with Content radio groups and their manually indented
notes. Test template-driven and reactive forms, reset, failure rollback and
translation keys. Inventory other eligible forms rather than guessing coverage.

Add CSS color/token lint with exact legacy findings, and expand template rules
only where an approved replacement exists. Record measured 7:1 contrast pairs
across actual theme surfaces. Done: migrated consumers have no ad-hoc field
alignment rules; before/after inventory and drift audit are reviewed.
