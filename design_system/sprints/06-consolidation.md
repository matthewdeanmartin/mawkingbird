# Sprint 6 — close gaps and make reuse routine

Run a repository-wide audit of maintained `ui/`, including public entry points
and admin surfaces. Classify every remaining recurring control/layout as adopted,
pending migration, a missing shared solution, or a justified exception.

Preview any additional genuinely repeated patterns; obtain review before their
integration. Finish migrations in this inventory and remove obsolete compatibility
styles. Consolidate tokens without changing theme/storage/public URL contracts.

Make template/CSS contracts and catalogue builds part of the existing quality
gate. Keep the audited Angular test inventory intact. Document reproducible
browser evidence and explicitly decide whether visual checks become a CI gate.

Done: every known eligible consumer is migrated or individually justified;
new violations fail with replacement guidance; every public widget has stories,
tests and usage contracts; final drift/contrast/bundle reports are reviewed.
Assign ongoing ownership and run the LLM audit after substantial UI work and
periodically during maintenance. The final audit creates the next backlog.

## Started checkpoint

[Full-tools review](../REVIEW-6.md) adds a mixed button/link action group with full
counts and natural wrapping. The [opening audit](../audits/06-consolidation.md)
records source-wide candidates, remaining migrations and exceptions requiring
semantic review. Catalogue checks are wired into the client-build workflow;
this does not mark the sprint complete or claim the hosted job has run.
