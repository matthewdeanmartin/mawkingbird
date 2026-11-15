# Bulk-follow completion: one Close button

The Feed Builder bulk-follow dialog displayed its standard header Close button
as well as the Stop action changing into Close when finished. Disabled only
this dialog's header button. The action row keeps Stop during work and one Close
after completion, for both people and tags. Existing Escape and navigation
protection remain unchanged; no shared dialog widget changed.

Extended the existing progress/stop/completion regression to require exactly
one completed-state Close button and still verify that it dismisses the dialog.
Design inventory check passed without regeneration: candidate entries unchanged.
Targeted wizard tests and production build results are recorded below.

All 15 wizard tests passed. Production build and lazy startup boundary passed.
Diff check passed. Did not repeat the full application, SEO/browser or integration
suites for this local template correction; no shared-widget design gate needed.
No commit, push or deployment. Buddhism pipeline is finished at draft export;
its content review remains separate from this side quest.
