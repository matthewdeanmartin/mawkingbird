# Contributing to Mawkingbird

Report bugs and propose changes in the
[Mawkingbird repository](https://github.com/matthewdeanmartin/mawkingbird).
For a bug report, include the page, steps to reproduce, expected behavior,
browser, and build commit shown in the app. Remove tokens and private account
data from screenshots and logs.

## Get the client running

Use Git, Node.js 22 (the CI version), npm, and Make. On Windows, use Git Bash.
The client does not require Python or a running mock server.

```bash
git clone https://github.com/matthewdeanmartin/mawkingbird.git
cd mawkingbird
make install
make dev
```

Open `http://localhost:4200/`. Both commands run in the repository root;
`make install` uses `npm ci` and the committed lockfile. Without Make, run
`npm ci` and `npm start` from `ui/`.

The maintained Angular client is in `ui/`. The copy in the separate
`mastodon_mock` repository is a frozen legacy mock-server client. Make new
Mawkingbird changes here rather than synchronizing the two copies.

## Find the right files

| Area | Location |
| --- | --- |
| Client code and colocated tests | `ui/src/` |
| Public assets and interface dictionaries | `ui/public/` |
| Translation context and glossaries | `ui/i18n-context/` |
| Developer guides | `ui/docs/` |
| Published help pages | `docs/` |
| Help navigation | `mkdocs.yml` |
| Build and publishing automation | `.github/workflows/` |

Read the [UI design and contribution rules](https://github.com/matthewdeanmartin/mawkingbird/blob/main/ui/docs/contributing.md)
before changing screens, text contrast, or settings behavior.
The [security guide](https://github.com/matthewdeanmartin/mawkingbird/blob/main/ui/docs/security.md)
explains storage, credentials, and browser security boundaries.

## Check a client change

Run these commands from `ui/`. During development, run the affected spec or area:

```bash
npm run test:subset -- src/app/compose/compose.spec.ts
# Or an entire area:
npm run test:subset -- src/app/pages/search
```

Before handing off a client change, run the full test gate, lint, and standalone
build. The test gate checks the source inventory and runtime manifest as well
as running tests with coverage; do not skip, focus, or remove tests to pass it.

```bash
make test
npm run lint
npm run build:mockingbird
```

`make check` runs the broader UI gate, including formatting, storage, subpath
routing, translations, the starter catalogue, both builds, and dependency audit.
GitHub Actions validates builds for each public base path and runs the separate
HTTP integration suite; run the full Angular unit suite locally. Include the
checks you ran and any remaining failures in your PR.

For test isolation problems, see
[the shared jsdom guide](https://github.com/matthewdeanmartin/mawkingbird/blob/main/ui/docs/shared-jsdom-realm-in-tests.md).

## Integration tests against the released mock server

Install uv and Python 3.13 or newer, then run this from the repository root after
`make install`:

```bash
make test-integration
```

Equivalently, run `npm run test:integration` from `ui/`. The runner installs the
version pinned in `ui/integration/requirements.txt` from PyPI into an isolated
environment. It disables local project/config discovery, requires a wheel, and
uses Python isolated mode so the sibling checkout and `PYTHONPATH` cannot replace
the released package. The log records the installed version and import path.

Each run starts a disposable in-memory server on a free loopback port. The tests
exercise Mawkingbird's actual Angular `Api`, `Server`, `Auth`, and HTTP interceptors
with real network requests: authentication, post creation/editing/deletion,
timeline reads, favourites, bookmarks, and invalid credentials. Test setup resets
the server between cases, and the runner stops it on completion or test failure.
No real social account, public server, or fixed-port background service is needed.

These are API-client integration tests, not browser click-through or OAuth login
screen tests. They live in `ui/integration/` and run through a separate Angular
target; ordinary `make test` remains independent of Python and PyPI. CI runs them
in `client-integration.yml`. To test a newer release, update the explicit PyPI
version pin and review the results; do not replace it with a local/editable install.

## Translations and catalogue data

Follow [Adding an interface language](https://github.com/matthewdeanmartin/mawkingbird/blob/main/ui/docs/translating-interface.md).
English is generated from source declarations; other locales are maintained in
`ui/public/i18n/`. Preserve placeholders and use the locale's context and glossary.

The [starter catalogue guide](https://github.com/matthewdeanmartin/mawkingbird/blob/main/ui/docs/starter-catalog.md)
explains importing a snapshot from the sibling `mawkingbird_starters` repository.
Normal builds validate the committed snapshot offline and do not require that
checkout. `starter-kits:check` is a separate live account-consent check and can
report remote membership changes.

## Edit the help docs

Edit Markdown under `docs/` and add new pages to `mkdocs.yml`. From the repository
root, use Python tooling through uv to preview and validate the same dependencies
used by Read the Docs:

```bash
uv run --no-project --with-requirements docs/requirements.txt mkdocs serve
uv run --no-project --with-requirements docs/requirements.txt mkdocs build --strict
```

Help is published by Read the Docs. Client assets are published by GitHub Pages;
they are separate builds. For a documentation-only change, validate the docs
build and relevant links; there is no need to rebuild the Angular test suite.

## Related services and self-hosting

The [CORS proxy repository](https://github.com/matthewdeanmartin/mawkingbird_cors_proxy)
owns proxy development and deployment instructions. Follow its README for
self-hosting rather than looking for a backend in this client repository.
The [mock server](https://github.com/matthewdeanmartin/mastodon_mock) remains a
separate project for stateful Mastodon API testing.

## Publishing changes

`make mockingbird` at the repository root builds the standalone app into
`ui/dist-mockingbird/browser`. Production uses base href `/`; canary and sandbox
use `/canary/` and `/test/`. The optional `make build-admin` target in `ui/`
writes diagnostic assets to `ui/dist-admin`, not to the Python package.

Main-branch pushes publish canary and test when publishing is enabled. Production
is promoted manually with `mockingbird-pages.yml` and an explicit Git ref. All
three deployments now belong to this repository's `gh-pages` branch. Keep base
hrefs, OAuth metadata, and the shared 404 fallback consistent. Do not publish a
`/mawkingbird/` mirror build over the custom-domain root.

The old github.io address currently redirects to the custom domain; it is not
an independent fallback. See the current configuration section of
[MIGRATION.md](https://github.com/matthewdeanmartin/mawkingbird/blob/main/MIGRATION.md)
before changing hosting. Its older topology is retained as historical context.
