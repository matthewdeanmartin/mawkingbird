# Mawkingbird contributor notes

Use Git Bash and Make on Windows. The maintained Angular client lives in ui/.
The sibling mastodon_mock/ui is a frozen legacy fork; do not synchronize changes back.

For starter catalogue refreshes and language reconciliation, follow
ui/docs/starter-catalog.md and regenerate ui/docs/starter-locale-coverage.md.
Pack translations and app-wide UI locales are separate; preserve script tags.

Use Node 22 (CI) or a supported newer Node, and npm ci with the committed lockfile.
Run targeted specs during development, then the complete gate: cd ui && make test.
Do not skip, focus, delete, or weaken tests; preserve the test inventory checks.
Angular tests run locally; GitHub Actions builds and checks deployment layout.
The separate `make test-integration` suite exercises the real client against a
PyPI-installed mastodon-mock wheel in CI and locally. Never point this suite at
the sibling source checkout or an editable install. See docs/contributing.md.

Read MIGRATION.md before modifying publishing. Keep all public origins, OAuth
redirect URLs, and persisted storage key names stable. This repository now hosts
mawkingbird.com; production must use base href `/`. Do not publish a project-path
mirror build to this site's root. Docs remain under docs/ and use Read the Docs.
