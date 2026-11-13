# Inbound informational pages: handoff

Status: planned, not started (2026-11-12). Owner asked for these pages; this
file is the brief for whoever writes them. Background:
[opus_SEO.md](opus_SEO.md) (overall SEO plan) and
[ui/docs/seo.md](../ui/docs/seo.md) (how public pages are built and checked).

## Goal

Pages that answer questions people search for before choosing a client, which
Mawkingbird can answer better than most sites because it is built against both
Mastodon and Bluesky. Each page must be a complete answer on its own; the app is
the natural next step, not the point of the page.

## Already done (do not redo)

- `/compare/` (best Mastodon web clients), `/compare/elk/`, `/compare/phanpy/`,
  `/compare/ivory/`: data in
  `ui/src/app/public-pages/features/audience-content.ts`, routes in
  `audience-routes.ts`, rendered by `audience-page.html` with an optional dated
  `comparison` table. Owner confirmed Elk supports several accounts (row added).
- `/for/bluesky/` retitled "Mastodon and Bluesky in one app" for that search.
- Help home (`docs/index.md`) links `/features/`, every `/for/` page and every
  `/compare/` page.

## Pages to write

In priority order. "Help" means a guide in `docs/` (plain Markdown, published to
`/help/` and Read the Docs); "compare" means a new entry in the comparison pages.

| #   | Page                                          | Target searches                                                         | Where                                                                                 |
| --- | --------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Mastodon vs Bluesky: what is different        | "mastodon vs bluesky", "bluesky or mastodon", "difference"              | compare: `/compare/mastodon-vs-bluesky/`                                              |
| 2   | RSS feeds for Mastodon and Bluesky accounts   | "mastodon rss feed", "bluesky rss", "follow mastodon in rss reader"     | help: `docs/finding-people/` or `docs/reading/`                                       |
| 3   | How Mastodon and Bluesky connect (bridges)    | "follow bluesky from mastodon", "bridgy fed", "mastodon bluesky bridge" | help: `docs/new-to-mastodon/`                                                         |
| 4   | Mastodon post length and media limits         | "mastodon character limit", "mastodon image size limit"                 | help: `docs/posting/`                                                                 |
| 5   | How hashtags work on Mastodon                 | "mastodon hashtags", "follow hashtag mastodon"                          | help: `docs/finding-people/` (link the similar-hashtags tool and `/communities/`)     |
| 6   | Mawkingbird vs Openvibe                       | "openvibe alternative" (the other multi-network app)                    | compare: `/compare/openvibe/`                                                         |
| 7   | Mawkingbird vs Ice Cubes, Tusky, official app | "<app> alternative", "mastodon app for android/iphone"                  | compare: one page each; position Mawkingbird as the browser option beside mobile apps |

### Notes per page

1. **Mastodon vs Bluesky.** Neutral, factual: ownership and moderation model
   (independent servers vs one main service with custom feeds and labelers),
   handles, discovery (hashtags vs feeds), post length, quote posts, DMs,
   leaving one network for another without losing followers (account migration
   on Mastodon, PDS move on Bluesky: describe, do not build tools for it).
   Close with "you don't have to choose" and `/for/bluesky/`. Use the
   `comparison` table for the side-by-side facts.
2. **RSS feeds.** Every public Mastodon profile has `https://<server>/@<user>.rss`
   and hashtags have `/tags/<tag>.rss`. Bluesky profiles have an RSS link too
   (verify the current URL form before writing). Show how to add one in
   Mawkingbird's RSS mode. Verify each URL form live on a real account.
3. **Bridges.** Explain Bridgy Fed (opt-in on both sides) in plain words: what
   it does, that both people may need to opt in, how bridged handles look.
   Mention that Mawkingbird reads both networks directly as the alternative.
   Do not overstate: check Bridgy Fed's own documentation for current opt-in
   rules on the day you write.
4. **Limits.** Mastodon's default is 500 characters, but servers can change it;
   say so, and that Mawkingbird reads the server's own limit
   (`effectiveMax` in compose). Bluesky is 300. Media and video limits: take
   them from current Mastodon and Bluesky documentation and date them.
5. **Hashtags.** CamelCase for screen readers, following a hashtag, why there
   is no trending algorithm by default, local vs federated tag timelines.
   Link `/mastodon-similar-hashtags/` and `/communities/`.
6. **Openvibe.** Closest competitor for the "one app" search. Verify which
   networks it supports today, price and platforms, from its own site. Fair
   framing, same structure as the existing comparison pages.
7. **Mobile apps.** These are phone apps; Mawkingbird is a browser client. The
   honest pitch is "use both with the same account", as on the Ivory page.

## Rules

- **Facts only, verified and dated.** Comparison tables carry the "Checked on"
  date (`COMPARED_ON` in `audience-content.ts`). Re-check every row of a table
  when you change its date. If a fact cannot be verified, leave the row out
  rather than guess. Each competitor page says Mawkingbird is not affiliated.
- **Say where others are better.** The existing pages say so (Phanpy's
  Catch-up and columns, Ivory's native apps and push). Keep that tone.
- **One page per intent.** If two planned pages would share most of their
  paragraphs, write one. Do not create keyword variants.
- **Pace.** A few good pages a month on a young domain. Do not batch-publish
  dozens; do not add new translated variants of these pages until the
  per-family indexing data (opus_SEO.md §3.5) shows the existing translations
  are being indexed.
- **House rules** (owner memory): call it Twitter, never X; no pages about
  leaving, deleting or moving accounts as tools; nothing promoting
  notification features; lead with the feed client, tools second.
- **Skip for now:** "TweetDeck alternative". Those readers want columns, which
  Mawkingbird does not have.
- **No external publishing.** Drafting posts that announce a page is fine;
  posting them is the owner's job (AGENTS.md).

## How to add each kind of page

**A comparison page** (`/compare/<slug>/`):

1. Content entry in `audience-content.ts` (key `compare-<slug>`), with a
   `comparison` table and `guides: otherComparisons('/compare/<slug>/')`;
   add the page to the `COMPARISONS` list so the others link to it.
2. Route in `audience-routes.ts` (title, unique description, `audience` key).
3. `ui/public/sitemap.xml` and the `pages` list in
   `ui/scripts/check-seo-build.mjs`.
4. Link it from `docs/index.md` beside the other comparisons.
5. `audience-content.spec.ts` expects a fixed number of compare routes; update
   that count.

**A help guide**: add the Markdown file under `docs/` and its entry in the
`mkdocs.yml` nav (the build fails otherwise). Link related guides and the
public pages with absolute `https://mawkingbird.com/...` URLs, as
`docs/index.md` does.

## Gates

- Comparison pages (shared page code and routes): `npx prettier --check` on
  changed files, `npm run test:subset -- src/app/public-pages/features`,
  `npm run design:inventory-check` (regenerate with `design:audit-controls` and
  note the review in `design_system/audits/06-consolidation.md` if it changes),
  then once at the end: `make test`, `npm run build:mockingbird`,
  `make test-seo`, `npm run test:seo:browser`.
- Help guides only: `make help-site-test` and `make help-site` from the
  repository root.
- Logs go under `node ui/scripts/artifacts.mjs logs`, never in the repo.
- Report which gates ran and which did not.

## After publishing

- Add new URLs to the weekly Search Console check (opus_SEO.md §3.5); a page
  still "Discovered – currently not indexed" after a month needs links (help
  home, related guides, a project-account post), not rewording.
- Re-check comparison tables every six months, or when a compared app ships a
  major release.
