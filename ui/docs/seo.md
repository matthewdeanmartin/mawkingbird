# Public pages and SEO

Normal `npm start`, `npm run build:mockingbird` and `make test` do not prerender.
Run `cd ui && make test-seo` to build and check the prerendered site on demand.
After that build, `npm run test:seo:browser` checks the public site with and
without JavaScript on desktop and mobile (requires Playwright Chromium).
Production GitHub Pages publishing uses `make mockingbird MOCKINGBIRD_SEO=true`.
It keeps production base href `/` and the existing OAuth metadata and SPA 404
fallback. Canary and test remain client-rendered.
Production layout checks parse the base tag's value, accepting both `<base
href="/">` from prerendering and `<base href="/"/>` from client-only builds.
The checker still rejects preview/project-path bases, duplicate bases, incorrect
404 configuration, changed OAuth identifiers/redirects and the wrong CNAME.

`src/main.server.ts` bootstraps only the public features component and route
metadata. It does not initialize accounts, storage, runtime translations,
analytics or remote-server probes. `/features/` and the five audience pages
receive prerendered content. `/` uses the ordinary client entry with its existing anonymous preview
and welcome/login flow; no intermediate marketing page renders during loading,
preview preparation, reloads or account changes. Its social-card tags and identity
links are already in `src/index.html` and are available without JavaScript.
The SEO postbuild uses Angular's `index.csr.html` for the root `index.html`
required by GitHub Pages, preserving the client entry and its head metadata.
It adds a `noscript` overview with links to all six prerendered public guides,
so visitors and crawlers without JavaScript can discover the public content.
The browser bootstraps without hydration. `/features` remains the public
reference, including when JavaScript is disabled.

Audience pages are `/for/readers`, `/for/bluesky`, `/for/twitter-exodus`,
`/for/instagram` and `/for/creators`. Each has specific public copy, a unique
title/description and canonical URL, social-card metadata and a sitemap entry.
They link from `/features` and from one another's footers. The Instagram guide
describes photo viewing on supported networks, not an Instagram connection;
the Twitter/X guide does not promise automatic account migration. Audience
content is lazy-loaded and stays out of the app's initial bundle.

The feature-area navigation uses this document's pathname plus a fragment. Bare
`href="#reading"` links would resolve against the root `<base href="/">` and
open the app instead. The feature reference and audience pages share the same
audience footer links.

Production public pages use the app's GoatCounter tracker after browser startup.
Direct visits wait for the vendored script before being counted; delayed script
loading does not discard the first view. Analytics opt-out still suppresses
loading/counting, and canary/test deployments and JavaScript-disabled visits are
not tracked. Prerendering itself never initializes analytics.

The features reference is English. Tool pages and language landing pages may
exist in other languages, each at its own URL (see "Pages in other languages"
below). Existing app locale choices and script tags are unchanged.
Feature descriptions must reflect shipped capabilities and their account,
deployment or third-party prerequisites. Keep optional catalogue data out of
the root bundle and route guards.

`Seo` updates descriptions, robots, share titles and canonical URLs through
the existing `PageTitleStrategy`. Public routes opt in via `seoIndexable`.
The `/home` destination of the root dispatcher also opts in, with
`seoCanonicalPath: '/'`, so executing JavaScript does not turn the front door
into a noindex page. Its canonical stays at the root rather than indexing a
second homepage URL. Canary and test still override public routes to noindex;
their build stamping handles both ordinary and self-closing robots meta tags.
Utilities default to `noindex, follow` after client navigation. The static SPA
fallback initially contains homepage tags; utility URLs do not have individual
prerendered documents or route-specific social cards. The sitemap therefore
contains `/`, `/features/`, the six audience URLs and the three project pages
below (all in `public/sitemap.xml`), then every tool page in
`focused-tools.json` after `/tools/`, `/follow/` and one URL per published starter kit, which
`prepare-seo-index.mjs` appends. `check-seo-build.mjs` compares the finished
list exactly, so a registered tool missing from the sitemap fails the build. The help site
publishes its own. Do not add account feeds or arbitrary remote
posts to the sitemap. Do not use robots.txt blocking as a substitute for noindex.
When adding another public page, keep its client route, server route, sitemap
entry and HTML checks in sync.

## Project pages: About, Funding and Blog

`/about/`, `/funding/` and `/blog/` are prerendered by `PublicArticle`
(`pages/features/public-article.ts`), registered only in `main.server.ts`. In the
browser the same URLs belong to the signed-in shell and render the essays as
virtual tweets; the essay text lives once in `pages/docs/public-copy.ts`, so the
indexed copy and the in-app copy cannot drift. Their browser routes carry
`seoIndexable` and the same descriptions (from `seo.ts`), otherwise executing
JavaScript would turn the prerendered page into `noindex`.

These routes sit under the shell's `authGuard`. A fresh visitor (or a crawler
running JavaScript) used to be sent to `/`, which the entry dispatcher turns
into `/home`, so the article vanished. `authGuard` now enters Anonymous for
`/about`, `/funding`, `/blog` and `/credits`, as it already did for public posts,
profiles and tags. Such a visitor skips the welcome modal, exactly like someone
arriving on a shared post link.

## Starter kits: /follow/

`/follow/` and `/follow/<slug>/` are public pages built from the hand-picked
bundled kits (`bundled-starter-kits.generated.ts`) by `pages/features/follow-kits.ts`.
They are routed outside the shell like `/features`, prerendered once per kit
(`getPrerenderParams` in `main.server.ts`), and their per-kit titles and
descriptions come from lazy resolvers so the data stays out of the startup bundle
(`report-bundle.mjs` enforces this).

Consent: a person appears only when their home-instance snapshot says
`discoverable: true` and neither `noindex: true` nor `indexable: false`. That is
stricter than in-app listing, because these pages exist for search engines. A
kit with fewer than three such people gets no page. The larger multilingual
starter catalogue and snapshots of other people's collections are never
published here: the catalogue deliberately does not act on `noindex`, and its
UI snapshot does not carry the flags. Publishing it would need both changed.

"Follow this kit in Mawkingbird" opens `/collections/starter/<slug>`, which
`authGuard` lets a fresh visitor reach anonymously.

## Help site: /help/

The guides in `/docs` are published twice: to Read the Docs (mkdocs) and as
static pages at `https://mawkingbird.com/help/`, so the domain itself carries
the help content. `scripts/build_help.py` (Python, `uv`, wheels only) reads the
nav from `mkdocs.yml`, converts each guide with Python-Markdown and writes plain
HTML with no JavaScript into `dist-mockingbird/browser/help/`, plus
`help/sitemap.xml`, which `robots.txt` announces. The layout reuses the shell's
column widths: topics over the left rail, the guide across the centre column and
right rail. Production runs it from `make mockingbird MOCKINGBIRD_SEO=true`;
`make help-site` and `make help-site-test` run it locally (from the repository
root). It is a real directory, so GitHub Pages serves it directly and it needs
no entry in the 404 shim's `SUBPATHS`. Canary and test build previews at
`/canary/help/` and `/test/help/` with `--noindex` and no sitemap; links back to
the app stay inside that deployment.

The build fails when a file in `docs/` is missing from the `mkdocs.yml` nav, a
nav entry has no file, an internal link targets a missing guide, or two guides
share a title. Keep `docs/` for end-user guides only; internal planning belongs
in `spec/` or `sprint/`. In-app links to help must be plain `href`s, not
`routerLink`, because `/help/` is outside the Angular app. They are relative
(`help/`) so `<base href>` sends canary to its own preview. The footer, the More
menu and the welcome modal link to it; the modal's links open new tabs so its
two answers stay the only way out.

## Focused mini-apps

Public, prerendered pages for one task each, aimed at people searching for that
task: `/twitter-to-mastodon/` (archive → follows), `/crosspost/` (post to
Mastodon and Bluesky together), `/mastodon-analytics/`, `/github-to-mastodon/`,
`/schedule-mastodon-posts/`, `/bluesky-to-mastodon/` and `/mastodon-to-bluesky/`
(one page, the URL sets the direction), `/turn-off-boosts-mastodon/`,
`/find-contacts-on-mastodon/`, `/mastodon-friends-rss-feeds/`,
`/mastodon-mute-block-amnesty/`, `/how-to-be-anonymous-on-mastodon/`,
`/mastodon-handle-generator/`, `/turn-off-content-warnings-mastodon/`,
`/export-mastodon-bookmarks/`, `/download-mastodon-images/`, `/mastodon-similar-hashtags/`, and `/mastodon-search/` and `/bluesky-search/`
(one page, the URL sets the network). `/tools/` lists them all, grouped by each entry's
`group`; it is linked first on the in-app Docs page, from the blog article and
from `/features`.

**`src/app/focused-tools.json` is the list.** Each entry has the path, title,
meta description, who signs in (`mastodon` or `any`), the nav tab, and the
heading, phrase and tool selector `check-seo-build.mjs` expects of the
prerender. Routes (`focusedAppRoutes`), the trimmed nav (`FOCUSED_APPS`), the
`?next=` allowlist, the prerender table in `main.server.ts`, the features page,
the sitemap, its dates and the no-JavaScript links all read it. It is JSON so the
Node build scripts can read it; it ships in the initial bundle because the
routes need titles and descriptions there.

- Signed in (`mastodonSignedInMatch`, or `signedInMatch` for `signIn: any`:
  the crossposter and the Bluesky ⇄ Mastodon finder), the page runs in the shell trimmed to Home · tool · Invite,
  with the usual … and account menus, no rails and no mode switcher.
  `/<root>/invite` is the invite builder.
- Anyone else gets the same page alone, with its own header: what the tool does,
  then sign-in. Its interactive body is `@defer`red and signed-in only, so the
  prerender holds copy alone (`check-seo-build.mjs` asserts this).
- Sign-in returns to the page: `?next=` on `/login/mastodon` and `/login/bluesky`
  is honoured only for a `FOCUSED_APPS` root (`login-destination.ts`). Mastodon
  carries it in the pending OAuth record; Bluesky, whose OAuth state the SDK
  owns, in sessionStorage until its callback.
- Bodies reuse the app: the Twitter and GitHub finders are the components that
  Settings → Import/Export renders, as is the Bluesky ⇄ Mastodon finder
  (`bridge-friends-import`, with a fixed direction), the crossposter is
  `Compose` plus the Bluesky and Mastodon connectors, the analytics are
  `AccountAnalytics`, and the boosts page opens Settings → Bulk moderation's
  `reblogs-off`/`reblogs-on` dialog and progress panel. The contacts page is
  Settings' contacts finder (`contact-friends-import`); it works anonymously
  there, but the tool page signs in first like the others. The friends' feeds
  page opens the RSS pages' friend-feed dialog, which stays Plus-only: the page
  says so before sign-in and the dialog carries the gate. The amnesty page
  opens Bulk moderation's `mute-amnesty` and `block-amnesty` dialogs, which
  offer a Mastodon-format CSV backup first. The pseudonymity page writes
  `hide_collections`, `discoverable`, `indexable` and (opt-in) `locked` in one
  `update_credentials`, offering only fields the server reports and trusting
  only the values it sends back; search-engine `noindex` has no API, so it
  links to the server's Privacy and reach page. It then offers Mawkingbird's
  pseudonymity mode (`Pseudonymity`), reading the state back before saying it
  is on.
- The content-warnings page flips Settings → Trust's two account-wide
  switches (`TrustedAccounts`) and lifts "trust no one" when one is turned on.
  Mastodon's own `reading:expand:spoilers` and `reading:expand:media` are
  read-only through the API, so they are shown with a link to the server's
  Preferences page, never as switches.
- The bookmark exporter walks `/api/v1/bookmarks` (`Api.bookmarksPage`,
  `Link`-header cursor) and writes a Netscape bookmark file in the browser:
  posts, "unwrapped" (a post's shared link replaces it, by Raindrop's
  `firstExternalLink` rule, now in `external-link.ts`, with the preview card as
  fallback) or links only. Dates are the post's: Mastodon does not expose when
  something was bookmarked.
- The search pages put a box first and hand the query to the app's own
  `/search` (`?q=&type=`, or `type=bluesky-posts&bskyType=` for Bluesky), which
  `authGuard` opens anonymously for a fresh visitor, with no front page in
  between; a Bluesky search named in the URL now runs on arrival. Sign-in is
  offered beside the box and returns to the tool page (`?next=`). Their
  prerender holds a plain GET form until the deferred box loads.
- The handle generator also runs signed out, because its
  visitors have no account yet. It is a four-step wizard (name, pick, claim,
  done) with the step in `?step=`, so the browser's Back steps back; a step
  with nothing to show falls back to the furthest one that has. It is still `@defer`red, so the prerender makes
  no requests. Lookups use plain `fetch` to each server's public
  `/api/v1/accounts/lookup`, never `HttpClient`, so no token is sent to another
  server and a dead server cannot raise the fail whale. "Biggest servers" are
  the top ten by users in the joinmastodon directory (`MastodonServers`, the
  bundled `public/mastodon-servers.json` refreshed weekly from the live API).
  Connector pages take `embedded` to drop their Settings chrome.
- The media downloader (`/download-mastodon-images/`) also runs signed out:
  everything it reads is public. A handle or profile link is looked up on the
  account's own server; anything else is a search, on the visitor's server
  when signed in (resolving) or on mastodon.social when not. Several matches
  open a picker dialog. Posts are read from the account's home server through
  its public API, because another server only holds what federated to it;
  when the home server refuses, they come from the server the account was
  found on. The wall is the profile's `ProfileMediaGrid` and the Download
  media… button opens the same `MediaDownloadDialog` as the profile ••• menu
  (`fetch().blob()` per file, falling back to a list of links where a media
  server sends no CORS headers; never the Plus proxy). The shown account is
  kept in `?acct=`. Sign-in returns to the tool root, not to that account.
- The similar-hashtags page (`/mastodon-similar-hashtags/`) also runs signed
  out. Its hashtags live in `?tags=`. It samples the newest 200 posts carrying
  any of them (Mastodon's `any[]` on `/timelines/tag/`, one paged stream; up
  to 1000 on request) and ranks the other hashtags by how many sampled posts
  carry them. Signed out it reads the anonymous reading server, mastodon.social
  by default, whose tag timelines were public and CORS-open on 2026-10-31;
  signed in, the visitor's own server. It is `SimilarHashtagsPanel`, the same
  panel Search opens from a hashtag result's Similar button (`?similar=` on
  `/search`), where it takes the place of the hashtag results.
- Links into the rest of the app (`FocusedNextSteps`) come only after the task:
  after a search, below the composer, below the analytics.
- Onboarding opens on the first Home visit, never on these pages.

The Mastodon scheduler uses the server's own `scheduled_at`, never a queue in
the browser, so posts publish with the tab closed. It is Mastodon only: Bluesky
has no server-side scheduling. Before sending it checks Mastodon's limits (300
pending, 25 per UTC day, five minutes out; `schedule-plan.ts`) against every
pending post, fetched page by page, so a batch is not refused half-way. Its
signed-in page also lists and cancels upcoming posts, and the … menu's
"Scheduled posts" row opens it. Drafts still shows far-future "parked" posts.

The Twitter importer reads the archive before sign-in and stashes it across the
redirect.

## Pages in other languages

A tool page in another language is its own registry entry with `lang` (e.g.
`de`) and `translationOf` (the English entry's id), and the same tab, sign-in,
group and tool selector as the original (`focused-tools.spec.ts` checks). Its
`sources` names the original's directory. Each language has a folder: English
at the root, German under `/de/` (`de/mastodon-statistik`); the spec enforces
it. Slugs are in the page's language, ASCII only, and never renamed. The
first two German pages briefly lived at the root; `app.routes.ts` redirects
those two old paths.

- **Page copy** (heading, intro, steps, Questions) is written in the page
  itself, one language per file, not in the app dictionaries: it is what search
  engines read, the prerender loads no dictionaries, and each set serves one
  language's readers only. Existing tool pages get a German subclass of their
  component (`…De`, same file) with its own `<page>.de.html`, which overrides
  the sign-in return path; pages built later keep a copy file instead
  (`download-mastodon-images.copy.ts`, `language-landing.copy.ts`). The
  Bluesky ⇄ Mastodon and search pages pick their direction or network from the
  path, German paths included.
- **Everything translated inside the page follows the URL**, not the browser:
  the page component provides `provideRouteLanguage()` (`page-language.ts`),
  which pins Transloco to the route's `lang` with `|static` for its whole
  subtree, dialogs included. Google's renderer (an English browser) therefore
  sees a German tool in German. Text built in code uses `routeTranslate()`;
  a bare `TranslocoService.translate()` would ignore the pin. The tools' own
  strings and the app parts they embed get German in `de.json` only.
- **`<html lang>`** follows the page on public (indexable) routes: `Seo`
  publishes the route's `lang` to `PageLanguageState`, which
  `TranslocoLocaleSync` prefers over the interface language. The signed-in
  shell twin is not indexable, so there the interface language keeps the
  document.
- **`hreflang`**: `Seo` writes `<link rel="alternate">` for every language
  version plus `x-default` (English); the sitemap carries the same set as
  `xhtml:link`. `check-seo-build.mjs` asserts both, plus `<html lang>`.
- /tools and the features page list English pages only. `/de/` is the German
  index (`ToolsIndexDe`, German headings), and the two are each other's
  `hreflang` pair. Every tool page's header links its other language
  (`LanguageVersions`, from the registry), so the pairs are linked visibly too.
- The tools' own strings are translation keys under `focusedTools.*` (German
  in de.json only). Their Invite links come from the page's own route
  (`toolInviteLink()`), so a German page's Invite stays German.
- `german-pages.spec.ts` renders every German entry signed out and checks its
  language, heading, link to the English version, and that every sign-in
  returns to the German page.

Language landing pages (`mastodon-in-english`, `mastodon-auf-deutsch`,
`learn-english-with-mastodon`) share `LanguageLanding`: a pitch while signed
out, the reader's language settings as one checklist once signed in (the same
services as Settings → Internationalization; nothing changes before Apply;
only the posting language is written to the server), then the way home. Their
copy, checklist included, is in `language-landing.copy.ts`.

To add a mini-app: one entry in `focused-tools.json` (with `sources` if its
directory under `src/app/pages/` is not named after its path), its lazy loader
in `FOCUSED_TOOL_PAGES` (`app.routes.ts`), its component in `toolComponents`
(`main.server.ts`), and the tab's `// i18n` label in `shell/mode-nav.ts`. The
route spec fails on a missing loader; a missing component is never prerendered,
which fails `check-seo-build.mjs`.

## Titles, structured data and sitemap dates

Pages titled through a route read "Page · Mawkingbird". The untitled front
page declares a `seoTagline` instead and reads "Mawkingbird — Mastodon,
Bluesky & RSS reader in one place"; `src/index.html` carries the same title
for crawlers that skip JavaScript.

`Seo` keeps at most one JSON-LD block in the head, from a route's
`seoStructuredData`, and removes it on utility routes and previews. The front
page and `/features/` describe the app (`APP_STRUCTURED_DATA`, a
`WebApplication`); each `/follow/<slug>/` page lists its people as an
`ItemList` (`kitItemList`). The server route table in `main.server.ts` must
carry the same data as `app.routes.ts`. `prepare-seo-index.mjs` copies the
prerendered `/features/` block into the root `index.html`. A JSON-LD block is
data, not script, so `script-src 'self'` permits it. The help pages ship no
scripts at all, so their breadcrumbs (Mawkingbird › Help › guide) are
microdata `<meta>`/`<link>` elements instead.

Both sitemaps give each URL a `<lastmod>` from the last git commit to its
sources: the guide's file for help pages, and a page-to-files table in
`prepare-seo-index.mjs` for the app pages. That table fails the build for an
unmapped page. Pages whose sources have uncommitted edits are dated today. A
shallow clone would date everything to one commit, so the dates are left out
there. The Pages workflow checks out full history and
fails if either sitemap lacks dates.

## Share image, verification and deployment checks

The original hand-drawn `public/mockingbird_hand.png` is the share image.
Absolute production URLs in `src/index.html` allow unfurling without JavaScript.
Both Mastodon accounts have machine-readable `rel="me"` links in the HTML head,
without visible profile navigation. The features link lives in the app footer,
away from the Home feed header. Verification also requires the Mastodon profile's website
field to link back to `https://mawkingbird.com/`.

After deployment, inspect the actual HTML for `/` and `/features/`, fetch the
image and sitemap, then test new shares in Mastodon and Bluesky. Existing cards
may be cached by the sharing service. Both `sitemap.xml` and `help/sitemap.xml`
should be submitted in Google Search Console; this does not guarantee ranking.
