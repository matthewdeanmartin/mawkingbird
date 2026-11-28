# Bridge protocol `mawkingbird-extension/1`

How mawkingbird.com asks Mawkingbird for Firefox to read public pages its own
requests can't reach (CORS). Client: [bridge-client.js](bridge-client.js). Spec:
[spec/firefox-extension.md](../../spec/firefox-extension.md), sprint 5.

## Versions and deploy order

The web app and the add-on ship separately (manual production deploys, add-on
updates), so they are often at different versions. Both conversations carry
versions; the record is [../protocol.json](../protocol.json), and
`ui/scripts/check-extension-protocol.mjs` (in `check:static` and `make test`)
fails when any copy drifts from it.

**Rule: bump a version when a message changes shape, and keep accepting the
version before it.** Then either side can deploy first.

| Conversation | Version | What changed | Accepts |
| --- | --- | --- | --- |
| Bridge (`mawkingbird-extension/1`) | 2 | `hello` lists `ops`, `version` and the add-on's `extension` version | 1 (0.5–0.7: `hello` lists nothing; the app assumes 0.7's ops) |
| Panel (`mawkingbird-panel/1`) | 2 | `ready` carries `version`; `page` carries `sidebarVersion` | 1 (0.7.0: no versions) |

What each side does with them:

- The app asks `hello` once. It uses a feature only if the add-on lists it
  (`supports(op)`), so an older add-on's missing feature keeps its old route
  (proxy, Plus) instead of a broken button. Settings → App shows the add-on's
  version and says when it is older than expected.
- The sidebar waits up to 8 s for the panel's `ready`. No `ready` (a site older
  than the sidebar, or mid-deploy) or a panel older than `minPanelVersion`:
  "Mawkingbird is updating…" with **Try again**.
- The panel shows "This sidebar needs a newer Mawkingbird for Firefox" when the
  sidebar is older than `minSidebarVersion`.

## Presence

The content script (`src/bridge/content.js`) runs at `document_start` on
`https://mawkingbird.com/*` (production, canary, test), or on a custom address
the reader allowed in Options. It sets:

```
document.documentElement.dataset.mawkingbirdExtension = 'mawkingbird-extension/1'
```

and posts `{ channel, direction: 'to-page', id: 'ready' }` once.

## Requests

The page posts to its own window, to its own origin:

```js
window.postMessage(
  { channel: 'mawkingbird-extension/1', direction: 'to-extension', id, op, ...fields },
  location.origin,
);
```

`id` is a string of at most 100 characters, unique per request. The answer comes
back the same way with `direction: 'to-page'`, the same `id`, and `result`.

| `op` | Fields | `result` |
| --- | --- | --- |
| `hello` | — | `{ ok: true, protocol }` |
| `fetch` | `url`, `purpose` (`feed`, `article`, `json`) | `{ ok: true, status, finalUrl, contentType, body }` |
| `hasAccess` | `origin` | `{ ok: true, granted }` |
| `requestAccess` | `origin` | `{ ok: true, granted }` after the reader answers the grant window |
| `allSites` | — | `{ ok: true, granted }`: whether "any public site" is on |
| `requestAllSites` | — | `{ ok: true, granted }` after the reader answers the "any public site" window |
| `youtube` | `endpoint` (`search`, `browse`, `player`, `next`), `body` (JSON object, ≤ 64 KiB), `headers` (`[name, value]` pairs) | `{ ok: true, status, body }` |

Failures are `{ ok: false, error, detail?, origin? }`:

- `needs-access`: the reader hasn't allowed `origin`. Offer a button that calls
  `requestAccess(origin)`; the extension opens a small window with Allow / Not
  now. Never call it unprompted.
- `refused`: not a public http(s) address, credentials in the URL, a
  local-network name or private address, an unknown purpose, or a request from
  anywhere but Mawkingbird.
- `network`, `timeout` (20 s): the site didn't answer.
- `type`: the response isn't a type the purpose allows (a feed request that
  returned an image).
- `too-large`: over 5 MiB.
- `unavailable`: no extension, or it didn't answer.

## What the extension does and doesn't do

- GET only, `credentials: 'omit'`, no referrer, no request headers from the page
  (it sets `Accept` from the purpose).
- Redirects are followed; where they end is checked by the same rules, and a
  different site needs its own permission.
- Only the configured Mawkingbird can ask: the background checks the sending
  tab's URL, and the content script accepts messages only from its own window
  and origin.
- Nothing is cached or stored by the extension. The app decides what to keep.

## YouTube

`youtube` is the same four anonymous web-client reads Native allows
(`native/src-tauri/src/youtube.rs`): a POST to
`https://www.youtube.com/youtubei/v1/<endpoint>?prettyPrint=false`, no cookies,
no redirects, 8 MiB response cap. Only `X-YouTube-Client-Name`,
`X-YouTube-Client-Version` and `X-Goog-Visitor-Id` headers are accepted; any
other header refuses the request. `player` answers lose `streamingData` and ad
fields. It needs the reader's permission for `https://www.youtube.com`
(`needs-access` names it).

YouTube answers 403 to a request whose `Origin` is the extension's own
(`moz-extension://…`), so a declarativeNetRequest session rule removes `Origin`
from the extension's own requests to `/youtubei/v1/*` (`tabIds: [-1]`), and only
those. Firefox applies it; the extension never sees request headers. Verified in
Firefox 160: 200 with the rule, 403 without; tabs keep their Origin.
