# Security model

This is a **browser-only** client. There is no backend we operate: the app is a
bundle of static files, and every request goes from the user's browser straight
to a Mastodon instance or a third-party API the user chose. That shapes
everything below.

Two consequences are worth stating plainly, because most security advice for web
apps assumes otherwise:

- **We cannot enforce anything.** Guards (`auth.guard.ts`, `admin.guard.ts`,
  `feature-flag.guard.ts`) are user-experience, not access control. Every
  authorization decision that matters is made by the instance. Never treat a
  guard as a security boundary or add one expecting it to protect data.
- **The origin is the trust boundary.** Everything the app holds — the Mastodon
  bearer token, Bluesky JWTs, connector tokens — lives in this origin's
  `localStorage`. Any script that executes here can read all of it. That is why
  the rules about script injection below are absolute rather than best-effort.

---

## What is in place

### Content-Security-Policy

`src/index.html` ships a CSP as a `<meta http-equiv>` tag, since a static host
cannot set headers. The load-bearing directive is **`script-src 'self'`** — no
third-party origin at all — with no `'unsafe-inline'` and no `'unsafe-eval'`.

`style-src` does need `'unsafe-inline'`: Angular injects component styles as
`<style>` elements at runtime, and removing that requires a per-response nonce
which a static host cannot generate. `connect-src` and `img-src` are wide open
by necessity — the user points the client at an arbitrary instance and
subscribes to arbitrary feeds, so the hosts cannot be enumerated in advance.

`frame-ancestors` cannot be set from a meta tag. **If you deploy somewhere that
can set response headers, add these** — they are the ones a meta CSP cannot
carry:

```
Content-Security-Policy: frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

(The referrer policy is also set via `<meta name="referrer">`, which works
everywhere; the header is belt-and-braces.)

### No inline scripts

`public/boot.js` exists specifically so `index.html` has no inline `<script>`
block. It holds the SPA deep-link restore, which must run synchronously before
the app bundle reads `location`.

The build is also configured with **`optimization.styles.inlineCritical: false`**
in `angular.json`, and that is a CSP requirement, not a performance preference.
With critical-CSS inlining on, Angular emits the real stylesheet as

```html
<link rel="stylesheet" href="styles-….css" media="print" onload="this.media='all'" />
```

That `onload` is an inline event handler. `script-src` blocks it (as
`script-src-attr`), the stylesheet is never promoted from `media="print"` to
`media="all"`, and **the app renders with only the small inlined critical CSS** —
badly broken, with nothing in the console but one CSP message. If you ever turn
optimization settings back to defaults, check the rendered page, not just the
build log.

### Analytics: vendored, and genuinely optional

GoatCounter's `count.js` is **served from our own origin**
(`public/vendor/count.js`), not from `gc.zgo.at`. A third-party script tag is a
standing grant of full read access to this origin's `localStorage` — every
token the app holds — and the failure mode that matters is not the vendor
turning malicious. It is the vendor going out of business and the domain being
re-registered by someone who noticed how many sites still point a `<script>` at
it. A lapsed analytics domain is a cheap way to buy a lot of credentials.

Vendoring makes that a non-event and is what lets `script-src` be `'self'` with
no exceptions. The cost is staleness, which `scripts/vendor-analytics.mjs` pays:
it refetches on every build (`prebuild` / `prebuild:mockingbird` hooks), writes
only when the content actually changed, and stamps the file with source, date
and hash — so an upstream change lands as a reviewable git diff instead of
silently. A failed fetch keeps the committed copy and warns rather than breaking
an offline or sandboxed build.

The opt-out (`ClientPrefs.analytics`, on the login page and Settings → Blue) is
a real one: when it is off, `analytics-tracker.ts` never injects the script, so
nothing is fetched, executed, counted or sent. A checkbox that only suppressed
`count()` calls would still be running someone else's code. Because the script
is injected lazily on the first counted page view, a visitor who has opted out
never pays for it at all.

### Rendering other people's content

Every `[innerHTML]` binding of remote content is sanitized by Angular's built-in
HTML sanitizer. **There is not a single `bypassSecurityTrust*` call in the
codebase, and `DomSanitizer` is never imported.** The helpers that build HTML
strings (`markdown.ts`, `status-card.ts`'s `compactContentLinks`,
`rss-adapter.ts`, `conversations.ts`'s `stripped`) all work through `DOMParser`
and return plain strings that are re-sanitized at the binding.

Content that we generate from user text (`compose/status-text.ts`, the paste
providers' `status()` methods, `message-payload.ts`) HTML-escapes before
interpolating into markup, so it is safe even before Angular's sanitizer runs.

### Not leaking the Mastodon token to third parties

The app talks to many hosts, and only one of them may see the bearer token. Two
`HttpContextToken`s mark the exceptions and `auth.interceptor.ts` honours them:

- `EXTERNAL_FETCH` (`providers/external-fetch.ts`) — a foreign host: an RSS
  feed, a Bluesky PDS, a pastebin. No token.
- `SEARCH_SERVER_REQUEST` (`search-server.ts`) — the optionally-configured
  second instance used only for search. No token, because the token belongs to
  the primary instance.

Everything else is a relative URL that `server.interceptor.ts` prefixes with the
selected instance.

### OAuth

The Mastodon and Dropbox OAuth flows (`pages/login/login.ts` and
`providers/dropbox/dropbox-session.ts`) use **PKCE (S256) and a `state`
parameter**, generated by the shared helpers in `pkce.ts`.

Neither is optional for a public client:

- `state` binds the callback to the flow _this_ browser started. Without it,
  anyone who can make the user load `/login?code=…` signs them into the
  attacker's account — and everything they then post lands there.
- The PKCE verifier binds the code to this browser, so an intercepted or
  injected code cannot be redeemed elsewhere.

The pending record is **consumed up front** on callback — read and deleted
before anything else happens — so a code is never redeemed twice and a failed
attempt leaves no client credentials behind for a later injected code to use.

The login page also offers an **access level**: full (`read write follow`) or
read-only (`read`). The scope is fixed at app-registration time, so a read-only
choice produces a token the _instance_ refuses to write with — not a
client-side restriction this app could undo. It exists because "should I give a
stranger's web client write access to my account?" is a fair question to want a
real answer to.

Bluesky uses the official `@atproto/oauth-client-browser` instead of the shared
vanilla-OAuth helper. AT Protocol additionally requires PAR and DPoP; the SDK
owns those primitives, token refresh, and the per-DID session store in
IndexedDB. Mawkingbird's localStorage identity stable contains only a profile
and `{ authMethod: "oauth" }` join marker — never the access token, refresh
token, PKCE verifier, or DPoP private key. The public client metadata document
sets `token_endpoint_auth_method` to `none`; there is no client secret in this
static application.

### Credential retention

Connectors authenticated by a pasted long-lived secret (GitHub PAT, Raindrop
test token, or the legacy Bluesky app-password compatibility path) are governed by a user-chosen
retention policy — 30 days, 90 days, or never — set on Settings → Connections
and implemented in `providers/credential-lifetime.ts`. When a credential passes
its limit the connector disconnects and deletes it.

This does not stop a script that runs on this origin from reading a _live_
credential; nothing client-side can. It bounds the window in which there is one
to read, which is the only lever available here.

Dropbox is deliberately exempt: it uses a real OAuth flow with short-lived
online tokens in `sessionStorage`, which expire on their own.

### Storage classification and settings export

`src/app/storage-registry.ts` is the inventory of every key this app writes,
each classified by how dangerous it is to let it leave the browser. It exists
because settings export is aimed somewhere specific: **publishing a setup as a
public gist**. That makes one question into two.

| Tier      | Question it answers                       | Examples                                                  |
| --------- | ----------------------------------------- | --------------------------------------------------------- |
| `secret`  | Would leaking it let someone _act as me_? | tokens, JWTs, paste edit codes                            |
| `private` | Would leaking it tell someone _about me_? | followed tags, muted words, saved searches, home instance |
| `content` | Did I write it and maybe not publish it?  | drafts, DMs, local posts, paste bodies                    |
| `setting` | Is it just a preference?                  | theme, fonts, feature flags, retention policy             |
| `cache`   | Can it simply be refetched?               | instance probes, feed corpus, metrics                     |

The second row is the one that is easy to get wrong, and the reason a plain
secret/non-secret split was not enough. A followed hashtag is not a credential
and never will be — but `#diabetesSufferers` in a published gist is a health
disclosure the user never meant to make.

The registry exposes general `shareable` and `personal` classifications, while
the shipped portable-config format is deliberately narrower: it exports global
settings only and has a small opt-in allowlist for configuration-like private
values. It never includes `secret`, `cache`, or `content`, and an **unregistered
key is refused** rather than allowed — forgetting to classify something can cost
an export, never a leak.

Four credentials used to sit inside otherwise-exportable objects, which made
that classification impossible to express. They are now stored in two halves,
joined only in memory:

| Exportable half            | Secret half                      |
| -------------------------- | -------------------------------- |
| `mastodon_mock_sessions`   | `mastodon_mock_session_tokens`   |
| `mockingbird_bsky_profile` | `mockingbird_bsky_credentials`   |
| `mockingbird_github_user`  | `mockingbird_github_credentials` |
| `mockingbird_pastes`       | `mockingbird_paste_edit_keys`    |

The paste edit code is the one worth remembering: it looked like an ordinary
field on a history record, but it is a bearer capability — anyone holding it can
rewrite or delete that paste. Exporting "my pastes" would have handed out edit
rights to every one of them.

`npm run check:storage` (wired into `make check`) scans the source and fails the
build on any key missing from the registry.

### Smaller things that are already handled

- `window.open` is always called with `'noopener,noreferrer'`, and content links
  are filtered to `http:`/`https:` before opening.
- `anonymous-route-ref.ts` validates the protocol and normalizes to an origin on
  both encode _and_ decode, so a hostile `mention.url` cannot become an
  arbitrary fetch target.
- `account-scope.ts` hashes the active token into storage keys rather than
  embedding it, so a token never appears in a key name.
- The storage inspector (`observability/local-storage-inspector.ts`) reports key
  names and sizes, never values.
- `bug-report.ts` strips the query string from the reported location, and the
  error log is opt-out and shown in full before anything leaves.
- No `eval`, no `new Function`, no `document.write`, no `postMessage` listeners.

---

## Rules for future changes

**Never bypass the sanitizer.** If you find yourself reaching for
`bypassSecurityTrustHtml`, the answer is no. Remote content is hostile by
definition here — it is a social network. If Angular's sanitizer strips
something you need, change what you render, not how you sanitize it.

**Never add an inline `<script>` to `index.html`.** It would force
`'unsafe-inline'` into the CSP (giving up most of its value) or a hash that
silently breaks the page on the next edit. Put it in `public/boot.js`.

**Never widen `script-src`.** Every host on that list can read every credential
the app holds. Adding a CDN, a widget, or a tag manager is a decision to trust
that vendor with all of it. Prefer bundling a dependency over loading it at
runtime.

**Tag every foreign request.** Any new `HttpClient` call to a host that is not
the selected instance must set `context: externalFetch()`. Forgetting it sends
the user's bearer token to a stranger. This is the single easiest serious
mistake to make in this codebase.

**Validate any URL that comes from data.** Endpoints discovered from remote
documents — a DID document's `serviceEndpoint`, an instance's
`configuration.urls.streaming`, a feed's link — are attacker-influenceable.
Require `https:` (or `wss:`) and, where it makes sense, check the host relates
to the thing you are talking to before sending a credential there.

**Use `pkce.ts` for any new OAuth flow.** Do not hand-roll `state` generation or
challenge computation, and never fall back to `Math.random` for either.
Protocol-specific SDKs that own additional proof material are the exception:
AT Protocol OAuth must stay on its official SDK so PKCE, PAR, DPoP, refresh,
and session invalidation remain one security boundary.

**New pasted-credential connectors go under the retention policy.** Implement
`ExpiringConnection`, stamp on write with `stampCredential`, check on read with
`credentialExpired`, and add the session to the `govern([…])` list in
`settings-connections.ts`. Prefer a real OAuth flow with short-lived tokens over
a pasted secret whenever the provider's CORS policy allows it.

**Assume anything in `localStorage` is compromised if a script is.** When
choosing where to put a new secret, `sessionStorage` is better than
`localStorage`, and a short-lived token is better than either.

**Classify every new storage key.** Add it to `STORAGE_KEYS` in
`storage-registry.ts`; `npm run check:storage` fails the build otherwise. If the
key is a mixed bag of a credential and something exportable, split it into two
keys rather than picking a tier for the blob — the whole registry is only as
honest as its worst-classified entry.

**Never put a secret in the same object as exportable data.** That is what made
the four splits necessary. Ask "would I be happy for this whole value to appear
in a public gist?" — if the answer is "yes except for one field", it is two keys.

**Walk storage with `classifyStorageKey()`, never a bare `===` on a base.** Keys
carry runtime suffixes (`_<accountHash>`, `:<host>`); comparing against the base
silently misses every scoped key, and "silently missed" in an exporter means
either a broken export or a leaked one depending on which direction the mistake
runs.

---

## Settings export / import

**See [portable_config.md](./portable_config.md)** for the implemented file
format, global-only scope, runtime credential audit, Pastepile behavior, and
hash-based remote change detection. Account-scoped values remain intentionally
out of scope because token-derived suffixes and differing account sets cannot be
mapped safely between browsers.

The second is probably right, and is best done _before_ a file format ships.

**3. Publishing warnings the tiers cannot express.** `mockingbird_rss_feeds` is
classified `private`, but a private feed URL (Feedbin, Miniflux, Google Alerts)
often embeds an API key in the URL itself — a `secret` hiding inside a `private`
value. Either scan feed URLs for credential-looking query parameters on export,
or warn plainly. Same shape of problem for any future key holding user-supplied
URLs.

**4. A diff/preview before publishing.** For the gist case especially, show
exactly what is about to leave the browser and let the user drop entries. The
registry `note` fields are written to be readable in that UI.

**5. Import is a trust boundary.** An imported file is untrusted input, even
from a gist the user chose. Validate against the registry (refuse unknown keys
and any `secret` tier outright), size-cap values, and never let an import write
a key the classification says is not importable.

## Known gaps

Documented rather than fixed, so the next person does not have to rediscover
them.

- **The vendored analytics copy needs an occasional look.** Resolved as a
  supply-chain risk (see above), but `public/vendor/count.js` is third-party
  code refreshed automatically on build. Read the diff when it changes; that is
  the entire point of vendoring it.
- **`/message/?m=…` renders arbitrary attacker-supplied text as a native-looking
  post on our own origin.** The text is HTML-escaped, so it is not XSS — it is a
  content-spoofing and phishing surface, and it auto-enters anonymous mode for a
  visitor with no session. Worth a clearer "this came from a link" treatment.
- **Streaming sends the access token as a URL query parameter**
  (`streaming.ts`), because the browser WebSocket API cannot set an
  `Authorization` header. The base URL comes from the instance's own
  `configuration.urls.streaming` and is not checked against the instance's host
  or required to be `wss:`.
- **The Bluesky PDS endpoint from `plc.directory` is used verbatim** as the base
  for requests carrying the account's JWT (`bluesky-chat-api.ts`), with no
  scheme check.
- **`accountScopeSuffix()` uses 32-bit FNV-1a.** A collision would let one saved
  account read another's browser-local data. Irrelevant at a handful of
  accounts; a truncated SHA-256 via `crypto.subtle` would remove the question.
- **`ErrorLog.describe` `JSON.stringify`s non-`Error` values**
  (`error-log.ts`), so an `HttpErrorResponse` serializes with its URL and
  response body into text the user may include in a bug report.
- **GitHub connects with a _classic_ PAT**, whose scope we cannot constrain. A
  fine-grained PAT or the device flow would be better if CORS ever permits it.
- **`npm audit` findings are build-toolchain only.** The runtime dependency set
  is Angular, rxjs, emoji-mart, badwords-list, and tslib. Check that this stays
  true before dismissing an advisory.
