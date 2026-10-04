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
analytics or remote-server probes. Only `/features/` receives prerendered page
content. `/` uses the ordinary client entry with its existing anonymous preview
and welcome/login flow; no intermediate marketing page renders during loading,
preview preparation, reloads or account changes. Its social-card tags and identity
links are already in `src/index.html` and are available without JavaScript.
The SEO postbuild copies Angular's `index.csr.html` to the root `index.html`
required by GitHub Pages, preserving the client entry and its head metadata.
The browser bootstraps without hydration. `/features` remains the public
reference, including when JavaScript is disabled.

The features reference is explicitly English and does not imply localized
indexable URLs. Existing app locale choices and script tags are unchanged.
Feature descriptions must reflect shipped capabilities and their account,
deployment or third-party prerequisites. Keep optional catalogue data out of
the root bundle and route guards.

`Seo` updates descriptions, robots, share titles and canonical URLs through
the existing `PageTitleStrategy`. Public routes opt in via `seoIndexable`.
Utilities default to `noindex, follow` after client navigation. The static SPA
fallback initially contains homepage tags; utility URLs do not have individual
prerendered documents or route-specific social cards. The sitemap therefore
contains only `/` and `/features/`. Do not add account feeds or arbitrary remote
posts to the sitemap. Do not use robots.txt blocking as a substitute for noindex.
When adding another public page, keep its client route, server route, sitemap
entry and HTML checks in sync.

The original hand-drawn `public/mockingbird_hand.png` is the share image.
Absolute production URLs in `src/index.html` allow unfurling without JavaScript.
Both Mastodon accounts have machine-readable `rel="me"` links in the HTML head,
without visible profile navigation. The features link lives in the app footer,
away from the Home feed header. Verification also requires the Mastodon profile's website
field to link back to `https://mawkingbird.com/`.

After deployment, inspect the actual HTML for `/` and `/features/`, fetch the
image and sitemap, then test new shares in Mastodon and Bluesky. Existing cards
may be cached by the sharing service. Submit the sitemap in Google Search
Console once access to the domain is available; this does not guarantee ranking.
