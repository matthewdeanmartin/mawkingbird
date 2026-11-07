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

## Trailing slashes and app links

Every public page is published as `<path>/index.html`, so GitHub Pages answers
`/features` with a 301 to `/features/`. `PublicPageUrlSerializer`
(`src/app/public-page-urls.ts`, provided in both `app.config.ts` and
`main.server.ts`) gives links to indexable routes (`seoIndexable` in `data` or
`resolve`, except `seoCanonicalPath` routes such as `/home`) their trailing
slash, and parses the slashed form back to the same route. App routes keep their
form; `/login` is a registered OAuth redirect address.

App routes (`/login`, `/accounts/…`, `/tags/…`, a topic page's `preview`) have
no prerendered file, so crawlers get the SPA fallback's 404. Public page
components import `AppOnlyLinkRel` next to `RouterLink`; it adds
`rel="nofollow"` to such links and keeps a link's own `rel`. A new public
component must import it too: `check-seo-build.mjs` fails on a slashless link
to a public page or a followed link into the app.

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
the registry, translations included, after `/tools/`, `/follow/` and one URL per published starter kit, which
`prepare-seo-index.mjs` appends. `check-seo-build.mjs` compares the finished
list exactly, so a registered tool missing from the sitemap fails the build. The help site
publishes its own. Do not add account feeds or arbitrary remote
posts to the sitemap. Do not use robots.txt blocking as a substitute for noindex.
When adding another public page, keep its client route, server route, sitemap
entry and HTML checks in sync.

## Project pages: About, Funding and About & legal

`/about/`, `/funding/` and `/legal/` (About & legal, formerly `/blog/`) are prerendered by `PublicArticle`
(`pages/features/public-article.ts`), registered only in `main.server.ts`. In the
browser the same URLs belong to the signed-in shell and render the essays as
virtual tweets; the essay text lives once in `pages/docs/public-copy.ts`, so the
indexed copy and the in-app copy cannot drift. Their browser routes carry
`seoIndexable` and the same descriptions (from `seo.ts`), otherwise executing
JavaScript would turn the prerendered page into `noindex`.

These routes sit under the shell's `authGuard`. A fresh visitor (or a crawler
running JavaScript) used to be sent to `/`, which the entry dispatcher turns
into `/home`, so the article vanished. `authGuard` now enters Anonymous for
`/about`, `/funding`, `/legal` and `/credits`, as it already did for public posts,
profiles and tags. Such a visitor skips the welcome modal, exactly like someone
arriving on a shared post link.

`/legal/` was `/blog/` until 2026-11-07; it never held posts. The browser
redirects `/blog` to `/legal`, and `prepare-seo-index.mjs` writes a static
`blog/index.html` that refreshes at once to `/legal/` and names it canonical
(GitHub Pages cannot send a 301). It carries no `noindex`: one signal, the move.
Add any later rename to `MOVED` there; `check-seo-build.mjs` checks the page.

The `...` menu has one reading entry, Help (the help site). The help home's
"More from Mawkingbird" section links About & legal and the project pages, and
the app footer links About & legal next to Privacy.

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

## Topic starter kits: /communities/ (Feed Builder)

"Starter kit" pages for one interest each, one page per topic and language:
`/science-fiction-on-mastodon/`, `/de/science-fiction-auf-mastodon/`,
`/it/fantascienza-su-mastodon/`, and so on, with the hub at `/communities/`
(English). Internally the feature is called Feed Builder; the code lives in
`src/app/pages/feed-builder/`. They differ from the `/follow/` lists: a topic
page adds the hashtags worth following, new local hashtags to help start
("future tags"), people grouped by shelf (YouTube creators, well-known names,
community voices), the servers where the community gathers, questions, and how
people are chosen.

The two hubs target different searches and say so in their titles: `/follow/`
is "Who to follow on Mastodon" (short people lists); `/communities/` is
"Mastodon communities by interest" (hashtags, people and servers). They link to
each other; keep that vocabulary when adding links to them.

### One hub per language

Every language with a topic page has its own hub, listed in
`feed-builder-hubs.json` (path and link label) with its words in
`copy/hub-copy.ts`: `/communities/` (English, every topic in every language),
`/de/mastodon-communities/`, `/fr/communautes-mastodon/`, and so on. A language
hub lists its own pages and links the English hub and its language's tool index.
Hubs are hreflang alternates of one another; each topic page's "All
communities" link and breadcrumb point to its own language's hub, and every tool
index includes `<app-communities-link>`, which links its language's hub once
one exists.

To keep it that way, `feed-builder-registry.spec.ts` fails when a language has
a topic page but no hub (or a hub but no page, or no hub copy), and
`check-seo-build.mjs` fails when a built hub misses one of its pages, a topic
page does not link its language hub, or a tool index does not link its hub.
When the first page in a new language is approved, add its hub entry and copy
in the same change.

### Breadcrumbs

Topic pages and `/follow/<slug>/` are schema.org `CollectionPage`s whose
`breadcrumb` is a `BreadcrumbList` (`src/app/breadcrumbs.ts`): Mawkingbird ›
hub › page. The people are the `mainEntity` list. `check-seo-build.mjs` checks
both trails.

Plant Based Living has approved English (`/plant-based-living-on-mastodon/`)
and German (`/de/pflanzlich-leben-auf-mastodon/`) editions. Its copy explains
the positive-outreach selection and the limits of public hashtag feeds; only
these two editions are registered.

Gardening and Houseplants has approved English (`/gardening-and-houseplants-on-mastodon/`),
German (`/de/garten-und-zimmerpflanzen-auf-mastodon/`) and French
(`/fr/jardinage-et-plantes-interieur-sur-mastodon/`) editions. Useful quiet subject
tags remain followable; activity and sample cautions remain honest. Farming and
animal husbandry are outside this selection. Spanish, Italian and Japanese
were withheld for insufficient strong matches. No dedicated server is listed.

Math has approved English (`/math-on-mastodon/`), German
(`/de/mathematik-auf-mastodon/`) and French (`/fr/mathematiques-sur-mastodon/`)
editions. Research, teaching, puzzles and recreational mathematics are in scope.
Number theory remains selectable; concentration warnings concern individual
authors in hashtag samples, not how many people use Mathstodon. Spanish, Italian
and Japanese did not meet the people floor and have no registered routes.

- **Data** comes from the private data repository's export
  (`mawkingbird_starters/catalog/feedbuilder/`). `make feedbuilder-update`
  imports it into `pages/feed-builder/data/<topic>.<lang>.json`; every field is
  allow-listed, so nothing beyond what the page shows can arrive, and drafts the
  owner has not approved are refused. `npm run feedbuilder:check` (run by every
  `prebuild`) validates the bundle offline and fails when a bundled page has no
  path or a path has no bundled page. Listing rules and curation happen in the
  data repository; this one only renders.
- **Paths** are `feed-builder-paths.json` (topic → language → path), the only
  part that loads with the app. Slugs follow the tool pages' rules (ASCII, in
  the language's folder, CJK pages keep the English slug, never renamed).
- **Words**: each topic's pitch, title, description and questions are in
  `copy/<topic>.ts`; the words every topic shares are in
  `feed-builder-chrome.ts`, one block per language. Both are page copy, not app
  dictionary keys, for the same reasons as the tool pages.
- **Routes** (`feed-builder-routes.ts`) are shared by `app.routes.ts` and
  `main.server.ts`. A resolver loads the page's data, copy and shared words
  lazily; `report-bundle.mjs` keeps them out of the startup bundle. Routes carry
  `lang` and `seoAlternates`, so `<html lang>`, `hreflang`, the language menu
  (`LanguageVersions`) and the sitemap's alternates all agree.
- **A mini-app**, like the focused tools: Home · Builder · Preview · Flooding. Signed in to
  Mastodon, `app.routes.ts` puts a twin of each page in the trimmed shell
  (`feedBuilderSignedInChildren`); the pages are `FOCUSED_APPS` in
  `shell/mode-nav.ts`, so `?next=` sign-in returns to them. Signed out, the
  public page carries its own header with Builder and Preview links and a
  sign-in button. In the Builder (signed in), every hashtag and person has a
  checkbox, ticked by default (`FeedSelection`, in memory), a Follow button,
  and "Follow selected" for each; people are followed through `ImportFollows`
  by handle, so each resolves on the reader's server. Preview
  (`<page>/preview`, client-only, not indexed) is a random sample of the feed
  the page builds, read publicly the way anonymous Home reads (`feed-sample.ts`):
  3 ticked hashtags at 5 posts from the anonymous reading server and 5 ticked
  people at 3 posts from their own servers, one request each by the
  home-server id the page carries. Sources that come back empty are topped off
  from the rest of the selection; 16 requests is the ceiling. Shuffle draws
  another sample; a progress bar shows requests made of those planned. Never
  the reader's Home, and nothing is stored.
  Flooding (`<page>/flooding`, client-only, not indexed) reads up to 8 ticked
  hashtags, 40 posts each (`feed-flooding-check.ts`), and lists any account at
  Feed Doctor's flooding share (a quarter of a sample of 8 or more), with
  exactly two mute choices, 8 hours or permanent, through `LocalModeration`
  (Mawkingbird's own mutes, signed in or anonymous), and the loudest account in
  each hashtag. Creators with a YouTube channel get "Subscribe in Mawkingbird"
  (and "Subscribe to all" on their shelf), which adds the channel to video
  mode's `VideoSubscriptions`; those controls are `@defer`red so the prerender
  never reads browser storage. People link to Mawkingbird's own profile view
  (`/accounts/@user@host`).
- **Prerendered**: everything except the live "N posts this week" line under
  each hashtag (`TagActivity`), which is `@defer`red and read in the browser
  from mastodon.social's public, CORS-open tag history with plain `fetch`.
- **Structured data**: a `CollectionPage` whose `mainEntity` is the `ItemList`
  of people shown.
- **Help and removal** link to the project account inside the app
  (`/accounts/@mawkingbird@mastodon.social`), never to the bare
  mastodon.social URL, which stays `rel="me"` metadata only.
- `check-seo-build.mjs` asserts each page's language, heading, people, tag
  links, help link, hub link, `hreflang` set, visible links to its other
  versions, structured data and the absence of live activity; the hub must link
  every page. `prepare-seo-index.mjs` adds the hub and every page to the
  sitemap with alternates and `lastmod` from the page's own data and copy files.

To add a language to a topic: export it from the data repository, run
`make feedbuilder-update`, add its path to `feed-builder-paths.json`, its loader
to `DATA_LOADERS` (`feed-builder-data.ts`), its copy in `copy/<topic>.ts` and,
for a new page language, its shared words in `feed-builder-chrome.ts`.
To add a topic: the same, plus a `copy/<topic>.ts` and its `COPY_LOADERS` line
(`copy/topic-copy.ts`).

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
the sitemap, its dates and the no-JavaScript links all read it, with the
translations beside it (see Pages in other languages). It is JSON so the Node
build scripts can read it; the English entries ship in the initial bundle
because the routes need their titles and descriptions there.

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

English tools are `focused-tools.json`. A translation stores only what
differs: its path in `tool-translations/paths.json` (by English id) and its
title, description and prerender phrases in `tool-translations/<lang>.json`.
Tab, sign-in, group, sources and tool selector come from the original, and its
id is `<original>-<lang>`. Only the paths load with the app (about a kilobyte
per language), so routes, `hreflang`, the language switch and the sign-in
allowlist know every version; a translated page's title and description
resolve on the way in (`tool-copy.ts`), and each language index resolves its
list the same way. The server and specs use `focused-tools-all.ts` (every
language at once); the scripts use `scripts/focused-tools-registry.mjs`. Never
import `focused-tools-all.ts` into browser code: it would put every language
in the first load.

Each language has a folder: English at the root, German under `/de/`
(`de/mastodon-statistik`), Spanish under `/es/` (`es/estadisticas-de-mastodon`), Portuguese (Brazil) under `/pt/` (`pt/estatisticas-do-mastodon`),
French under `/fr/` (`fr/statistiques-mastodon`), Italian under `/it/` (`it/statistiche-mastodon`), Polish under `/pl/` (`pl/statystyki-mastodona`), Japanese under `/ja/`, Korean under `/ko/`, Traditional Chinese under `/zh-hant/` (a folder is its code in lower case, `languageFolder()`; `hreflang` and `<html lang>` keep `zh-Hant`); the spec enforces it. Slugs are ASCII only and never
renamed. German, Spanish, French, Italian, Polish and Portuguese slugs are words in the language, accents, diacritics and apostrophes dropped;
Japanese, Korean and Chinese pages keep the English slug (`ja/download-mastodon-images`), as
Japanese sites usually do, since romanised Japanese or pinyin is not what anyone searches. The first two German pages briefly lived at the root;
`app.routes.ts` redirects those two old paths.

- **Page copy** (heading, intro, steps, Questions) is written in the page
  itself, one language per file, not in the app dictionaries: it is what search
  engines read, the prerender loads no dictionaries, and each set serves one
  language's readers only. A tool page gets a subclass of its component per
  language (`CrosspostDe`, `CrosspostFr`, same file) with its own
  `<page>.<lang>.html`, which overrides the sign-in return path. Routes and
  prerender find it by name: `TOOL_PAGE_MODULES` (`app.routes.ts`) and
  `toolModules` (`main.server.ts`) list each English page once, and
  `toolComponentName()` adds the language (`zh-Hant` → `ZhHant`). Pages that
  keep a copy file instead (`download-mastodon-images.copy.ts`,
  `language-landing.copy.ts`) are `oneForAll`: one class, every language. The
  Bluesky ⇄ Mastodon and search pages pick their direction or network, and
  their own root, from the registry (`toolPageAt`, `originalPath`): whichever
  English page this one translates.
- **Everything translated inside the page follows the URL**, not the browser:
  the page component provides `provideRouteLanguage()` (`page-language.ts`),
  which pins Transloco to the route's `lang` with `|static` for its whole
  subtree, dialogs included. Google's renderer (an English browser) therefore
  sees a German tool in German. Text built in code uses `routeTranslate()`;
  a bare `TranslocoService.translate()` would ignore the pin. The tools' own
  strings and the app parts they embed get their language in that language's
  dictionary only (`de.json`, `fr.json`, `ja.json`); other dictionaries fall
  back to English there.
- **French copy** says « tu », like the app’s French, and uses Mastodon’s own
  French words (message, signets, abonnés, masquer, avertissement de
  contenu). French spacing: a non-breaking space before `:` and inside « »,
  a narrow one before `; ! ?`, in the text only, never in bindings.
- **Japanese copy** is polite (です/ます), with full-width punctuation, no
  spaces between Japanese words, and マストドン beside Mastodon where people
  search it. `focused-page.css` sets `line-break: strict` and
  `word-break: auto-phrase` under `:lang(ja)` so lines break between
  phrases, not inside words.
- **Korean copy** is formal polite (합니다체) with 회원님, like the app’s ko dictionary, and Mastodon’s Korean terms (게시물, 부스트, 북마크, 팔로워, 뮤트, 차단, 콘텐츠 경고); particles after Latin names follow their Korean reading (Mastodon과, Bluesky와). 마스토돈 sits beside Mastodon on the landing pages. `word-break: keep-all` under `:lang(ko)`, so lines break between words.
- **Italian copy** says « tu », like the app’s it dictionary, and uses its Mastodon words (post, segnalibri, follower, silenziare/riattivare, bloccare/sbloccare, avvisi sul contenuto, preferiti); "boost (ricondivisioni)" on the boosts page. Typographic apostrophes (l’app) in the text.
- **Polish copy** says « Ty » with the capitalised Twój/Cię of direct address, like the app’s pl dictionary, and its Mastodon words (wpis, zakładki, obserwujący, wyciszyć, zablokować, ostrzeżenia o treści, podbicie). Polish declines names (na Mastodonie, z Twittera), so the Bluesky ⇄ Mastodon page writes each direction out rather than interpolating `copy.from`/`copy.to`. Counts read "Zakładki: 5", since the app’s plurals have only one/other and Polish needs three forms. Past-tense second person is avoided because it would fix a gender.
- **Portuguese copy** is Brazilian, like the app’s pt dictionary: você, arquivo, usuário, baixar, celular, and Mastodon’s Brazilian terms (publicação, marcadores, seguidores, silenciar, avisos de conteúdo); "boosts (republicações)" on the boosts page. `hreflang` is `pt`, since there is no European Portuguese version to tell apart.
- **Chinese copy** is Traditional, Taiwan style like the app’s zh-Hant dictionary: polite 您, Mastodon’s own terms (嘟文, 轉嘟, 書籤, 跟隨者, 靜音, 封鎖, 內容警告), a space between Chinese and Latin words, and 長毛象 beside Mastodon on the landing pages. Strict line breaking under `:lang(zh)`. Mastodon tags Chinese posts `zh` while the interface locale is `zh-Hant`, so a landing copy can set `content` for the posting and known language.
- **Turkish copy** uses informal sen and the existing glossary: gönderi, yer imi, takip et, sessize al and engelle. Turkish slugs under `/tr/` omit accents while the copy preserves Turkish characters. Nouns after counts remain singular in both one/other messages. Turkish is already a production app locale, so its language checklist includes the interface-language switch.
- **Vietnamese copy** uses neutral, concise language and the existing glossary: bài đăng, dấu trang, theo dõi, ẩn and chặn. Pages retain English tool slugs under `/vi/`. Count messages use invariant Vietnamese nouns. Vietnamese remains a preview app locale; public tools pin Vietnamese explicitly and the language checklist offers reading/posting/filter settings without an interface-language switch.
- **Swedish copy** uses informal du and the existing glossary: inlägg, bokmärke, tysta, blockera, flöde and innehållsvarning. Swedish slugs under `/sv/` omit å/ä/ö while copy preserves them. The app locale remains preview-only: public tools pin Swedish explicitly, and the language checklist offers reading/posting/filter settings without an interface-language switch.
- **Russian copy** uses informal ты, keeps игнорировать distinct from заблокировать, and explains бусты as репосты. Pages keep English tool slugs under `/ru/`. Count-neutral totals and abbreviated time units avoid incorrect Russian plurals in shared one/other messages. Russian is already a production app locale; its checklist includes the interface switch.
- **Indonesian copy** uses informal kamu/-mu, postingan, markah, bisukan, blokir, tagar and linimasa from the locked glossary, with Indonesian slugs under `/id/`. Count messages keep the same noun form for one/other. Indonesian is already a production app locale, so its language checklist includes the interface switch.
- **Dutch copy** uses informal je, with bericht, bladwijzer, dempen, blokkeren and inhoudswaarschuwing from the existing glossary. Pages use Dutch slugs under `/nl/`. Dutch is already a production app locale, so the language checklist includes its interface-language switch.
- **Hindi copy** uses आप and the existing Hindi glossary, with English slugs under `/hi/`. Hindi remains a preview-only app locale: public tools pin their own subtree to Hindi, while the Hindi language checklist offers known/posting/filter settings without an interface-language switch or a promise of a complete Hindi app.
- **`<html lang>`** follows the page on public (indexable) routes: `Seo`
  publishes the route's `lang` to `PageLanguageState`, which
  `TranslocoLocaleSync` prefers over the interface language. The signed-in
  shell twin is not indexable, so there the interface language keeps the
  document.
- **`hreflang`**: `Seo` writes `<link rel="alternate">` for every language
  version plus `x-default` (English); the sitemap carries the same set as
  `xhtml:link`. `check-seo-build.mjs` asserts both, plus `<html lang>`.
- /tools and the features page list English pages only. Each language's
  index is its folder's own page (`/de/`, `/fr/`, `/ja/`): its title and
  description are `TOOLS_INDEXES` (`seo.ts`), its component
  `ToolsIndex<Lang>` with its own template and headings, and routes,
  prerender, sitemap and SEO checks come from that table and `paths.json`.
  All of them and /tools are one `hreflang` set. Every tool page and index carries `LanguageVersions` in its header: one compact menu (a shared `MbPopover`) whose button names the current language and whose panel links every version, the current one marked. Tool pages read their versions from the registry, indexes from `TOOLS_INDEX_ALTERNATES`, so a new language needs no header edits. The links stay in the document while the menu is closed, so the prerender keeps a crawlable link to each version.
- The tools' own strings are translation keys under `focusedTools.*`. Their
  Invite links come from the page's own route (`toolInviteLink()`), so a
  translated page's Invite stays in its language.
- `translated-pages.spec.ts` renders every non-English entry signed out and
  checks its language, heading, link to the English version, and that every
  sign-in returns to the same page. The route spec loads every page and
  every index and fails on a missing class.

Language landing pages (`mastodon-in-english`, `de/mastodon-auf-deutsch`,
`learn-english-with-mastodon`, `fr/mastodon-en-francais`,
`fr/apprendre-l-anglais-avec-mastodon`, `ja/mastodon-in-japanese`,
`ja/learn-english-with-mastodon`) share `LanguageLanding`: a pitch while signed
out, the reader's language settings as one checklist once signed in (the same
services as Settings → Internationalization; nothing changes before Apply;
only the posting language is written to the server), then the way home. Their
copy, checklist included, is in `language-landing.copy.ts`.

### Adding a language

1. `PageLanguage` (`focused-tools.ts`), its name in itself in `ENDONYMS` (`language-versions.ts`),
   and its words loader in `COPY` (`tool-copy.ts`) and `TOOL_COPY`
   (`focused-tools-all.ts`): one line each.
2. `tool-translations/paths.json` (a slug per tool) and
   `tool-translations/<lang>.json` (title, description, prerender phrases).
3. A `<page>.<lang>.html` and a `<Class><Lang>` subclass for each tool page
   (generate them with the same pattern as the existing ones), and the
   language's entries in `download-mastodon-images.copy.ts` and
   `language-landing.copy.ts`.
4. The index: a `TOOLS_INDEXES` entry (`seo.ts`), `ToolsIndex<Lang>` with its headings and `tools-index.<lang>.html`.
5. The tools' strings in `public/i18n/<lang>.json` (the `focusedTools`,
   `downloadImages`, `mediaDownload`, `focusedNextSteps` groups and the app
   parts the tools embed), then `npm run i18n:extract` and `check:i18n`.
6. Inventory, gates and a live check, as for any page.

To add a mini-app: one entry in `focused-tools.json` (with `sources` if its
directory under `src/app/pages/` is not named after its path), its module and
class in `TOOL_PAGE_MODULES` (`app.routes.ts`) and `toolModules`
(`main.server.ts`), and the tab's `// i18n` label in `shell/mode-nav.ts`. The
route spec fails on a missing page; a missing prerender component throws at
build time.

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

ESP32 and Single-board Computers has approved English
(`/esp32-and-single-board-computers-on-mastodon/`) and German
(`/de/esp32-und-einplatinencomputer-auf-mastodon/`) editions. Microcontrollers,
SBCs, board makers and recurring board projects are in scope. Relevant quiet or
zero-post tags remain followable community seeds. Other languages are withheld.
