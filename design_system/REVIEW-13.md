# Sprint 13 review: bookmark choices and reports

[Open Sprint 13](http://127.0.0.1:6006/?path=/story/start-here-sprint-13-review--choose-and-report).

The real bookmark destination chooser and report form now use the shared modal
shell. Reports also use shared labelled fields, an error notice and Cancel
action. The red Confirm report action remains deliberately distinct, pending a
reviewed destructive-button variant. Bookmark choice cards retain their richer
labels and descriptions; all three destinations remain available.

## Try it

- **Bookmark destinations** offers native saving, saving the post to Raindrop,
  and unwrapping its external link. **Saved browser bookmark** preserves the
  anonymous/removal wording. **No external link** explains the unavailable choice.
- Open any report form, select a category and enter a comment. **Fail once**
  retains both fields and shows an error; retry succeeds with the same payload.
- **Hold** leaves submission pending. Confirm is disabled, but Cancel and Escape
  remain available. Closing does not cancel an already-started report, matching
  existing behavior. Complete the held report from the preview toolbar.
- **Missing post reference** refuses a Bluesky post report before transport.
- Try light/dark, RTL and a narrow window. Long usernames and domains wrap.

These are production components with local service substitutes. No bookmark is
written and no report reaches a provider. Unit tests also cover real HTTP payloads.

Eight template consumers were adopted across two implementations. Rich choice
cards and the destructive action remain explicit partial adoption, not exceptions
to a finished system. The ledger retains 160 backlog files; this is a file count,
not a percentage of controls completed. See the [audit](audits/13-bookmark-and-report.md).

Validation passed: 156 targeted app tests, the complete 7,611-test app gate
with zero missing inventory entries, 224 catalogue browser checks and 26 design
rule checks. App lint, translation checks, catalogue types/format/build and
inventory reconciliation pass. Production initial size remains 883.54 kB, below
the unchanged 1 MB limit. Wide/light, narrow/dark and narrow RTL were inspected.
