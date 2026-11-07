# News: a reusable Angular blog engine with Mastodon comments

Status: draft for owner review, 2026-11-07. No code yet.

## Why

Mawkingbird needs a place for project news ("what changed", release notes,
essays). `/legal/` (formerly `/blog/`) is About & legal, and the help site is
end-user guides only (AGENTS.md). Rather than a theme in someone else's engine,
build a small, separate, open-source **Angular static blog engine whose comments
are Mastodon replies**. Others can copy it, and "the blog engine with Mastodon
comments" points back at Mawkingbird.

## Decisions already made

| Question | Decision |
| --- | --- |
| Engine | Separate Angular project, its own repository and npm package, MIT. |
| Mawkingbird's site | `https://mawkingbird.com/news/`, built in this repo's CI and copied into the Pages artifact, like `/help/`. |
| Comment thread per post | Manual: publish the post, toot it from `@mawkingbird@mastodon.social`, put the status URL in the post's front matter. CI automation later. |
| Menu | Help is the one reading entry; the help home's "More from Mawkingbird" section will link News once it exists. |

## Shape

- **Posts:** Markdown with front matter (`title`, `description`, `date`,
  `updated`, `tags`, `image`, `mastodon` status URL, optional `hiddenReplies`).
- **Build:** Angular SSG prerenders one page per post, an index, tag pages and
  an archive. No server; output is static files at any base path (`/news/`).
- **Feeds and SEO:** Atom and RSS, a sitemap (added to `robots.txt` beside the
  app's and help's), canonical URLs with trailing slashes, `BlogPosting` and
  `BreadcrumbList` structured data, `og:` and `twitter:` cards per post, and
  `<meta name="fediverse:creator" content="@mawkingbird@mastodon.social">` so
  Mastodon link previews credit the account.
- **Comments:** on the client only, after load. Fetch
  `GET https://<server>/api/v1/statuses/<id>/context` (public, no token) and
  render descendants as a thread: sanitized HTML, custom emoji, content warnings
  collapsed, media as links. Not prerendered and never in the sitemap, in line
  with the rule that other people's posts are not published for indexing.
  - **Reply:** "Reply on Mastodon" asks for the reader's server and opens its
    remote-interaction page for the status (no OAuth). A second button,
    "Reply in Mawkingbird", opens the status in the app: the engine's built-in
    plug, which adopters can turn off.
  - **Moderation:** `hiddenReplies` in front matter, plus the author's own
    replies marked as such. Show only public and unlisted replies.
  - **Failure:** a server that refuses unauthenticated reads (authorized fetch
    or limited federation) shows "Read the replies on Mastodon" with a link.
- **Theming:** the engine reads CSS custom properties only. Mawkingbird's
  theme maps `design_system/tokens.css` onto them, so the app, News and (later)
  the help site's `extra_css` share colours, type and spacing. Adopters supply
  their own tokens file.
- **Accessibility and languages:** English first; `lang` per post so a
  translated post can carry hreflang alternates later.

## Integration in this repo

- `make news` builds the engine's output for `/news/` (pinned engine version,
  like the help site's locked toolchain). The Pages workflow copies it next to
  `/help/`.
- Links: help home "More from Mawkingbird", the app footer (beside About &
  legal), `/legal/`, and the root `noscript` overview. Public page links follow
  `ui/docs/seo.md` (trailing slash; checked by `check-seo-build.mjs`).
- `/news/` must not depend on the app bundle; it stays fast and crawlable
  without JavaScript.

## Open questions for the owner

1. Engine name and repository (for example `mastodon-comments-blog`, or a
   bird name to match).
2. Which mastodon.social status should "Reply in Mawkingbird" open: the
   reader's signed-in account in the app, or anonymous reading first?
3. First posts: release notes, the Feed Builder launch, the /legal rename?
4. Should the help site later adopt the same tokens (replacing the Read the
   Docs theme's colours), or keep its own look?
5. Later: CI tooting on publish (needs a token secret and an idempotency
   guard), and per-post share images.
