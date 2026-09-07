# Mawkingbird contributor notes

Use Git Bash and Make on Windows. The maintained Angular client lives in ui/.
The sibling mastodon_mock/ui is a frozen legacy fork; do not synchronize changes back.

Use Node 22 (CI) or a supported newer Node, and npm ci with the committed lockfile.
Run targeted specs during development, then the complete gate: cd ui && make test.
Do not skip, focus, delete, or weaken tests; preserve the test inventory checks.
Angular tests run locally; GitHub Actions builds and checks deployment layout.

Read MIGRATION.md before modifying publishing. Keep all public origins, OAuth
redirect URLs, and persisted storage key names stable. Do not add CNAME to the
mawkingbird github.io mirror. Docs remain under docs/ and use Read the Docs.
