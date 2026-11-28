# Mawkingbird contributor notes

Git Bash and Make on Windows; Node 26; `npm ci`. The client is `ui/`. The sibling
mastodon_mock/ui is a frozen fork: never sync to it.

## Skills: load the one that fits before you start

Procedures live in `.claude/skills/<name>/SKILL.md`. Claude loads them by name. Other
agents: open the file when its trigger applies.

| Skill | Load it when you… |
| --- | --- |
| `ui-copy` | add or edit any user-visible string, label, hint, warning, flag text, menu row or group of buttons/tabs |
| `native-transport` | add or change an endpoint, method, header, host, upload, download, WebSocket or fetch; touch `native/` or the Rust host |
| `server-data` | build a screen that fetches from a server: live vs cache, failure states, cross-server links, web-blocked features, mute/block controls |
| `translate-ui` | translate, catch up or add a locale; use any `make i18n-*` command besides `i18n` and `i18n-extract` |
| `public-pages` | add or change a crawlable page, its title/description/sitemap/canonical, or a language page |
| `design-inventory` | change controls in HTML/TS/CSS, or `design:inventory-check` fails |
| `native-release` | write `NATIVE_CHANGELOG.md` or prepare a Native release |
| `live-test-plan` | a change needs real accounts or a deployed build to test |
| `podcast-topic-finder` | the owner asks for show prep or a run sheet |

## Don't break Native

The desktop app is this same `ui/` plus a Rust host. 0.1.0 shipped unable to post.
**Never edit `native/`** (it's generated from the private `../mawkingbird_native`).
**Native forwards only network calls that Rust lists**, so any new call in `ui/`
needs the `native-transport` skill in the same change. Never commit, push, release or
move a tag unless told to; release automation owns versions (`native-release` skill).


## Gates: light as you go, heavy only when the owner says

A heavy gate takes 3 to 10+ minutes. Running one after every edit turns a 10-minute
task into a two-hour one. **Never run a heavy gate unless the owner asked for it in
this session.**

**Light gates** (under a minute each; run as often as useful, scoped to what you touched):

- `npm run test:subset -- <spec|dir>`, or `cd ui && make test-changed`.
- `npx prettier --check <files>`, `npx ng lint --lint-file-patterns <files>`.
- `cd ui && npm run check:static` (about 30 s: libs, dead code, storage, subpaths, i18n,
  design lint). A new storage key goes in `ui/src/app/platform/storage/storage-registry.ts`.
- New or edited `// i18n` comments: `npm run i18n:extract`, then `check:i18n`.
- `npm run design:inventory-check`; if it fails, follow the `design-inventory` skill.
- Routes: `python -B -X utf8 ui/scripts/audit_deep_links.py`.
- One design story or spec: `npx playwright test --config ../design_system/playwright.config.mjs <file>`.

**Heavy gates** (ask first): `make test`, `make check`, builds (`build:mockingbird`, SEO),
`make design-verify`, browser suites (`test:*:browser`, `make test-deep-links-browser`),
`make test-integration`, Native builds. GitHub Actions runs them on every push.

**Stop points.** Work in pairs of sprints (or one whole small task), then stop. Run the
light gates once on the final tree, then ask: "Push so GitHub Actions runs the heavy
gates, or run them here?" Pushing is the default: aim for one push per pair of
sprints. Agents never push; the owner does. Fix what Actions reports, rerun the light
gates, and stop again. When the owner does ask for heavy gates locally, run them
cheapest first, once each, and rerun only the step that failed.

**Every stop report ends with one of these lines**, so the owner knows if you're
waiting on them:

- **Done.** Nothing more is planned.
- **Waiting on you:** a push, a live test (`spec/test_plans/`), or a decision. Name it.
- **Next:** the sprint ID and what it delivers (roadmap file), once the owner says go.

List which gates ran and which were left to Actions.

**Breaks you find are yours to fix.** A lint error, failing test or static check is
your job, whoever caused it. Fix it without comment. Don't dig through git history to
work out who broke it, and don't report it as "not mine". Read history only when you
need it to understand the fix. Other sessions may be editing the tree at the same
time, so unexpected changes are normal: don't revert them or stop to ask about them.

Formatting must NEVER fail GitHub builds or required gates. Prettier stays an
optional local command; never add it to CI or aggregate gates.

Noisy output wastes tokens: follow [ops/QUIET_OUTPUT_RUNBOOK.md](ops/QUIET_OUTPUT_RUNBOOK.md).

**Interface languages.** Translation is slow and costs a lot of tokens, so it never
happens per sprint. New features ship in English. Core screens (listed in
`spec/sprint/i18n-catchup-2026-11.md`) are kept translated in every shipped language,
in a batch when the owner asks. Everything else gets translated in occasional
catch-up passes, common languages first. Existing languages stay. A *new* one needs
a reason first, such as a starter kit, Feed Builder page or real traffic, and the
owner's say-so. `check:i18n` Rule 2b enforces the core screens. Translation work:
translate-ui skill.

- Shared design widgets: a component that calls a new service method or changes
  controls: grep design_system/stories and tests for it, run that file.
- Delete files your change orphans; don't silence knip.
- Never skip, focus or weaken a test to get a green run, or raise the 1 MB initial
  budget. Keep optional feature data out of root imports and route guards.
- **Tests that disappear are reported to the owner, each with its justification**, in
  your final message, and declared in `ui/test-removals.md`; the run fails otherwise.
  Renaming a test, or removing one for dead code or because it was poorly conceived, is
  fine and needs no permission. Say so plainly. Green runs write the test manifests;
  never edit them.
- `make test-integration` uses the PyPI mastodon-mock, never the sibling checkout.
- Logs go to the ignored `log/` folder, never elsewhere in the tree:
  `L=$(node ui/scripts/artifacts.mjs logs); make test > "$L/test.log" 2>&1`.
  Screenshots, reports and traces go to OS temp through `artifactDir()` in the same script.

**Feed Builder topics and data refreshes** use only the minimal gate in the sibling
`mawkingbird_starters/spec/feed-builder/new-topic-playbook.md` (schema and counts; for
a new topic, its specs and the design inventory).

## Where things go

- `ui/src/lib`: domain-neutral code. Never imports the app or another library; used
  through lib.json entries (ops/engineering/libraries.md; `npm run check:libs`,
  `npm run test:libs`).
- `docs/`: end-user help only, each file in the mkdocs.yml nav; then
  `make help-site-test help-site`. `ops/`: runbooks. `ops/engineering/`: guides.
  `spec/`: plans and evidence; retired ones in `spec/history/`.
- Public pages: `public-pages` skill.
- Starter catalogue and languages: ops/engineering/starter-catalog.md; regenerate
  starter-locale-coverage.md. Pack translations are not UI locales; keep script tags.
- Publishing: read ops/DEPLOY.md first. Keep origins, OAuth redirects and storage keys
  stable. Production base href is `/`; never publish a project-path build to the root.
