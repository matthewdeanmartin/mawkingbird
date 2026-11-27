# Bridge protocol `mawkingbird-extension/1`

How mawkingbird.com asks Mawkingbird for Firefox to read public pages its own
requests can't reach (CORS). Client: [bridge-client.js](bridge-client.js). Spec:
[spec/firefox-extension.md](../../spec/firefox-extension.md), sprint 5.

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
