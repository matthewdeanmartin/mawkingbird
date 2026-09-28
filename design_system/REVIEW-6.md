# Sprint 6: power-user actions and enforcement

Open [All tools](http://127.0.0.1:6006/?path=/story/start-here-sprint-6-review--all-tools)
or [Millions](http://127.0.0.1:6006/?path=/story/start-here-sprint-6-review--millions).
The Sprint 5 review also includes the additional full-tools post.

The 21 visible controls include reply, boost, boost count, like, like count,
quote, share, copy link, blog actions, translate, history, pin, quote policy,
edit, to-do, bookmark, two readers, original link and unavailable AI translation.
This is deliberately a superset of ownership/provider combinations, not a claim
that every real post supports every command. Nothing performs real actions.

Frequent commands are visible, full counts stay intact, and groups wrap to more
rows. No count abbreviation, horizontal clipping, scrolling strip or automatic
overflow menu is used. Only moderation/removal has a separate menu; its actions
report a confirmation preview without carrying out removal.

Buttons and links retain native Tab order. Unlike the existing button-only
`MbToolbar`, this mixed group does not claim toolbar arrow-key behavior.
Like/Boost/Bookmark expose pressed state; count buttons open local feedback.
Coarse-pointer targets are 44px. Inspect 150 likes / 2,000 boosts and then the
millions case at narrow width, in dim mode and RTL.

Sprint 5's ordinary post and long-name layout were accepted; its full-tools
extension awaits review. Sprint 6 has begun, not finished: see the
[consolidation audit](audits/06-consolidation.md) and explicit migration backlog.

## Validation

- 152 catalogue browser checks pass. The five new full-post checks cover all
  21 visible tools, unbroken counts, clipping, overlap, native keyboard order,
  toggle state and navigation links at 1280px, 380px, 320px RTL and touch density.
- Inspected `design_system/test-results/power-post.browser.mjs-full-post-*/full-post.png`:
  three action rows wide, six at 380px with a mouse, more space for 44px touch
  targets. Counts remain fully displayed through 12,345,678.
- Full `make test` passes: 7,580 runtime tests, zero missing. The shared-widget
  subset has 18 passing tests. Angular lint, formatting/types, 17 CSS/template
  policy tests, inventory consistency and Storybook build pass.
- Production build passes at 883.21 kB initial, within the unchanged 1 MB error
  budget. Existing stylesheet-size/CommonJS warnings remain.
- Inventory drift rejection was exercised with a temporary new control and the
  probe removed afterward. Windows/Linux paths are normalized for stable output.

The GitHub job is configured but has not yet run remotely. No real post action
or production layout has been migrated by this preview; integration parity and
remaining backlog classification are still Sprint 6 work.
