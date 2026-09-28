# Sprint 15 review: Privacy and Trust settings

[Open Sprint 15](http://127.0.0.1:6006/?path=/story/start-here-sprint-15-review--privacy-and-trust).

The real Privacy page now groups its existing checkboxes in shared settings rows.
Visibility and language use labelled native selects, linked hints/errors and shared
save feedback. The real Trust page uses the four-choice radio group and two shared
checkboxes. Existing translations and behavior are preserved.

## Try it

- On **Privacy**, change visibility or language with **Fail once** selected.
  The pending field disables, failure restores its previous value, and retry sends
  only that field. **Slow** keeps the pending state visible for two seconds.
  Language also supports the existing empty/default choice.
- On **Trust**, use arrow keys through all four choices. Enable a global option,
  then choose **Trust no one**: switches disable while stored preferences and named
  accounts remain. Choose individuals again to restore access to the switches.
- Revoke requests confirmation; the fixture simulates Cancel. Actual confirmation
  behavior is covered by the app unit tests. The server-preferences link retains
  native navigation; following it leaves the local preview.
- Try narrow, dark and RTL views. Checkbox hints align through shared markup;
  the old manual label-offset rule is removed.

Services in this preview are in memory. Control changes do not write accounts,
storage or real server preferences. The output shows captured field payloads and
local trust state. This is real-component integration with simulated services,
not live-provider testing.

## Follow-up layout correction

User review identified oversized selects around an offset Media checkbox.
Sprint 16 bounds that group to 24rem so the existing SettingsRow container query
stacks Media's heading. Both selects and the checkbox share a starting edge;
LTR and RTL geometry checks now guard it. See [Sprint 16](REVIEW-16.md).

## Integration and remaining plan

**Sprint 15 implemented; Sprint 16 next; three planned remaining (16–18).**
All **13 selected placements** are integrated in app source: four settings rows,
two fields, two controls, two save-feedback components, one radio group and two
checkboxes. Privacy's five previously adopted checkboxes remain in use.

Cumulative adoption: **19/27 toolkit types (70%)**, **196 direct placements in
27 app templates**. This measures toolkit usage, not percentage of app migration.
The ledger retains 8 adopted scopes, 19 partial and 158 backlog files, plus
15 shared and 9 lexical-only candidates.

Both pages remain partial. Trust's account rows/remove/revoke actions and initial
read states need separate adoption. Privacy's initial-read recovery and overlapping
write/status behavior remain existing limitations. See [audit](audits/15-settings-forms.md)
and [progress](PROGRESS.md). Changes are uncommitted and not deployed.

Validation: 44 targeted app cases, 7,620 full app tests, 247 catalogue browser
checks and 26 rule checks pass. Types, formatting, lint, translations and inventory
checks pass. Production build is 883.54 kB initial, below the unchanged 1 MB
budget. Wide light, narrow dark and 320px RTL screenshots were inspected.
