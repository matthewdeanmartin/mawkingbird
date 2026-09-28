# Design-system sprints: preview, review, integrate, audit

**Current checkpoint: Sprints 17 and 18 combined and implemented; zero planned
remaining.** See [live progress](PROGRESS.md) for source adoption and explicit
migration backlog. Historical checkpoints below are retained as evidence.

Each sprint has two checkpoints: **A: review the working catalogue**, then
**B: integrate the approved widgets into the listed app surfaces**. User review
at A is explicitly requested in this workflow. Do not treat an unreviewed preview
as permission to migrate screens. Revisions happen before integration.

The first six sprints established the widget families. Sprints 7–11 focus on
production adoption in bounded batches, not equal fractions of the templates.
The first audit establishes counts; subsequent audits measure
adoption by eligible consumers and remaining exceptions.

| Sprint                           | Solved family                                    | First integration targets                    | Status                                                      |
| -------------------------------- | ------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------- |
| [1](sprints/01-foundation.md)    | Catalogue, checkbox, settings row, button        | Privacy, login consent, CORS proxy           | Preview accepted to proceed; integration pending            |
| [2](sprints/02-forms.md)         | Radio groups, fields, validation, save feedback  | Remaining settings and connection forms      | Preview accepted to proceed; integration pending            |
| [3](sprints/03-navigation.md)    | Compact toolbars, page headers, tabs, navigation | Home/reader toolbars, settings shell, search | Preview approved; toolbar batch adopted; navigation pending |
| [4](sprints/04-overlays.md)      | Dialog, menu, disclosure, notices                | Existing dialogs and popovers                | Preview accepted; integration pending                       |
| [5](sprints/05-content.md)       | Content actions, metadata, loading/empty states  | Timelines, compose, reader surfaces          | Ordinary preview accepted; full-tools extension in review   |
| [6](sprints/06-consolidation.md) | Remaining recurring patterns and enforcement     | Remaining public/admin surfaces from audit   | In progress: dense post preview, inventory and CI gate      |

Every sprint delivers real production-ready Angular source, stories covering
states and composition, behavior tests, review notes, an integration inventory,
and a post-integration drift audit. Delete superseded CSS as consumers migrate.
Preserve current app semantics, localization, themes, storage and publishing.

LLMs run the [audit protocol](AUDIT.md) at the start and end of each sprint and
after changes to a shared widget. Findings become fixes, missing variants, or
specific justified exceptions. Automated lint progressively enforces solved
patterns; periodic LLM review discovers patterns we have not encoded yet.

For every integration: targeted specs, `cd ui && make test`, runtime production
build/bundle checks, and current repository quality gates. Screenshots must
include at least light/dim and narrow/wide layouts. Existing tests are retained.

Storybook/tooling upgrades are separate changes: exact version pins, inspect
migration notes, clean `npm ci`, build catalogue, exercise review stories, run
the Angular gate, and review lockfile changes. Never rerun an initializer over
the working catalogue to upgrade it.

## Adoption phase: five additional sprints

Approved widgets may be integrated within the requested batch without repeating
widget approval. New variants still return to preview. Every sprint's review must
show actual app components and state which production consumers changed.

| Sprint                                         | Deliverable                                                                       | State                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [7](sprints/07-checkbox-adoption.md)           | Five Privacy/admin checkboxes, real-component preview, rollback and publish tests | Implemented; morning review ready                       |
| [8](sprints/08-forms-adoption.md)              | Registration consent and admin forms                                              | Implemented; review ready                               |
| [9](sprints/09-dialog-adoption.md)             | Shared confirmation service and eligible dialogs                                  | Three implementations adopted; review ready             |
| [10](sprints/10-navigation-and-states.md)      | Navigation, headers and timeline states                                           | Implemented; review ready                               |
| [11](sprints/11-post-tools-and-enforcement.md) | Real post tools, provider parity and final enforcement reconciliation             | Post batch implemented; reconciliation/backlog recorded |

These sprints absorb the open integration work from Sprints 1–6. Their original
records remain historical evidence rather than being retroactively marked done.

## Continued adoption

The user accepted Sprint 11's post-tool batch and requested continued work.

| Sprint                                  | Deliverable                                                                                | State                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------- |
| [12](sprints/12-post-dialogs.md)        | Real account/history/sign-in dialogs, explicit read failures/retry and native link actions | Implemented; review ready |
| [13](sprints/13-bookmark-and-report.md) | Real bookmark/report dialogs, shared fields and retained report retry                      | Implemented; review ready |

The recorded residual backlog, rather than an equal fraction of remaining
screens, determines subsequent coherent batches. No blanket migration is claimed.

## Rolling plan: complete as a bounded sequence

| Sprint                                         | Scope                                                                                      | State                     | Planned remaining after completion |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------- | ---------------------------------- |
| [14](sprints/14-list-membership.md)            | List membership dialog                                                                     | Implemented; review ready | 4                                  |
| [15](sprints/15-settings-forms.md)             | Settings form composition                                                                  | Implemented; review ready | 3                                  |
| [16](sprints/16-post-menus-and-disclosure.md)  | RSS feed popup and post poll disclosure                                                    | Implemented; review ready | 2                                  |
| [17–18 combined](sprints/17-18-final-batch.md) | Client-list local tabs and metadata; history metadata; Feed simplification; reconciliation | Implemented; review ready | 0                                  |

Zero remaining in this plan does not mean zero app migration debt. Each closeout
must follow the [required report](PROGRESS.md#required-sprint-report), including
this sprint's integration, cumulative measured usage, next sprint and remaining
count. Refresh source adoption with `cd ui && npm run design:adoption`.
