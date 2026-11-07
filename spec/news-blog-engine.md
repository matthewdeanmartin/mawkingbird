# News: a reusable Angular blog engine with Mastodon comments

Status: implemented 2026-11-07 (fediblog 0.1.0, vendored). See "Implementation
notes" at the end for what shipped and what is still open.

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
| Comment thread per post | Manual: publish the post, toot it from `@mawkingbird@mastodon.social`, put the status URL in the post's front matter. No CI automation planned. |
| Menu | Originally: Help is the one reading entry. Changed 2026-11-07 by the owner: "Site News" sits above Help in the `...` menu, and Pastes and Links moved to Write's header to make room. |

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

## Owner answers (2026-11-07)

1. **Name and repository:** `fediblog` (repository and npm package).
2. **"Reply in Mawkingbird":** opens the status in the app as the reader's
   signed-in account; readers who are not signed in go through sign-in first.
3. **First posts:** release notes and the Feed Builder launch. No post about
   the /legal rename.
4. **Help site theme:** adopt the shared tokens later. Map
   `design_system/tokens.css` onto the Read the Docs theme through `extra_css`.
5. **Later work:** plan per-post share images (`og:image`). CI tooting on
   publish is not planned; the status URL stays manual.

## Implementation notes (2026-11-07)

**Engine.** `fediblog` lives in its own local repository at
`C:\github\mimb\fediblog` (MIT, git-initialised, not yet pushed or published).
The package ships a small Angular 21 app. `fediblog build` turns the config and
posts into a JSON manifest, then runs `ng build` with `outputMode: static`. The
server reads the manifest from disk during prerender, so the browser bundle holds
no posts, and TransferState carries only the current page's data. Afterwards the
CLI writes theme.css, Atom, RSS and the sitemap, and checks that every expected
page exists. `--url … --noindex` builds a preview copy. The engine has
`npm run check`: typecheck, 23 node tests and a Playwright check of a built
example. That check covers hydration without console errors, the thread with a
mocked API, scripts in replies not running, the failure path, the reply form and
pages without JavaScript.

**In this repo.** `news/` holds the config, Mawkingbird's theme, the posts and
`vendor/fediblog-0.1.0.tgz`, pinned by hash in `news/package-lock.json` (see
`news/README.md`). Run `make news` or `make news-check`. Production builds News
through `make mockingbird MOCKINGBIRD_SEO=true`. Canary and test build noindex
previews, and client-build.yml builds it on every push. robots.txt announces
`/news/sitemap.xml` (checked by `check-seo-build.mjs`). Links: the app footer
(beside Help), the `...` menu ("Site News", above Help), the last row of the
`/feeds` landing list ("Mawkingbird News", which reads `news/atom.xml` in the
RSS reader), the help home and every help page's footer.

**Layout (2026-11-07).** News uses the app shell's grid: title over the left
rail, menu icons over the 600px column, sign-in over the right rail. The rails
are blank, and they collapse at the app's breakpoints (1240px and 1000px).
`news/theme.css` sets the engine's `--fb-rail-left`, `--fb-column`,
`--fb-rail-right` and `--fb-gap` to the shell's widths.

**Comments and sign-in (2026-11-07).** Readers can sign in with their own
Mastodon account (OAuth from the browser; redirect `news/auth/`, `noindex`) and
reply on the page, to the post or to one comment. This is a second sign-in,
separate from Mawkingbird's, as the owner accepted. News shares the
mawkingbird.com origin, so its browser storage is the app's too. Its keys use
the `fediblog:` prefix (`fediblog:session`, `fediblog:apps`, `fediblog:server`
in localStorage; `fediblog:pending` in sessionStorage) and never touch the
app's keys. Signed in as @mawkingbird@mastodon.social, the account menu
offers **Publish posts** (`news/publish/`, `noindex`). It lists posts as linked,
found or not published and publishes an editable toot with the default hashtags
from `publish.hashtags` (#mawkingbird #mastodonClient) plus the post's own
`hashtags:`, which are separate from its blog `tags:`. A post without a
`mastodon:` URL finds the account's toot that links it when the page loads
(owner's choice, 2026-11-07); with no such toot it says comments open once it
is shared. The engine credit ("Built with fediblog") is gone until the engine is
public; see the engine's TODO.md.

**Reply in Mawkingbird.** The button links to
`/statuses/anonymous-status.<base64url of {server, id, originalUrl}>`. For a
reader signed in to Mastodon, the thread page resolves the status through their
own server, so they can reply as themselves. A reader who is not signed in sees
it read-only, because `authGuard` treats `/statuses/…` links as public. The app
has no "sign in, then return to this URL" step, so the answer to question 2
(readers who are not signed in sign in first) is only half met. Meeting it fully
needs a return URL carried through login. That is an app change affecting every
public status link, so it is not made here.

**Linking toots (2026-11-07).** `make news` (and `make news-link`) first runs
`fediblog link`. It reads @mawkingbird's public toots and writes each published
post's `mastodon:` line into its front matter; commit those edits. A lookup
failure only warns; `NEWS_LINK=false` skips it. The config's `previews` (canary,
test) make toots that link a preview copy count too. The first two toots were
published from canary. The publish page now always links the real
`https://mawkingbird.com/news/…` address, and shows a notice on preview builds.

**Doubled handles (2026-11-07).** mawkingbird.com is behind Cloudflare with
Email Address Obfuscation on. `@user@server` handles look like email addresses,
so Cloudflare rewrites them into an obfuscated span, and its decoder and
Angular hydration then both write the handle. News now wraps every page in
`<!--email_off-->`. The app's prerendered pages are still affected (38 handles
on /science-fiction-on-mastodon/ on 2026-11-07). The fix is to turn the
setting off for the zone (owner, in Cloudflare).

**Open.**
- The owner creates the GitHub repository and publishes `fediblog` to npm. Then
  `news/package.json` switches from the vendored tarball to `fediblog@0.1.0`.
  Tracked in the engine's `TODO.md`.
- Toot both first posts and add their `mastodon:` URLs. Until then they say
  comments open once the post is shared.
- Not linked yet from `/legal/` or the root `noscript` overview.
- Per-post share images (question 5). Help adopting the shared tokens
  (question 4).
- News has no GoatCounter tracking.
