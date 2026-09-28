# Design-system sprints: preview, review, integrate, audit

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
