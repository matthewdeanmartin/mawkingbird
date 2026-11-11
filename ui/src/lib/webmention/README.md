# webmention

Finding a page's W3C Webmention endpoint from its headers and HTML.

Part of Mawkingbird's in-repo libraries: see `ui/docs/libraries.md`. This folder
must not import the app or another library; `npm run check:libs` enforces it.

**API** (from `index.ts`): `resolveEndpoint(target, linkHeader, html)`, `endpointFromLinkHeader(value)`, `endpointFromHtml(html)`. Pure: no network.

**Used by the app through:** `src/app/connections/hugo/webmention-send.ts` fetches the page and sends the mention.

**Runs on:** ES2022 plus web-platform APIs; no npm dependencies.
