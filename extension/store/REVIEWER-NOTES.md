# Notes for Mozilla's reviewers (draft)

- **No build step.** The submitted files are the source: plain JavaScript ES
  modules in `src/`. No bundler, minifier, framework or remote code. Tests in
  `test/` run with `node --test`; `web-ext lint` is clean apart from the Firefox
  for Android minimum-version warning (desktop only: there is no sidebar on
  Android).
- **What runs where.**
  - `background.js`: right-click menus, the bridge handler, grant windows,
    and one declarativeNetRequest session rule (below).
  - `bridge/content.js`: runs only on https://mawkingbird.com/* (and a local
    address only if the user allows it in Options). It relays that page's own
    `postMessage` requests to the background.
  - `popup/`, `sidebar/`, `options/`, `grant/`: extension pages.
- **Host permissions.** None at install except mawkingbird.com (the content
  script). `optional_host_permissions: *://*/*` is requested one site at a time
  from a grant window the user opens by pressing a button, or all public sites
  from an Options switch that is off by default.
- **The bridge** (`lib/bridge.js`, `lib/fetch-guard.js`): GET only (plus the
  four YouTube reads below), `credentials: 'omit'`, no referrer, no page-supplied
  headers, 20 s timeout, 5 MiB cap. Refuses non-http(s) schemes, credentials in
  URLs, loopback/private/link-local/CGNAT/multicast addresses and local names
  (`localhost`, `.local`, `.internal`, `.home.arpa`, `.lan`, `.corp`, single
  labels). Redirect destinations are re-checked. Requests are accepted only from
  tabs on the configured Mawkingbird address.
- **YouTube** (`youtube` op): POST to exactly
  `https://www.youtube.com/youtubei/v1/{search|browse|player|next}`, a JSON body
  ≤ 64 KiB, only the X-YouTube-Client-Name / X-YouTube-Client-Version /
  X-Goog-Visitor-Id headers, no cookies, no redirects. Player responses lose
  stream URLs and ad fields; videos play only through YouTube's embed.
- **`declarativeNetRequestWithHostAccess`** (no `webRequest`): one session
  rule (`lib/youtube-rule.js`) that removes the `Origin` header from requests to
  `https://www.youtube.com/youtubei/v1/*` with `tabIds: [-1]`, i.e. the
  extension's own requests only. YouTube answers 403 to
  `Origin: moz-extension://…`. Firefox applies the rule; the extension never
  sees any request's headers or cookies, and the rule has effect only once the
  user has allowed YouTube. Verified in Firefox 160: the user's tabs keep their
  Origin header.
- **`activeTab` + `scripting`**: when the user opens the toolbar popup, one
  function reads the page's feed links, `fediverse:creator` meta and `rel="me"`
  links, and the selection. Nothing else is read and nothing is injected
  persistently.
- **Storage**: one key in `storage.local`, which Mawkingbird address to open.
