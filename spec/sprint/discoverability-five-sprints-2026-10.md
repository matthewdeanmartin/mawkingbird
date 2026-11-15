# Discoverability: five-sprint plan

Created 2026-10-26. Sprints 1–2 implemented and pushed by the owner on 2026-10-26.
Sprint 3 implemented and validated locally (evidence below), except S3-4, which
waits for Search Console data. Sprints 4–5 are planned.

## Where we start

- Google had indexed only `/`. Its rendered screenshot shows the welcome modal
  over a preview feed of other people's posts, with the title "Home". The owner
  submitted `sitemap.xml` (7 URLs) in Search Console on 2026-10-26; Google had
  not discovered `/features/` the day before.
- `/features/` and five `/for/*` pages have been prerendered since 2026-10-04.
  Every other deep link is served by GitHub Pages' 404 fallback (HTTP 404), and
  a fresh visitor to `/about` or `/blog` was dispatched to `/home`.
- 53 end-user guides lived only on `mawkingbird.readthedocs.io`, so they did not
  build the `mawkingbird.com` domain.

## Who we are writing for

The owner's forecast: users will be (1) people new to Mastodon, mostly arriving
from X or Bluesky, (2) Bluesky users who want Mastodon and RSS in the same
client, and (3) a few Mastodon power users who want features no other client
has. Existing Mastodon users are not the growth audience. Pages should answer
the questions those three groups type into a search box, and should lead to the
app itself rather than a sign-up wall.

## Decisions already made

- `/` stays the live app with the preview and welcome modal. A marketing landing
  page was tried before and scared people away from signing in. Discovery
  happens on the public pages, which then link into the app.
- Help is built twice from `docs/`: Read the Docs and static HTML at `/help/`.
  RTD may be retired later if the owner prefers the new site.
- The separate app-comparison site stays where it is; merging is deferred.
- Mawkingbird Plus must be ready before submitting to joinmastodon.org or
  similar directories. Those submissions are the owner's job, not an agent's.
- Tutorials wait for a screenshot pipeline (Sprint 4).

## Sprint 1 — Make the domain crawlable (implemented)

| ID | Work | Acceptance |
| --- | --- | --- |
| S1-1 | Move internal planning out of `docs/` into `spec/`; document where each kind of document goes in `AGENTS.md` and `docs/contributing.md`. | `docs/` contains only end-user guides, and every one is in the `mkdocs.yml` nav (the help build fails otherwise). |
| S1-2 | Prerender `/about/`, `/funding/` and `/blog/` from the same essay text as the in-app pages. | Each has its own title, description, canonical and sitemap entry; static HTML contains the essay. |
| S1-3 | Fix the deep-link bounce: a fresh visitor to `/about`, `/funding`, `/blog` or `/credits` entered `authGuard`, was sent to `/`, and the dispatcher landed them on `/home`. | With JavaScript, a fresh visitor stays on the page with `index, follow`. Lookalike paths stay private. |
| S1-4 | Static help site at `/help/`: Python-Markdown, nav from `mkdocs.yml`, three-column layout aligned with Home, no JavaScript, own sitemap announced in `robots.txt`. | 53 pages build on Python 3.12 and 3.15 from published wheels; unlisted guides, missing files and broken links fail the build; production deploy verifies `help/index.html`. |

### Sprint 1 owner follow-up

- Deploy production, then submit `https://mawkingbird.com/help/sitemap.xml` in
  Search Console as well (it is also announced in `robots.txt`).
- Use URL Inspection on `/features/`, `/about/` and `/help/` to request indexing.
- Fill in the baseline below a week after deployment.

## Sprint 2 — Starter kits as search landing pages, and links into Help

Outcome: people searching "who to follow on Mastodon for <topic>" land on a
useful page that leads into the app.

| ID | Work | Acceptance |
| --- | --- | --- |
| S2-1 | Prerender `/follow/` (hub) and `/follow/<slug>/` for each bundled starter kit (10 today), at a public URL outside the shell, like `/for/*`. Each page lists the kit's people with name, handle, short plain-text bio and profile link, and offers "Follow them all in Mawkingbird" (`/collections/starter/<slug>`). | Unique title/description per kit, canonical, sitemap entries, static and client SEO checks. Kit data stays out of the root bundle. |
| S2-2 | Respect opt-outs at build time: list a person only if `discoverable: true` and neither `noindex: true` nor `indexable: false`. A kit left with fewer than three people gets no page (skipped, not a build failure, so a monthly consent refresh cannot break deploys). Never publish the catalogue or snapshots of other people's collections. | All 65 accounts currently qualify; tests prove opted-out people and undersized kits are omitted. |
| S2-3 | Link Help from the app: footer, More menu and the welcome modal (a "What is Mawkingbird?" link to `/features/` and "Help" to `/help/`). Plain `href`s, not `routerLink`. | Links appear in the rendered DOM of `/home`, ahead of the feed's third-party links; the modal stays a two-button decision. |
| S2-4 | Build Help for canary at `/canary/help/` with `--noindex` so guide changes can be previewed. | Canary help pages are `noindex` and have no sitemap. |

### Owner decision raised by Sprint 2

The 128-pack multilingual starter catalogue (21 languages) would be the larger
search opportunity, but it is not published. Its consent gate lists people for
in-app following and deliberately ignores `noindex`/`indexable`; its own site is
`noindex, nofollow`; and the UI snapshot does not carry the flags. Publishing it
would need the importer to carry those flags and the stricter search rule applied,
plus a decision that the catalogue is reviewed enough to be indexed.

## Sprint 3 — Pages for the three audiences (implemented)

Outcome: each audience has a page that answers its first question in plain words.

| ID | Work | Acceptance |
| --- | --- | --- |
| S3-1 | "New to Mastodon" guide set in `docs/`: what a server is, how to pick one, signing up, finding people, what is different from X. Written for someone who has never used the fediverse. | Linked from `/for/twitter-exodus/` and the help home; each guide has one job and a next step. |
| S3-2 | "Bluesky and Mastodon in one place" page (`/for/bluesky/` rewrite plus a help guide): what works on each network, what does not cross over, and how to read both. | Accurate to shipped features; does not promise automatic cross-posting or migration that does not exist. |
| S3-3 | Power-user reference: a `/for/power-users/` audience page listing features other clients lack (bulk actions, finite feed, algo feed, analytics, feed doctor, POSSE, saved searches, connections). | Every item links to its help guide; every claim matches the current build. |
| S3-4 | Use Search Console query data (if any has arrived) to retitle pages and guides toward the words people actually search for. | Changes recorded with before/after titles. |

## Sprint 4 — Screenshot pipeline and tutorials

Outcome: tutorials with real screenshots, reproducible on every release.

| ID | Work | Acceptance |
| --- | --- | --- |
| S4-1 | A Playwright script that drives the production build against the mock server and stock fixtures, capturing named screens at desktop and phone widths in light and dark. No real accounts or third-party content in the images. | Deterministic output; reruns produce the same files apart from intentional UI changes. |
| S4-2 | Image support in `build_help.py`: copy `docs/img/`, require alt text, emit width/height, and lazy-load below the fold. | Missing alt text fails the build. |
| S4-3 | First tutorials: "Your first day on Mastodon with Mawkingbird", "Follow a starter kit", "Read Bluesky and Mastodon together", "Leave X without losing your people". | Each published with screenshots, linked from the matching audience page. |

## Sprint 5 — Measure, consolidate, prepare launch

Outcome: decisions made from data, and a checklist for the directory launch.

| ID | Work | Acceptance |
| --- | --- | --- |
| S5-1 | Review Search Console coverage and queries; fix every "Crawled/Discovered – not indexed" cause that is in our control. | Findings and fixes recorded here. |
| S5-2 | Structured data: `SoftwareApplication` on `/features/`, `BreadcrumbList` on help pages, `ItemList` on starter-kit pages. | Passes Google's Rich Results test. |
| S5-3 | Decide Read the Docs' future: canonical tags pointing to `/help/`, a redirect, or retirement. | Owner decision recorded; no duplicate-content split. |
| S5-4 | Launch readiness for joinmastodon.org and similar directories: Plus ready, help complete, screenshots current. Prepare submission drafts for the owner. | Drafts only; the owner submits. |
| S5-5 | Revisit merging the comparison site into this domain. | Owner decision recorded. |

## Baseline to fill in after deployment

| Date | Indexed pages | Sitemaps read | Clicks (28 days) | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-26 | 1 (`/`) | `sitemap.xml` submitted, 7 URLs | — | Before Sprint 1 deployment. |

## Sprint 1 evidence

Validated locally on 2026-10-26 with Node 24.18.0, Git Bash and Make:

- `cd ui && make test` passed: design inventory (1,184 files, 247 candidates, all
  dispositioned), runtime manifest 8,287 tests present, 0 missing, 0 skipped.
  The first run caught a renamed guard test; the original test was restored
  unchanged and the new cases added beside it.
- `npm run lint`, `format:check`, `check:i18n`, `check:subpaths`, `check:storage`
  and `git diff --check` pass. `PublicArticle` lives in `pages/features/` (English
  public reference) rather than adding an i18n exemption.
- `make mockingbird MOCKINGBIRD_SEO=true` prerendered 9 routes, passed the SEO
  HTML checks and wrote 53 help guides. `npm run test:seo:browser` passed,
  including a fresh JavaScript visitor staying on `/about/`, `/funding/` and
  `/blog/` with `index, follow` and the right canonical. `npm run
  build:mockingbird`: initial bundle 839.64 kB, under the unchanged 1 MB budget.
  The shell.css and status-card.css style-budget warnings predate this work.
- `make help-site-test`: 9 builder tests pass. The help site builds from published
  wheels on Python 3.15 and 3.12; screenshots at 1280 px (light and dark) and
  390 px show the guide aligned with Home's columns and no horizontal overflow.
- mkdocs still builds for Read the Docs (Python 3.13) with no warnings.

Wheel finding: PyYAML 6.0.3 publishes no CPython 3.15 wheel, so the builder uses
pure-Python `ruamel.yaml`. Local mkdocs on 3.15 is blocked by the same gap; RTD
uses 3.13 and is unaffected.

Not run: the wheel-backed `make test-integration` suite and `make design-verify`
(no shared design widgets changed). Nothing was deployed.

## Sprint 2 evidence

Validated locally on 2026-10-26 with Node 24.18.0, Git Bash and Make:

- `/follow/` plus 10 kit pages (65 people, all passing the search-listing rule)
  prerender alongside the Sprint 1 pages: 20 routes in total. The built
  `sitemap.xml` lists 21 URLs; the build check compares it with the prerendered
  kit directories in both directions.
- `cd ui && make test` passed: design inventory 1,191 files, 249 candidates, all
  dispositioned; runtime manifest 8,303 tests present, 0 missing, 0 skipped. New
  specs cover the consent filter, undersized kits, bio cleanup, description length,
  the guard for `/collections/starter`, the footer Help link and the modal's
  new-tab links. The footer spec's expected row was updated for the new Help link.
- `npm run test:seo:browser` passed, including: kit pages at 1280 and 390 px with
  and without JavaScript; per-kit title and canonical after the app boots; and a
  fresh visitor's "Follow this kit in Mawkingbird" reaching
  `/collections/starter/<slug>` rather than Home.
- `npm run build:mockingbird`: initial bundle 840.41 kB (+0.77 kB, route metadata
  and links); `report-bundle.mjs` confirms kit snapshots stay lazy.
- Lint, format, i18n (4 new English keys, other locales fall back), subpaths,
  storage and `git diff --check` pass. `make help-site-test` passes, including
  preview builds whose app links stay under `/canary/`.
- Canary and test workflows build `/canary/help/` and `/test/help/` with `noindex`
  and no sitemap. Not exercised in Actions yet; the next main push will.

Not run: `make test-integration` and `make design-verify` (no shared design
widget changed). Nothing was deployed.

## Sprint 3 evidence

Written 2026-10-26 from the shipped app, not from plans: every UI label, menu
path and limit in the new copy was checked against templates, `en.json` and the
existing guides.

- S3-1: six guides under `docs/new-to-mastodon/` (what Mastodon is, choosing a
  server, creating an account, coming from X, customs, Bluesky and Mastodon
  together), a "New to Mastodon" nav section and a block on the help home page.
  `/for/twitter-exodus/` links to them and to `/follow/`.
- S3-2: `/for/bluesky/` rewritten around using both networks: combined Home and
  notifications, reading Mastodon without an account, and cross-posting with its
  real limits. Title and description changed to "Bluesky and Mastodon in one
  client". Help guide: `new-to-mastodon/from-bluesky.md`.
- S3-3: `/for/power-users/` covers Feed Doctor, Calm, Algo, Just My Server, bulk
  actions, profile analytics, tag bundles, scheduling, POSSE and Pseudonymity.
  Mawkingbird Plus is not mentioned (its flag is test-only). Audience pages gained
  an optional "Read next" list of help guides.
- S3-4: deferred. No Search Console query data has arrived yet.

Corrections found while checking claims: the new-account path is **I need an
account** (not "I'm new here", which is the heading after it); Analytics is reached
from profiles and More → Observability, not the More menu; check-mark options are
under Settings → Appearance; the composer's visibility labels are public,
unlisted, private and direct.

Editing pass with the no-ai-slop checklist (applied after drafting, as the owner
asked): removed two "X, not Y" headings, three colon reveals, a "that is calm"
aside, a recap ending, and three unsupported claims ("more follow-backs", "a few
days", "an afternoon of clicking"); replaced "not the only one" with a named
example (Pixelfed); softened "The controls other Mastodon clients leave out" to
"Controls most Mastodon clients leave out". No banned words or em dashes were
present in the new copy.

Validation, 2026-10-26: `cd ui && make test` passed (design inventory 1,191 files,
249 candidates; runtime manifest 8,303 present, 0 missing, 0 skipped).
`make mockingbird MOCKINGBIRD_SEO=true` prerendered 21 routes, passed the SEO HTML
checks, wrote 59 help guides and a 22-URL root sitemap; `npm run test:seo:browser`
passed, including the new and renamed audience pages at 1280 and 390 px. Initial
bundle 840.74 kB. Lint, format, i18n, `make help-site-test` and mkdocs (Python
3.13, no warnings) pass. Not run: `make test-integration`, `make design-verify`.
