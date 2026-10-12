# Mawkingbird

This repository hosts [Mawkingbird](https://mawkingbird.com/) on GitHub Pages.

Production uses the origin root; canary and sandbox use `/canary/` and `/test/`.

The continuously deployed canary is available at:

https://mawkingbird.com/canary/

The maintained application source now lives in [ui/](ui/), forked from
`mastodon_mock` at `4d981c458abc1d1ed7f2929f33e53a4f8fee1ca8`. The original UI
remains there as the frozen mock-server client.

In Git Bash, run `make install`, then `make dev`. Run `make mockingbird` for a
static build in `ui/dist-mockingbird/browser`; `make test` runs the full UI gate.
The standalone build needs no Python checkout. The optional admin diagnostic
build writes to `ui/dist-admin`.

Production, canary and sandbox remain at `mawkingbird.com`, `/canary/`, and
`/test/`. Help remains at https://mawkingbird.readthedocs.io/.
See [DEPLOY.md](DEPLOY.md) for deployment and rollback, and
[MIGRATION.md](MIGRATION.md) for hosting history.

## YouTube video feeds

The `/videos` reader uses public YouTube channel RSS feeds. YouTube sometimes
returns 404 or 500 for valid feeds; users report this recurring for years, with
feeds often recovering around a day later. Recovery time is not guaranteed.

Failed refreshes retain subscriptions and the last successfully cached videos.
New subscriptions may remain empty until a successful refresh. Try **Refresh**
again later; a feed error alone does not mean the channel URL is wrong. The
reader stays based on RSS rather than switching to channel-page scraping.

See [Video feeds](docs/connections/video-feeds.md) for reader behavior and
[RSS failure checks](DEPLOY.md#youtube-rss-failures) for deployment diagnosis.

For setup, testing, design rules, and help-page changes, see
[Contributing](docs/contributing.md).
