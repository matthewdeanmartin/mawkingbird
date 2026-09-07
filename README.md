# Mawkingbird

This repository publishes the GitHub-hosted mirror of
[Mawkingbird](https://mawkingbird.com/):

https://matthewdeanmartin.github.io/mawkingbird/

The continuously deployed canary is available at:

https://matthewdeanmartin.github.io/mawkingbird/canary/

The maintained application source now lives in [ui/](ui/), forked from
`mastodon_mock` at `4d981c458abc1d1ed7f2929f33e53a4f8fee1ca8`. The original UI
remains there as the frozen mock-server client.

In Git Bash, run `make install`, then `make dev`. Run `make mockingbird` for a
static build in `ui/dist-mockingbird/browser`; `make test` runs the full UI gate.
The standalone build needs no Python checkout. The optional admin diagnostic
build writes to `ui/dist-admin`.

Production, canary and sandbox remain at `mawkingbird.com`, `/canary/`, and
`/test/`. Help remains at https://mawkingbird.readthedocs.io/.
See [MIGRATION.md](MIGRATION.md) for publishing activation and rollback.
