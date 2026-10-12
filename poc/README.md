# YouTube search PoC

Yes: anonymous video and channel search works in JavaScript using **YouTube.js
(`youtubei.js`)**, a client for YouTube's internal **InnerTube** API. No developer
API key, Google login, partnership, or paid Data API calls are configured here.
[Kira](https://github.com/LuanRT/kira) is a full Vue/SABR player example using this
same library, so borrowing its playback stack is unnecessary for RSS + embeds.

## Run

Use Node 22 or a supported newer release and Git Bash on Windows:

```sh
cd poc
make install
make run
```

Open <http://127.0.0.1:8787>. Search videos or channels; **Subscribe** collects
channel RSS links in memory for the current page session; **Watch** opens a
YouTube privacy-enhanced embed. Refresh clears subscriptions. RSS polling and
feed rendering belong to the existing RSS client and are outside this PoC.
Embed availability remains subject to the video's restrictions.

CLI and checks:

```sh
npm run search -- video "Technology Connections"
npm run search -- channel "Technology Connections"
make test    # offline adapter / input / HTTP tests
make smoke   # real anonymous YouTube searches; fails on empty results
```

## Integration seam

`GET /api/search?q=...&type=video|channel` returns a small JSON DTO. Videos include
`id`, `title`, `channel: { id, name, url, rssUrl }`, `duration`, `published`, `url`,
and `embedUrl`. Channel results include `id`, `name`, `url`, `rssUrl`, and
`description`. A missing channel ID produces a null RSS URL, never a feed built
from a display name or handle. Metadata strings such as `published` are display
labels, not dates for sorting.

```text
Browser → our search endpoint → youtubei.js / InnerTube
        ← video metadata + stable UC… channel ID
Subscribe → https://www.youtube.com/feeds/videos.xml?channel_id=UC…
Watch     → https://www.youtube-nocookie.com/embed/VIDEO_ID
```

All InnerTube requests run server-side, resolving browser CORS for this demo.
`getSession()` reuses an anonymous session and disables fetching the JS player;
search doesn't need stream deciphering or a SABR player. Its custom `fetch` is
the seam for routing calls through your existing server-side proxy. No proxy
protocol is assumed or implemented. The browser loads the embed directly.

This PoC shows only the first page of standard video/channel results; it omits
ads, shelves and Shorts, and reports `hasMore` without implementing pagination.
YouTube can return a channel card even with the video filter; the DTO filters
to the requested result type. `Search.getContinuation()` is available when
pagination is needed.

## Client-side / CORS check

Run `make cors` to capture a real library search request and probe its preflight
and response headers from both `http://127.0.0.1:8787` and
`https://mawkingbird.com`. Node does **not** enforce CORS; this is a live HTTP
policy probe, not an executed browser test.

Observed for both origins:

| Request | HTTP status | Access-Control-Allow-Origin |
| --- | --- | --- |
| Normal server-side search control | Success, 20 channel results | Not needed |
| YouTube session bootstrap GET | 200 | Missing |
| www.youtube.com search OPTIONS / POST | 403 / 403 | Missing |
| youtubei.googleapis.com search OPTIONS / POST (anonymous internal key) | 403 / 403 | Missing |
| Either search host, simple text/plain POST | 403 | Missing |

The default JSON request uses `Content-Type`, `X-Goog-Visitor-Id`,
`X-Youtube-Client-Name`, and `X-Youtube-Client-Version`, requiring a browser
preflight. The observed policy doesn't authorize our origins. Even a successful
bootstrap response isn't readable without the allowed-origin header. Avoiding
preflight with text/plain doesn't make a response readable either. `no-cors`
returns an opaque response, with no accessible search JSON. Client JavaScript
also cannot spoof the browser-controlled `Origin` header to youtube.com.

For a browser reproduction, start/restart `make run`, then open
<http://127.0.0.1:8787/cors> and click **Run direct fetch tests** with DevTools
open. It makes direct requests without calling `/api/search`. This page includes
a `no-cors` demonstration. No connected browser was available to execute it in
this environment; HTTP failures can include upstream blocking as well as CORS.

Conclusion: direct search from an ordinary Mawkingbird web page is not viable
with the tested endpoints. You can run `youtubei.js/web` parsing and session
logic in the browser **through a CORS proxy**, or retain the existing server
adapter and ship only the small normalized DTO to the browser. Local session
generation can avoid bootstrap, but cannot grant CORS permission for search.
[The upstream browser guide](https://ytjs.dev/guide/browser-usage) also requires
a proxy (and flags its old example as outdated).

## Feasibility and limits

The live smoke check verifies video and channel searches and stable channel IDs
without cookies or credentials. It does not establish production reliability
or verify actual embed playback. No browser was available for visual verification.
A separate RSS spot check returned HTTP 200 for NASA, but HTTP 404 then 500 for
Technology Connections despite successful search. Preserve subscriptions and
retry/back off on feed failures; a single feed error should not delete a channel.
InnerTube is undocumented and can change;
upstream blocking, throttling, and parser changes remain possible even when
CORS is handled. Keep this behind a small server adapter, cache searches, limit
request rates and concurrency, and let RSS continue working when search fails.
The demo binds to loopback; it is not a production service.

Dependencies and lockfile are isolated here; nothing imports this into `ui/`.

References: [YouTube.js](https://github.com/LuanRT/YouTube.js),
[session configuration](https://ytjs.dev/guide/getting-started),
[custom fetch / proxies](https://ytjs.dev/guide/proxies),
[search and continuation implementation](https://github.com/LuanRT/YouTube.js/blob/main/src/parser/youtube/Search.ts).
