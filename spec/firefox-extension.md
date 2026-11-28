# Firefox extension: Mawkingbird for Firefox

Status: sprints 1–6 committed; sprints 7–8 built, uncommitted · 2026-11-27.
Extension 0.8.0: 48 unit tests, `web-ext lint` 0 errors. Owner dogfooding next
(weeks, especially YouTube); no store submission before that.
Code: `extension/` (its own `package.json` and `Makefile`) plus the web changes
listed per sprint. Owner decisions are in the next section.

## What it is

A small WebExtension that puts Mawkingbird beside whatever page you are reading,
and later carries the requests a web page cannot make. Two layers:

1. **Companion** (sprints 1–4). Share, quote, "Open in Mawkingbird", feeds and
   authors, and a sidebar about the page beside it (`/panel`). Every action opens
   a Mawkingbird URL; the extension holds no account, token or post data.
2. **Bridge** (sprint 5, extension side only). A content script on
   mawkingbird.com that lets the web app ask the extension to fetch a public URL
   the browser's CORS rules block (RSS feeds, articles, webmentions, the
   catalogues Native carries). It is the browser's version of the
   `PLATFORM_FEED_READ` / `PLATFORM_ARTICLE_READ` seams in
   `ui/src/app/platform/http/platform-http.ts`. The app side is a later, separate
   change (see "Web changes waiting").

Not in scope: notifications or badges of any kind, using the reader's Twitter
session or any site's cookies, uploads, OCR, local AI, Hugo, file saving (those
stay Native), and a bundled copy of the Angular app.

## Owner decisions (2026-11-26)

- Host access is **asked per site**, at the moment it is needed. Install asks
  only for mawkingbird.com.
- ~~The sidebar is the Lite composer~~ (superseded the same evening): the sidebar
  is **about the current page only**. Write about it, see where you already
  posted about it, see who else is talking about it. The rest of Mawkingbird in a
  sidebar is a distraction.
- **Posts about this page** must work for untrending links (nearly all of them):
  search is the fallback. "Is it trending" is rare and not worth its own place.
- **Finding your own post about a page** must be API-cheap: one search, never a
  scan of the reader's posts.
- YouTube is the first special case: post a video, then watch it with the replies
  to that post as its chat (sprint 4).
- **Firefox first.** Manifest V3, standard `browser.*` APIs; Firefox-only APIs
  (`sidebarAction`) stay in one place so a Chrome port swaps them for
  `sidePanel`.
- Code is **public** in this repo under the repo's MIT licence. A later "updates
  cost money" licence remains possible for future versions; it is not planned.
- **Free** on addons.mozilla.org (AMO) with a Contribute link; it is a
  distribution channel, not a product. Any paid features would be on the
  Mawkingbird account, never a licence check in the extension.
- The app will offer the extension beside Install Native in Settings → App
  (web change, waiting).

## Design rules

- **No build step.** The files in `extension/src/` are what ships, so AMO
  reviewers and readers see the real source. Plain ES modules; no framework,
  no bundler, no remote code.
- **No secrets in the extension.** It never reads mawkingbird.com storage, never
  holds a token, and the bridge always fetches with `credentials: 'omit'`.
- **Deep links mirror the app's matchers exactly.** `extension/src/lib/links.js`
  follows `ui/src/app/posts/copy-link/deep-links.ts`. A URL the app would not
  resolve gets "Posts about this link", not a dead end.
- **One origin setting.** Production `https://mawkingbird.com` by default;
  Options can switch to the `/test/` deployment or a localhost dev server, for
  testing against `ng serve`.
- **Copy says Twitter**, never X; `x.com` appears only as a hostname in code.
- Formatting is never a gate. `web-ext lint` and `node --test` are the checks;
  neither runs in CI (no workflow changes).

## Sprint 1: scaffold and companion actions

- [x] `extension/` with `package.json` (dev dependency `web-ext` only), a Git
      Bash `Makefile` (`make test lint run build`), `.gitignore`, README.
- [x] Manifest V3, gecko id `mawkingbird@mawkingbird.com`, Firefox 140+,
      `data_collection_permissions: none`. Permissions: `contextMenus`, `tabs`,
      `storage` (sprint 2 adds `activeTab`, `scripting`). Host access: none.
- [x] Right-click menus:
  - page: **Share this page**, **Posts about this page**, and **Open in
    Mawkingbird** when the page is a Mastodon, Bluesky or Twitter post or profile;
  - selection: **Quote in Mawkingbird** (quoted text + title + URL);
  - link: **Open link in Mawkingbird** for the same shapes, **Posts about this
    link** for any link.
- [x] Toolbar button and `Alt+Shift+M` toggle the sidebar. (Sprint 2: the
      toolbar button opens the popup instead.)
- [x] Sidebar: Lite in a frame, a strip with Share this page / Posts about this
      page / Open Mawkingbird, and the sign-in check ("Spike" below).
- [x] Options page: which Mawkingbird (production, test, localhost URL).
- [x] Unit tests for the URL builders (`extension/test/`).
- [x] Manual test plan: `test_plans/firefox-extension-sprint-1.md`, including
      installing without AMO.

### Spike: is the sidebar signed in?

The sidebar is an extension page (`moz-extension://…`) framing mawkingbird.com.
Firefox's Total Cookie Protection may give that frame storage separate from a
normal mawkingbird.com tab; if so Lite in the sidebar is signed out. The test plan
checks it. Outcomes:

- **Shared:** keep the frame.
- **Partitioned:** sign in once inside the sidebar (Lite's own sign-in) and check
  it persists across restarts. If that is acceptable, keep the frame and say so in
  the sidebar's first-run text. If not, sprint 2 replaces the frame with a
  "Connect extension" handoff (needs a web change).
- **Refused to frame:** mawkingbird.com sends no `frame-ancestors` today (static
  host). `spec/history/security.md` recommends `frame-ancestors 'none'` if that
  changes; it would need to allow `moz-extension:` for this.

### Known limits found while building sprint 1 (not fixable without web changes)

- `/share` hands the text to the **full** app's Home composer. Lite's quick
  composer (`draftContext="lite-home"`) does not take a handoff, so Share from the
  sidebar shows the full app in the narrow panel. Fix: W-1.
- `/link?url=` uses Mastodon's link timeline (4.3+), which only knows links
  that are trending on the reader's server. Most pages will show nothing yet.

## Sprint 2: what's on this page (built 2026-11-26, version 0.2.0)

Uses `activeTab` + `scripting` only when the reader clicks: no standing access to
any site.

- [x] Toolbar popup (replaces the bare toggle; `Alt+Shift+M` still toggles the
      sidebar): Share this page, Quote the selection (when text is selected),
      Open in Mawkingbird (post/profile pages), Posts about this page, Open the
      sidebar, Open Mawkingbird.
- [x] **Feeds**: `<link rel="alternate">` RSS/Atom/RDF/JSON Feed, deduplicated,
      comment feeds last, at most 5. Each opens `/rss/add?url=<feed>`. With none
      declared, **Look for a feed on this site** opens `/rss/add?url=<page>`
      (Paste a link probes the site itself, so no guessed paths here).
- [x] **Author on the fediverse**: `<meta name="fediverse:creator">` first, then
      `rel="me"` links to Mastodon-shaped profiles; at most 3. Each opens
      `/@user@host`, where the Follow button is. Nothing is followed from the
      extension.
- [x] Right-click: **Subscribe to this site in Mawkingbird** (any page) and
      **Subscribe to this feed in Mawkingbird** (links that look like feeds).
- [x] Page scan split into `collectPageFacts` (serialised into the page; reads
      tags only, capped) and `interpretPageFacts` (pure); both unit-tested.
- [x] Pages Firefox protects (about:, addons.mozilla.org) say so and keep the
      actions that need no reading.
- [ ] Sidebar fallback per the sprint 1 spike result (waiting for the owner's run).

Not run: a real Firefox session. Test plan: `test_plans/firefox-extension-sprint-2.md`.
`package.json` still says 0.1.0 (left alone during the Node 26 upgrade); the
manifest's 0.2.0 is the one Firefox and AMO read.

## Owner feedback on sprints 1–2 (2026-11-26, before a Firefox test of sprint 2)

- Share this page opened Radio's **Share music**. Cause: since 2026-11-16 two
  shell routes share `/share`, and Radio's came first, so the system Share menu,
  Unbird's "post this" and the extension all landed on Radio. Fixed in sprint 3.
- Quote selection: same cause.
- Posts about this link: no left padding under the title; and empty for any
  untrending link, while `/search?q=<site>&type=statuses` finds posts. Fixed in
  sprint 3.
- Look for a feed on a page with none: "blinks" with no feedback. Cause:
  production had not deployed `/rss/add` (the unknown URL redirects Home); and
  the popup said nothing about the page having no feed. The popup now says so.
- The Lite sidebar doesn't make sense; see the owner decisions above.
- Production failed to build after the Angular 22 / Node 26 upgrade (see sprint 3).

## Sprint 3: the page panel (built 2026-11-26, extension 0.3.0)

Web:

- [x] `/share` dispatch: Radio's route has `canMatch: !carriesSharedContent()`, so
      a `/share` carrying `title`, `text` or `url` reaches the share target;
      `?playlist=` and a bare `/share` stay Radio's. Neither address moved.
- [x] `/link` falls back to post search when the link timeline is empty or 404s:
      the full URL, then `host/path` without scheme, `www.`, query or fragment (at
      most two calls, only then). Results carry a note saying they came from
      search; with nothing found, the not-trending sentence offers **Search posts
      mentioning <site>**. Left padding fixed. Shared helper `link-search.ts`.
- [x] `/panel?url=&title=`: outside the shell, no chrome. **Write about this
      page** mounts the compact composer seeded with title and link (autosave slot
      `page-panel`; an unsent post about another page offers Continue / Discard
      instead of silently replacing it). **You posted about this page**: one
      `from:me <url>` search on the home server (a second with `host/path` only if
      the first is empty), Mastodon sign-ins only. Below, the `/link` list.
- [x] Native: no transport change (signed-in GETs already reach the account's
      server; `/api/v2/search` is listed for public reads).

Extension:

- [x] Sidebar shows `/panel` for the active tab and follows it: reloads only when
      the page (not its `#fragment`) changes, after 700 ms, so flicking through
      tabs doesn't fire a burst of calls. The strip shows the site and Open
      Mawkingbird.
- [x] Popup: a page with no declared feed says "This page doesn't list a feed."
      above **Look for one on this site**.

Gate fixes found on the way (from the Angular 22 upgrade, not this work):

- [x] `report-bundle.mjs` reads `browser-stats.json` (Angular 22's name) or
      `stats.json`. This was production's ENOENT.
- [x] `open-app.spec.ts` passes `CanMatchFn`'s new third argument (type error that
      stopped `make test` compiling).
- [x] Lite's budget is now its **total** download (startup + beyond) against
      2,140 kB, the old 990 + 1,150 kB allowance (owner decision 2026-11-26).
      Angular 22 had moved ~56 kB out of startup into shared lazy chunks, failing
      the old beyond-startup budget (1190 kB of 1150) while the total grew 0.36%.
      Now 2124.81 kB: ~15 kB headroom.
- [x] `shell.spec.ts`: Angular 22 renders the rails a tick later, so their
      metadata reads arrived after a test's drain and the leak cascaded through
      44 tests. `afterEach` drains the same rail requests before `verify()`.
- [x] `@angular-eslint/prefer-on-push-component-change-detection` (new in
      angular-eslint 22's recommended set) is off: the migration marked ~900
      components `Eager` on purpose; moving them to OnPush is a behaviour change.
- [x] A route test fails when two sibling routes share a path without a
      `canMatch` to tell them apart (main and Lite tables). It catches the
      `/share` clash when Radio's `canMatch` is removed.

Gates on the final tree: production SEO build (exit 0, SEO checks passed),
`npm run lint`, `make test` (11,522 tests), `check:static`, design inventory.

## Sprint 4: YouTube and your post's replies (built 2026-11-26, extension 0.4.0)

Watch already had what this needed: `/watch?youtube=<id>` plays a video with no
post, `/watch?post=&server=&youtube=` makes that post the watch party's root,
and its **Post replies** chat refreshes on its own timer (5 s to 1 min, or Live)
and skips refreshes while the tab is hidden. So this sprint is wiring:

- [x] On a YouTube video (any link shape, via `youtubeSource`), the panel shows
      **Watch in Mawkingbird** and, once there is a post of yours about it,
      **Watch with replies to your post** (primary). Both open in a new tab.
- [x] "Your post" is the newest `from:me` result or the post just written in the
      panel: no extra call to find it. Before you've posted, the panel says to
      post about the video to get the replies chat.
- [x] Search precision: a YouTube link is searched by its video id (it matches
      youtu.be, watch?v= and shorts links alike); every search result must
      actually contain the link (text or preview card), since Mastodon search
      matches words loosely. A page's own query (`?id=5`) is kept; tracking
      parameters (`utm_*`, `fbclid`, …) are dropped. Applies to `/link` too.
- [x] The sidebar ignores tabs on Mawkingbird itself, so opening Watch leaves the
      video's panel in place.
- [ ] Owner decision (not built): remember your post per URL so a revisit skips
      the search. One search per page shown is cheap; a cache would add a storage
      key. Left out until it proves needed.

Also fixed: `make test-integration` failed on Node 26 (Node 25+'s own global
`localStorage` hid jsdom's); `vitest.integration.config.ts` passes
`--no-experimental-webstorage`. Passes on Node 26 and 24.

Test plan: `test_plans/firefox-extension-sprint-4.md`.

## Owner feedback on sprints 3–4 (2026-11-26, production on sprint 3)

- The page sidebar is much better.
- A YouTube video's "posts about this page" listed every post about youtube.com:
  production still had sprint 3's bare-link search (query dropped). Sprint 4's
  video-id search and must-contain-the-link filter fix it once deployed. The
  owner wants the whole URL first and the site second: the site search is now
  offered after every result list (a link to Search, never run on its own).
- "Look for one on this site" on a YouTube video can't work (a video page lists
  no feed, and the site blocks the browser). On a YouTube video the popup and the
  page right-click now offer **Subscribe to this channel**, which opens the video
  in Watch, whose channel panel subscribes by RSS.
- Share opened Home with its small composer wherever Home was last scrolled, and
  the text was off screen or hidden under the composer. `/share` now opens the
  full composer in a dialog, focused at the top; posting goes Home, closing
  unsent hands the text to Home's composer as before.

## Sprint 5: the bridge, extension side (built 2026-11-26, extension 0.5.0)

- [x] Content script `src/bridge/content.js` on `https://mawkingbird.com/*`
      (production, canary, test) at `document_start`; on a custom address only
      after Options → **Let this address use the extension**
      (`scripting.registerContentScripts`). It marks
      `data-mawkingbird-extension` and relays only its own window's, own
      origin's messages.
- [x] Protocol `mawkingbird-extension/1`: `extension/client/PROTOCOL.md`
      (`hello`, `fetch`, `hasAccess`, `requestAccess`).
- [x] `src/lib/fetch-guard.js`: http(s) only; no credentials in URLs; no
      loopback, private, link-local, CGNAT, multicast or IPv4-mapped private
      addresses (also numeric spellings such as `2130706433`); no `localhost`,
      `.local`, `.internal`, `.home.arpa`, `.lan`, `.corp` or single-label
      names; purposes `feed`, `article`, `json` with their content types.
- [x] `src/lib/bridge.js`: requests only from the configured Mawkingbird tab;
      GET, `credentials: 'omit'`, no referrer, `Accept` set by purpose, 20 s
      timeout, 5 MiB streamed cap, charset honoured. A redirect's destination is
      re-checked, and a different site needs its own permission.
- [x] Asking per site: `requestAccess(origin)` opens `src/grant/` (Allow / Not
      now; `permissions.request` runs in that click). Closing the window answers
      no. `optional_host_permissions: *://*/*`; nothing but mawkingbird.com is
      granted at install. Options lists allowed sites, each with Remove.
- [x] `extension/client/bridge-client.js` for the app (W-3): `extensionPresent`,
      `extensionFetch`, `hasAccess`, `requestAccess`.
- [x] Harness: `make harness` serves `http://localhost:4300/dev/harness.html`.
- [x] Tests: guard, handler (faked fetch and permissions, redirects, types, size,
      network), client and content script end to end in one fake window.

Not run: a real Firefox session (`test_plans/firefox-extension-sprint-5.md`).
Known: Firefox may suspend the background while a grant window waits; the app
should treat `unavailable` after a grant as "check `hasAccess` again".

Known residual risk: DNS rebinding a granted hostname to a private address. Host
permissions are per hostname, so this needs a hostile site the reader already
granted; documented, not mitigated.

## Sprint 6: the app uses the bridge for RSS and articles (built 2026-11-26)

Web only; the extension is unchanged (0.5.0).

- [x] `platform/extension/extension-bridge.ts`: `ExtensionBridge` (`present`,
      `read`, `requestAccess`), the app's copy of `extension/client/bridge-client.js`.
      `requestAccess` re-checks `hasAccess` when the grant window's answer is
      lost. `ExtensionAccessNeeded` carries the site to allow. In Native and in
      browsers without the extension, `present()` is false and nothing is sent.
- [x] RSS feed reads (`RssFetch.buildRequest`): with the extension, the site is
      read through it first. Not allowed yet, or it failed: the ordinary route as
      before (direct, or the proxy the subscription chose). If that fails too and
      the extension only lacked permission, the error says "Mawkingbird for
      Firefox can read <site> if you allow it" and names the site.
- [x] Paste a link (`PasteResolve.probePage`): reads the site's page through the
      extension when allowed. Not allowed, with no proxy to fall back on: "Mawkingbird
      for Firefox can check <site> for feeds if you allow it" instead of "install
      Native". With a proxy, the proxy as before.
- [x] **Let Mawkingbird for Firefox read <site>** beside the error in Paste a
      link and in Settings → RSS's add form. It opens the extension's Allow
      window; yes retries what failed, no says so.
- [x] Article reads (`ArticleFetch`): the extension first for allowed sites, then
      the proxy as before. When expansion is offered is unchanged.
- [x] Native: no change (no content script, so `present()` is false).

Size: startup 934.49 → 936.56 kB (RssFetch is in the startup bundle); Lite total
2126.81 of 2140 kB, about 13 kB headroom.

Gates: `make test` (11,555), production build, integration on Node 24 and 26,
lint and Prettier on touched files, `check:static`, design inventory.
Not run: a real Firefox session (`test_plans/firefox-extension-sprint-6.md`).

## Remaining plan (owner, 2026-11-27)

Sprints are larger from here; each ends with one full gate. Sprints 7 and 8 are
built; then weeks of owner dogfooding, especially YouTube. **Nothing goes to the
store before that.** Sprint 9 (publishing and media) and 10 (Chrome, optional)
after. Decision 1 (an opt-in "any public site" switch): **yes**. Decisions 2
(relaying API keys for connectors), 3 (local AI) and 4 (Chrome in "done") wait
for sprint 9.

## Sprint 7: reading everywhere, and store-ready (built 2026-11-27)

- [x] Reader: expansion is offered with only the extension (no proxy). A read
      the extension wasn't allowed shows "Mawkingbird for Firefox can read
      <site> for you if you allow it" and **Let Mawkingbird for Firefox read
      <site>**; allowing re-reads without using up a manual retry. Nothing is
      cached for that failure.
- [x] Article quota: reads served on the reader's computer (Native, or the
      extension for an allowed site) don't count against the free quota, as
      Native's never did.
- [x] RSS page: the "couldn't load" notice lists up to three failed feeds' sites
      the extension may not read yet, each with Allow, plus **…any public
      site** when several are blocked. Allowing clears those feeds' failure
      cooldowns and reloads.
- [x] "Any public site": Options switch (off by default; `*://*/*` optional
      permission), `allSites` / `requestAllSites` bridge requests, a grant window
      worded for it. The friends'-blogs scan counts the extension as available
      only with it on (per-site asking can't cover hundreds of sites) and offers
      the switch in its dialog. OPML import, starter kits and RSS discovery go
      through RssFetch / Paste a link, which already try the extension first.
- [x] Settings → App: a **Mawkingbird for Firefox** row when the extension is
      detected (and whether it may read any public site). No install link until
      it is on the store.
- [x] ~~Privacy: the sidebar passes the page in the panel URL's `#fragment`~~.
      Wrong: GitHub Pages' 404 redirect re-encodes the fragment into `?spa=…`,
      so it reached the host. Replaced in the follow-up below.

### Follow-up (2026-11-27, extension 0.7.0, owner feedback)

- Production ran the `?url=` panel while 0.6.x sent `#url=`, so the sidebar said
  "Open a web page…" beside every page. And the sentence offered nothing to do.
- [x] The sidebar loads `/panel` once and sends each page by `postMessage`
      (`mawkingbird-panel/1`: panel → parent `ready`; sidebar → panel `page`
      with `url`/`title`, or `url: null`). The panel accepts it only from its
      parent frame on a `moz-extension:`/`chrome-extension:` origin, and updates
      in place: header with the page's title and site, searches re-run, the
      link list re-keyed. No reload, no blink; the page never appears in a URL.
      `?url=&title=` links still work.
- [x] The sidebar's strip (site name, **Open Mawkingbird**) is gone: Mawkingbird
      opens when an action needs the full app, not as a goal of its own.
- [x] A tab with no web page: **Write a post** (unseeded composer) and **Search
      Mawkingbird** (results in a new tab). While waiting for the first page the
      panel renders nothing.
- [x] Share dialog: Close discards the post (cancel means cancel); autosave is
      for a closed browser, not a deliberate cancel.
- [x] Store package (not submitted): `extension/store/LISTING.md`,
      `REVIEWER-NOTES.md`, `extension/CHANGELOG.md`.
- [ ] Owner, before submitting: the data-collection declaration (LISTING.md):
      the sidebar's searches send the page's address to the reader's own
      Mastodon server, which Mozilla may count as browsing activity.
- [ ] Owner: the sidebar sign-in check (sprint 1 test plan, step 4).

## Sprint 8: YouTube without Plus (built 2026-11-27, extension 0.6.0)

- [x] Extension `youtube` request: Native's four anonymous web-client reads
      (search, browse, player, next) to fixed `www.youtube.com/youtubei/v1/*`
      URLs, JSON bodies ≤ 64 KiB, only the three identification headers, no
      cookies or redirects, 8 MiB cap, stream URLs and ads stripped from player
      answers. Needs the reader's permission for www.youtube.com.
- [x] Found by testing against YouTube: it answers **403** to
      `Origin: moz-extension://…` and 200 without an Origin. A
      declarativeNetRequest session rule (`lib/youtube-rule.js`, permission
      `declarativeNetRequestWithHostAccess`) drops `Origin` from the extension's
      own requests to `/youtubei/v1/*` (`tabIds: [-1]`). Replaced a blocking
      `webRequest` listener (2026-11-27, extension 0.6.1, owner request): the
      extension can no longer see any request's headers or cookies. Verified in
      headless Firefox 160 with real YouTube: 200 (29 videos) with the rule, 403
      without; the extension's request arrived with no Origin, a tab's kept it.
- [x] App (`YoutubeFeeds`): after Native and before the Plus proxy. Search,
      channel browsing, video details, chapters and comments work without Plus
      when the extension is there; channel RSS and @handle pages read through it
      too, falling back to the proxy until YouTube is allowed. Search keeps the
      Plus proxy as a fallback for supporters.
- [x] One notice, `YoutubeExtensionAccess`, on Videos, Video search, channel
      pages and Watch: "Let Mawkingbird for Firefox read YouTube"; the page
      reloads what it couldn't read once allowed. Renders nothing without the
      extension or once allowed.
- [x] Tests: the extension's YouTube rules and header policy; the app's search
      through the extension end to end (youtubei.js parsing the answer), feeds
      through the extension and the proxy fallback, the notice.

Size after sprints 7–8: startup 938.03 kB; Lite total 2128.28 of 2140 kB (about
12 kB headroom).

Gates: `make test` (11,584), production build, integration on Node 24 and 26,
`npm run lint`, Prettier on changed files, `check:static`, design inventory.
Not run: a real Firefox session (`test_plans/firefox-extension-sprint-7.md`,
`firefox-extension-sprint-8.md`).

## Version handshake (built 2026-11-27, extension 0.8.0, owner request)

Production lagged a commit behind (manual deploy), and the add-on and the site
each assumed the other was current, so a mismatch surfaced as wrong text with no
explanation. Now:

- [x] `extension/protocol.json` records both conversations' versions;
      `ui/scripts/check-extension-protocol.mjs` (+ tests) compares every copy
      (extension constants, content script, reference client, the bridge's
      handled ops, the app's bridge and panel) and enforces "accept the version
      before", in `check:static` and `make test`.
- [x] Bridge v2: `hello` returns `version`, `ops`, `extension`. The app's
      `ExtensionBridge.supports(op)` gates YouTube, the any-public-site switch
      and the YouTube notice; a v1 add-on (0.7) is assumed to have 0.7's ops and
      is shown as outdated in Settings → App (with its version).
- [x] Panel v2: `ready` carries `version`, `page` carries `sidebarVersion`. The
      sidebar shows "Mawkingbird is updating…" + Try again when no `ready`
      arrives in 8 s or the panel is too old; the panel shows an update note when
      the sidebar is too old. Both accept the previous version (0.7.0's
      unversioned messages).

## Sprint 9 (after dogfooding): publishing and media

- [ ] Bridge returns response headers (webmention discovery reads `Link`).
- [ ] Webmentions: discover and send through the extension.
- [ ] Image bytes for Save with alt text and Copy image where media servers
      block cross-site reads.
- [ ] Decision 2: shorteners, Mataroa, Raindrop, Gist, GitHub as fixed
      per-provider requests carrying the reader's key per request (never stored).
- [ ] Decision 3: local AI on one opt-in loopback address.

## Sprint 10 (optional): Chrome and Edge

- [ ] `sidePanel` for the sidebar, service-worker background, Chrome Web Store.
- [ ] Automated smoke test in real Firefox.

## Web changes waiting (owner to schedule; not during Native 0.3.0)

- **W-1** ~~Lite share~~ Superseded by `/panel`, which has its own composer.
- **W-2** ~~Add a feed by URL~~ **Done 2026-11-26.** `/rss/add?url=<site, feed
  or handle>` redirects to `/rss?add=…`, which opens Paste a link filled in and
  drops `add` from the URL. Nothing is fetched or subscribed until the reader
  presses Continue (resolving one clear feed subscribes, so it must not run on
  arrival). Over 2048 characters is ignored. Tests: `app.routes.spec.ts`,
  `rss-page.spec.ts`, `add-feed-dialog.spec.ts`. No Native transport change
  (Paste a link already uses the Native feed read).
- **W-3** (done in sprints 6–8 for RSS, articles, bulk RSS and YouTube; webmentions in sprint 9) Bridge consumer: when `data-mawkingbird-extension` is present, provide
  `PLATFORM_FEED_READ` / `PLATFORM_ARTICLE_READ` (later YouTube, webmentions,
  Wikidata, SponsorBlock, PeerTube, radio catalogues) from the bridge at runtime,
  keeping the CORS proxy as fallback. Optional feature code stays out of root
  imports; the 1 MB budget is unchanged.
- **W-4** Settings → App: sprint 7 shows the extension's status when detected;
  the "Add to Firefox" link waits for the store listing.
- **W-5** Help page in `docs/` (another developer owns `docs/`; coordinate).

## Release (owner)

1. Mozilla developer account; pick the AMO name and listing text (client first:
   "Read and share to Mastodon and Bluesky from any page").
2. First submission **listed** on AMO with the Contribute link. Self-distributed
   (unlisted) signing is for testers: `make sign` with AMO API keys.
3. Add a `extension/CHANGELOG.md` at the first release; versioning independent
   of the web app and Native.
