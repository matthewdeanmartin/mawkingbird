# Firefox extension: Mawkingbird for Firefox

Status: sprint 1 built, uncommitted · 2026-11-26 (11 unit tests pass; `web-ext
lint` 0 errors, 1 accepted Android warning; zip builds). Not run: any real
Firefox session; the owner's test plan and sidebar spike are pending. Sprints
2–3 planned.
Code: `extension/` (its own `package.json` and `Makefile`; nothing in `ui/` or
`native/` changes). Owner decisions are in the next section.

## What it is

A small WebExtension that puts Mawkingbird beside whatever page you are reading,
and later carries the requests a web page cannot make. Two layers:

1. **Companion** (sprints 1–2). Share, quote, "Open in Mawkingbird" and "Posts
   about this page", plus a sidebar showing Lite (`/m/`). Every action opens a
   Mawkingbird URL that already exists; the extension holds no account, token or
   post data.
2. **Bridge** (sprint 3, extension side only). A content script on
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
- The sidebar is the **Lite composer** (`/m/`) for now.
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
      `storage`. Host access: none.
- [x] Right-click menus:
  - page: **Share this page**, **Posts about this page**, and **Open in
    Mawkingbird** when the page is a Mastodon, Bluesky or Twitter post or profile;
  - selection: **Quote in Mawkingbird** (quoted text + title + URL);
  - link: **Open link in Mawkingbird** for the same shapes, **Posts about this
    link** for any link.
- [x] Toolbar button and `Alt+Shift+M` toggle the sidebar.
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

## Sprint 2: what's on this page

Uses `activeTab` + `scripting` only when the reader clicks: no standing access to
any site.

- [ ] Toolbar popup replacing the bare toggle: Share, Quote, Posts about this
      page, Open sidebar, and what the page offers (next two items).
- [ ] **Feeds on this page**: `<link rel="alternate">` RSS/Atom/JSON Feed, plus
      common `/feed`, `/rss.xml` guesses shown as guesses. Until W-2 exists the
      button copies the feed URL and opens Mawkingbird's RSS settings.
- [ ] **Author on the fediverse**: `<meta name="fediverse:creator">` (Mastodon
      4.3 author attribution) and `rel="me"` Mastodon links → Follow opens
      `/@user@host`.
- [ ] Page scan is one pure function, injected with `scripting.executeScript`,
      unit-tested against fixture HTML.
- [ ] Sidebar fallback per the sprint 1 spike result.

## Sprint 3: the bridge (extension side)

- [ ] Content script on the configured Mawkingbird origin only (static match for
      mawkingbird.com; `scripting.registerContentScripts` for test/localhost).
      It marks `document.documentElement.dataset.mawkingbirdExtension` with the
      protocol version and relays `window.postMessage` requests.
- [ ] Protocol `mawkingbird-extension/1` documented in
      `extension/src/bridge/PROTOCOL.md`: `hello`, `fetch`, `requestAccess`,
      `hasAccess`. Messages are accepted only from the page's own window and the
      configured origin.
- [ ] Background fetch guard, unit-tested:
  - GET only; `credentials: 'omit'`; no request headers from the page except
    `Accept`;
  - `http:`/`https:` only; refuses `localhost`, `.local`, `.internal`,
    `.home.arpa`, single-label hosts and literal private/loopback/link-local
    IPv4/IPv6 addresses;
  - per-purpose content types (`feed`, `article`, `json`), 5 MiB cap streamed,
    20 s timeout;
  - only hosts the reader granted (`optional_host_permissions`), checked with
    `permissions.contains` before fetching.
- [ ] **Asking per site**: `requestAccess(origin)` opens a small extension window
      ("Let Mawkingbird read feeds and pages from example.com?") whose Allow button
      calls `permissions.request`. Firefox only accepts that from a click in an
      extension page, which is why it is a window and not a prompt in the app.
      Options lists granted sites with Remove.
- [ ] A dev harness page served on localhost exercises the bridge without the app.
- [ ] `bridge-client.js`: a dependency-free client the app can adopt in W-3.

Known residual risk: DNS rebinding a granted hostname to a private address. Host
permissions are per hostname, so this needs a hostile site the reader already
granted; documented, not mitigated.

## Web changes waiting (owner to schedule; not during Native 0.3.0)

- **W-1** Lite share: `/m/share` (or `acceptHandoff` on Lite Home's composer) so
  shared text lands in the Lite composer.
- **W-2** Add a feed by URL: `/rss/add?url=` (today `?feed=` only selects an
  existing feed).
- **W-3** Bridge consumer: when `data-mawkingbird-extension` is present, provide
  `PLATFORM_FEED_READ` / `PLATFORM_ARTICLE_READ` (later YouTube, webmentions,
  Wikidata, SponsorBlock, PeerTube, radio catalogues) from the bridge at runtime,
  keeping the CORS proxy as fallback. Optional feature code stays out of root
  imports; the 1 MB budget is unchanged.
- **W-4** Settings → App: "Add to Firefox" beside Install Native, shown on
  Firefox, hidden once the extension is detected.
- **W-5** Help page in `docs/` (another developer owns `docs/`; coordinate).

## Release (owner)

1. Mozilla developer account; pick the AMO name and listing text (client first:
   "Read and share to Mastodon and Bluesky from any page").
2. First submission **listed** on AMO with the Contribute link. Self-distributed
   (unlisted) signing is for testers: `make sign` with AMO API keys.
3. Add a `extension/CHANGELOG.md` at the first release; versioning independent
   of the web app and Native.
