# Parity TODO: 2026-11-16

Owner-approved items from the [Sengi/Pachli](sengi_pachli_parity.md), [Whalebird](whalebird_parity.md), [Moshidon](moshidon_parity.md) and [Tokodon](tokodon_parity.md) reports. Each item links back to its full write-up, which explains *why*. This page explains *what* and *where*.

## Handoff: read this first

### Where the code lives

| Repo (all under `C:\github\mimb`) | What | Used by items |
| --- | --- | --- |
| `mawkingbird/ui` | The one maintained Angular client, shared by web and native. Routes, UI, `Api`, tests. | all |
| `mawkingbird_native/src-tauri` | Rust host for the Tauri desktop and Android builds. Typed IPC commands, network policy, OS credential store. | 1, 3, 4, 5, 6, 10 |
| `mawkingbird/native` | **Generated mirror. Never edit.** It is overwritten by `make deploy-source` in `mawkingbird_native`. | — |
| `mastodon_mock` | Mock Mastodon server used by `make test-integration` (from its PyPI wheel, never the sibling checkout). | 2, 7, 8 |

### How web and native differ in the UI

- The native build is the `native` configuration in `ui/angular.json`. It swaps three files through `fileReplacements`: `platform/build/runtime-policy.native.ts`, `platform/http/platform-http.native.ts` and `platform/session/platform-login.native.ts`.
- **Pattern for native-only features:** an `InjectionToken` that is `null` on web and a real implementation on native. Examples are `NATIVE_SOCIAL`, `PLATFORM_CONNECTORS` and `PLATFORM_FEED_READ`. A component hides its control when the token is `null`. Follow this pattern; don't check `navigator`/`window.__TAURI__` in components.
- **Visibility rule** ([sprint 10](../../mawkingbird_native/sprint/10-local-archive.md)): native-only menu entries, routes, settings rows, help text and upsells must never appear on web. Test both builds for every new route or settings row.

### How the native side works

- Rust commands are registered in `src-tauri/src/lib.rs` (`generate_handler!`) and allowed in `src-tauri/capabilities/main.json`. A new command needs both.
- The renderer never gets raw network access. Rust validates destination, method and body, pins DNS, blocks private addresses (except exactly `mastomini.local`) and bounds the response. The destination policy currently lives in `src-tauri/src/public_mastodon.rs`. Items 1 and 5 change that policy, so do them in one design pass.
- Secrets go in the OS credential store only. The renderer sees an opaque reference, never the secret.
- Read [`mawkingbird_native/spec/roadmap_and_plan.md`](../../mawkingbird_native/spec/roadmap_and_plan.md) § “Architecture to preserve” before touching Rust.

### Rules that apply to every item

- **Leave everything uncommitted** for the owner. Work on `main`; no feature branches. Use Git Bash and Make targets (see [`mawkingbird/AGENTS.md`](../AGENTS.md)).
- **Notifications stay light:** no push, sounds or app-icon badges, even where an item touches notifications (2, 7).
- **••• menu budget:** at most 10 entries per post or profile menu (`ui/src/app/menu-budget.ts`). Items 6 and 10 add media actions, so check `menu-budget.spec.ts`.
- **i18n:** user-visible strings use the `// i18n key: English text` comment convention plus Transloco keys, as the surrounding files do. Run `make i18n` (in `ui/`) after adding keys.
- **New `localStorage` keys** must be registered in `ui/src/app/platform/storage/storage-registry.ts` with a sensitivity class, because settings export depends on it. There is a gate that fails if you forget.
- **Native unsafe budget:** one Windows-only COM block in total. Prefer safe `windows` crate bindings (item 4).

### Testing and gates (from `mawkingbird/AGENTS.md`)

- While working: `cd ui && make test-changed` (or `npm run test:subset -- <spec>`), and `npx prettier --check` / `ng lint --lint-file-patterns` on touched files.
- Native while working: `cd mawkingbird_native && make check-host test-host`, plus the relevant `make smoke-*-frontend` target. Build the native frontend with `MAWKINGBIRD_SOURCE=../mawkingbird make frontend`.
- **Full gates once at the end, not per edit**, cheapest first: static checks → `cd ui && make test` → `npm run build:mockingbird` → native `make build-host smoke-host`. Redirect long gates to `log/` and read the summary lines.
- Report exactly which gates passed and which weren't run. Record native evidence in `mawkingbird_native/sprint/00-implementation-evidence.md`.
- **Done means:** checklist complete, tests added, gates green, *and* for native items, an owner check on the real Windows build. Mark the item `done YYYY-MM-DD` here and in its source report, with a short “Implemented:” note, as `phanpy_parity.md` does.

### Suggested order and dependencies

1. **9** (CW hardening): small and self-contained, a good warm-up for the thread code.
2. **2** (moderation warnings): web-only rendering, small.
3. **7** (read position): `Api` + Home.
4. **8** (fetch from original server): touches the thread loader. Do it after 9, because 9's last bullets depend on it.
5. **6 then 10** (image download, then copy image): they share one Rust “fetch an already-shown image” path. Build that path once.
6. **5 and 1 together** (proxy, local AI): both change the Rust destination policy.
7. **4** (OCR): Windows-only Rust work.
8. **3** (update check): a plain check against GitHub releases; no signing keys needed.

### Open decisions for the owner

None open. Settled 2026-11-16:

- **Item 5:** include “Use Windows proxy” as a mode, alongside Direct, Manual HTTP and Manual SOCKS5.

- **Item 3:** no signing keys and no self-installing updater; it's far too early. The check compares versions and links to the release page.
- **Item 7:** read position is **automatic**. No prompt or button; the app has enough buttons.
- **Item 1:** don't try to detect whether a local model can read images. The app can't know what a user wired up. Offer the actions, show the model's error when it fails, and rely on the existing rule that AI text is always shown for review before posting.
- **Cross-account actions** (“Boost as…”, “Reply as…”) are declined. See [`ops/engineering/contributing.md`](../ops/engineering/contributing.md) § “One account acts at a time”.

Out of scope by owner decision: the companion window and pop-out composer (declined), Radio media controls (deferred because Radio has other problems first).

---

## 1. Local AI connector (native) — implemented 2026-11-16, awaiting owner Windows check

Report: [Sengi/Pachli N13](sengi_pachli_parity.md#n13-local-ai-endpoint-as-a-free-openrouter-alternative-implemented-2026-11-16-todo-1-awaiting-owner-windows-check).

**Implemented:** Rust `local_ai.rs`: `local_ai_set_endpoint` accepts exactly `http://127.0.0.1:<port>` or `http://localhost:<port>` (saved in the app config dir); `local_ai_request` allows only `GET /v1/models` and a checked `POST /v1/chat/completions`, pinned to loopback, never through the proxy, and passes the server's own error text through (`not_running`, `timeout`, model errors). UI: `connections/local-ai/local-ai.ts` (model + on/off in `mockingbird_local_ai`, registered), Settings → Connections → Local AI (`settings/connections/local-ai/`, Ollama and LM Studio presets, “Runs on your computer”, no cost/budget/Plus copy). `OpenRouterChat` routes suggestions, completions and image descriptions to Local AI while it is on, with no OpenRouter fallback; AI gates read `OpenRouterSession.ready()` (OpenRouter connected **or** Local AI on). Catalog entry and route exist only when `PLATFORM_LOCAL_AI` is provided (native). Tests: Rust host/port allow/deny, operation allow-list, refused-connection kind; `local-ai.spec.ts`; `make smoke-intelligence-frontend` extended (LAN address refused, Ollama preset, model list, switch on).

Add a connector for an OpenAI-compatible server running on the user's own machine (Ollama, LM Studio, llama.cpp server). It works as a free alternative to OpenRouter for translation, image descriptions and suggestions.

**Code:** the OpenRouter connector is the template. UI: `ui/src/app/connections/openrouter/` (`text-completion.ts`, `openrouter-models.ts`, `openrouter-model-choice.ts`, `openrouter-describe`), settings: `ui/src/app/settings/connections/openrouter/`, AI gating: `platform/build/ai-availability.ts`. Rust: `src-tauri/src/intelligence.rs` (OpenRouter transport), destination policy in `public_mastodon.rs`.

- [x] Settings → Connections → Local AI: the user enters exactly one loopback endpoint (`http://127.0.0.1:<port>` or `http://localhost:<port>`). Provide Ollama (11434) and LM Studio (1234) presets.
- [x] Rust allows only that exact host and port, under its own typed IPC command. No LAN, `.local`, IP-range or other-port access. The `mastomini.local` rule is unchanged.
- [x] Model list from `GET /v1/models`; the user picks one. **Don't** try to detect whether it reads images or is any good: the app can't know what the user wired up (owner decision). Offer translation, suggestions and image descriptions with any model.
- [x] Plug it into the existing AI provider choice next to OpenRouter. Label it “runs on your computer”, apply no budget or cost display, and show no Plus or upsell copy.
- [x] Errors: server not running, model not loaded, timeout, and whatever error the model returns (for example when it can't read images). Show that message as-is in the usual AI error spot. Never fall back to OpenRouter silently. Generated text is always shown for review before posting, which is the existing rule, and covers a model that answers badly.
- [x] Hidden in the web build.
- [x] Tests: Rust allow/deny for host and port variants, and a frontend smoke with mocked IPC (`make smoke-intelligence-frontend`).

## 2. Moderation warnings and severed relationships (web + native) — done 2026-11-16

Report: [Sengi/Pachli item 10](sengi_pachli_parity.md#10-moderation-warnings-and-severed-relationships-done-2026-11-16).

**Implemented:** `feeds/notifications/safety-notice.ts` renders `moderation_warning` (plain sentence per action, the moderator's text, links to affected posts, “Appeal on {server}” → `/disputes/strikes/:id`) and `severed_relationships` (who blocked what, both counts, “Download the list on {server}” → `/severed_relationships`). Both bypass the type and audience filters and never appear under “Accounts new to me”. No push, sound or badge. Model types `AccountWarning` and `RelationshipSeveranceEvent` in `models.ts`. Fixtures live in `testing/safety-notice-fixtures.ts` rather than `mock-api.ts`, which is the mock server's control-plane client, not a fixture store. Tests: `safety-notice.spec.ts`.

These are **end-user** features, not admin tools. Mastodon 4.3+ sends both to the affected user:

- `moderation_warning`: a moderator acted on *your* account (warning, posts deleted, posts marked sensitive, account disabled, silenced or suspended). The payload carries `moderation_warning.action`, `text`, `status_ids` and `appeal`. The appeal itself has no REST API; it's on the server's web page `/disputes/strikes/:id`.
- `severed_relationships`: you lost follows or followers because your admin blocked a server, you blocked a domain, or a remote server was suspended. The payload carries `event.type` (`domain_block`, `user_domain_block`, `account_suspension`), `target_name`, `followers_count` and `following_count`. Mastodon has no REST endpoint for the list of lost accounts; the CSV is on the web page `/severed_relationships`.

**Code:** `ui/src/app/feeds/notifications/notifications.ts` and `.html` (rendering, type handling, filters), notification models in `ui/src/app/platform/api/models.ts`, mocks in `ui/src/app/mock-api.ts`. Payload reference: Mastodon docs, *Notification* entity, `moderation_warning` and `event` (RelationshipSeveranceEvent).

The work:

- [x] Render both notification types instead of dropping them. Show them even when the user's notification filters hide everything else, because these are account-safety notices, not engagement.
- [x] Moderation warning: say plainly what happened, quote the moderator's text, link the affected posts, and add “Appeal on {server}” opening `/disputes/strikes/:id` in the browser.
- [x] Severed relationships: “{server} was blocked by {your admin/you}. You lost N followers and M people you followed”, plus “Download the list on {server}” opening `/severed_relationships`.
- [x] Don't add push, sounds or badges for these. The notifications rule still applies.
- [x] Mock fixtures for both payload shapes in `mock-api.ts`, plus component tests. Older servers just never send them.

## 3. Check for new version (native) — implemented 2026-11-16, awaiting owner Windows check

Report: [Sengi/Pachli N11](sengi_pachli_parity.md#n11-signed-in-app-updates-version-check-implemented-2026-11-16-todo-3-unsigned-link-only-awaiting-owner-windows-check).

**Implemented:** Rust `updates.rs` `check_for_update`: one request to `https://api.github.com/repos/matthewdeanmartin/mawkingbird/releases?per_page=20` (hard-coded; nothing else reachable from this command) through the shared client, 10 s timeout, newest non-draft non-prerelease `native-vX.Y.Z` compared numerically with the app's own version; 403/429 → “Try again later”; release links accepted only on the public repository's GitHub pages. UI: native-only Settings → About and updates (`settings/about/`), button-only, notes and “Open download page” in the system browser. Tests: Rust version comparison (`0.10.0` > `0.9.3`), tag/draft/prerelease filtering, link pinning. Not run: the HTTP error/rate-limit paths against a mocked server (covered by code review only), and Android.

**Owner decision 2026-11-16:** no signing keys and no self-installing updater; it's far too early for that. This is a version check plus a link.

**Code:** settings page `ui/src/app/settings/app/settings-app.ts` (or a new About section, native only). Rust: one typed command that asks GitHub for the public repo's releases. Releases are tagged `native-vX.Y.Z` and published unsigned (`mawkingbird/ops/NATIVE_RELEASE.md`). The current version comes from `tauri.conf.json` / the build info.

- [x] Settings → About: current version, a “Check for updates” button, and the result: “You're up to date”, “Version X is available” with its release notes and an “Open download page” link (opens in the system browser), or “Couldn't check”.
- [x] Rust command: `GET https://api.github.com/repos/<public repo>/releases?per_page=20` with a short timeout. Pick the newest non-draft, non-prerelease tag starting with `native-v`, and compare it as a semantic version. Only `api.github.com` is allowed for this command.
- [x] Only when the user clicks. No background checks, no auto-download, no install. Unauthenticated GitHub API limits (60 requests an hour) are fine for a manual button; on a rate-limit reply, say “Try again later”.
- [ ] Android: same check, same link to the release page.
- [x] Not now (needs keys): `tauri-plugin-updater`, signed installs, app-store channels. Revisit if the product gets users who need it.
- [x] Hidden in the web build.
- [ ] Tests: version comparison (including `native-v0.10.0` > `native-v0.9.3`), ignoring other tags and prereleases, and the error and rate-limit paths with a mocked response.

## 4. Read text in image for alt text (native) — implemented 2026-11-16, awaiting owner Windows check

Report: [Sengi/Pachli N1](sengi_pachli_parity.md#n1-offline-ocr-to-draft-alt-text-windows-implemented-2026-11-16-todo-4-awaiting-owner-windows-check).

**Implemented:** Rust `ocr.rs` (`ocr_available`, `ocr_read_image`) uses `Windows.Media.Ocr` through the `windows` crate's safe WinRT projections: **no new `unsafe`**; the one COM block stays in `windows_network.rs`. Input is the attached file's bytes (base64, 8 MB cap, same raster checks as the image transport); no network. Composer: “Read text from image” (🔤) next to the AI button, only when the recognizer exists, the item is a still image from a file, and the field is empty; never overwrites typed text; note “Read by your computer — check it before posting.” Tests: Rust reads `HELLO WORLD` from `src-tauri/src/fixtures/ocr_text.png` on this Windows machine (skips where no recognizer is installed); `compose-ocr.spec.ts` for the fill rules.

**Code:** composer alt-text handling in `ui/src/app/publishing/compose/compose.ts`. The metadata prefill this should mirror is `ui/src/app/publishing/compose/image-description.ts`. The AI “✨ describe” button is in the same composer, so put OCR next to it. Rust: a new command module (for example `src-tauri/src/ocr.rs`), Windows-only via `#[cfg(windows)]`.

- [x] Windows: `Windows.Media.Ocr` through a typed Rust command. It takes image bytes the user already attached and returns text plus the detected language. Check whether this needs new `unsafe`/COM code against the one-block unsafe budget, and prefer the `windows` crate's safe WinRT bindings.
- [x] Composer: next to each image's alt field, “Read text from image” fills the field when it's empty. Never overwrite typed text. A note says “Read by your computer — check it”, using the same pattern as the metadata prefill.
- [x] No network request is made. Show the button only where the OS recognizer exists. Android ML Kit comes later.
- [x] Tests: Rust unit test on a fixture image with known text, and a frontend test for the fill rules.

## 5. Proxy configuration (native) — implemented 2026-11-16, awaiting owner Windows check and proxy smoke

Report: [Sengi/Pachli N7](sengi_pachli_parity.md#n7-proxy-support-implemented-2026-11-16-todo-5-awaiting-owner-windows-check), [Whalebird W3](whalebird_parity.md#w3-proxy-modes-including-use-the-os-proxy-implemented-2026-11-16-todo-5-awaiting-owner-windows-check).

**Implemented:** Rust `network.rs`, applied inside `public_mastodon::client_for`, which every production client already uses (the other `.no_proxy()` calls are test fixtures). Modes Direct (default, `.no_proxy()`), Use Windows proxy (WinINet `ProxyServer` via `winreg`, read at start-up and on Refresh; `AutoConfigURL` or auto-detect → “automatic proxy script, which isn't supported”), Manual HTTP CONNECT, Manual SOCKS5 (Tor preset). Setting in `network.json` in the app config dir; credentials only in the OS credential store. No direct fallback. Target-host checks unchanged for Direct/HTTP/Windows; **SOCKS5 uses `socks5h` and skips the local DNS lookup** so names don't leak to the local resolver (Tor), which means only literal addresses and `.local`/`localhost` names are checked in that mode — owner to confirm this trade-off. UI: native-only Settings → Network. Tests: Rust per-mode builder, validation, Windows value parsing, SOCKS remote DNS. Not run: a Windows smoke through a real local proxy.

**Code:** every Rust HTTP client builder. `grep -n "no_proxy" src-tauri/src/*.rs` finds them (at least `feeds.rs`, `articles.rs`, `connectors.rs`). Settings UI: a new native-only Settings → Network page under `ui/src/app/settings/`. Credentials go through the existing OS-credential pattern used by connectors.

- [x] Settings → Network: Direct (the default, as today), **Use Windows proxy**, Manual HTTP CONNECT, and Manual SOCKS5 (Tor preset `127.0.0.1:9050`). Owner decision 2026-11-16: include the Windows option.
- [x] Use Windows proxy: read the current user's WinINet/WinHTTP proxy settings when building clients, and show the address in use (“Using proxy.corp:8080 from Windows”). If Windows uses an auto-config (PAC) script or auto-detect, support it only if a safe Rust crate handles it; otherwise say plainly “Windows uses an automatic proxy script, which isn't supported; enter the proxy manually.” Re-read the setting when the app starts and when the user presses “Refresh”, not silently mid-session. Android and other OSes show this option only once implemented there.
- [x] Apply the setting to every Rust client that currently calls `.no_proxy()`, from one shared builder.
- [x] Destination checks still apply to the *target* host. Private-address blocking is unchanged. The proxy address itself is the one allowed loopback/LAN exception.
- [x] Proxy failure is an error. Never fall back to a direct connection.
- [x] Proxy credentials (if supported) go in the OS credential store, never in settings JSON.
- [ ] Tests: client-builder unit tests per mode, and a Windows smoke test through a local proxy.

## 6. Image download (native) — implemented 2026-11-16, awaiting owner Windows check

Report: [Whalebird W6](whalebird_parity.md#w6-desktop-right-click-menu-save-image-copy-link-implemented-2026-11-16-todo-6-awaiting-owner-windows-check), [Sengi/Pachli N6](sengi_pachli_parity.md#n6-save-media-into-a-real-folder-library-extends-existing-download).

**Implemented:** Rust `media_save.rs` `media_save_image` re-fetches through `images::load` (same HTTPS/public-address/format/size rules and cache), opens the OS save dialog (`tauri-plugin-dialog`, which confirms before replacing), sanitizes `{account}_{post id}_{n}` and sets the extension from the bytes; alt text goes into XMP (PNG `iTXt`, JPEG `APP1`) or a `.txt` sidecar for GIF/WebP/AVIF. Right-click: `windows_network.rs` removes WebView2's “Save image as”, “Save link as” and “Open link in new window” inside the existing unsafe block (no new block); Copy, Copy link, Copy image and Paste stay. UI: lightbox “💾 Save image” (native only); the post ••• “Download media…” row saves each picture through the dialog in native; the profile-wide row is not offered in native (bulk is out of scope). Web unchanged. Tests: Rust filename safety, XMP/sidecar, refused hosts and non-images; `image-actions.spec.ts`. Not run: recording today's right-click menu and a Windows smoke saving one image (owner check).

Native blocks WebView downloads, so saving an image must go through Rust.

**Code:** UI: `ui/src/app/posts/lightbox/lightbox.ts`, `ui/src/app/posts/media-download/` (dialog and menu item). Rust: `src-tauri/src/images.rs` (native image transport) and `images.js`. A save dialog needs `tauri-plugin-dialog` (not installed yet) or a Rust-side native dialog. Right-click behavior is WebView2's default context menu.

- [ ] First, record what right-click on an image and a link does in the Windows build today (WebView2 default menu: “Save image as”, “Open link in new window”).
- [x] A typed Rust command saves a media URL the app already displays: it re-fetches through the existing native image transport (same destination checks), then writes with the OS save dialog. No arbitrary URL and no arbitrary path from the renderer.
- [x] Wire it to the lightbox's save action, the existing media-download menu item in the native build, and the right-click menu. Either replace WebView2's “Save image as” with the native path or remove it, and remove “Open link in new window”. Keep Copy, Copy link and Paste.
- [x] Filename: `{account}_{post id}_{n}.{ext}` by default. Never overwrite silently. Write the alt text into the file's XMP description, or a `.txt` sidecar where the format can't carry it.
- [x] Out of scope today: Pachli's per-sender folder library and bulk downloads (N6), and video and audio files.
- [x] Web keeps the existing browser download behavior.
- [ ] Tests: Rust command rejects non-media and unapproved hosts, and a Windows smoke test saves one image.

## 7. Continue where you left off: server read position (web + native) — done 2026-11-16

Report: [Whalebird W1](whalebird_parity.md#w1-sync-read-position-through-the-servers-markers-done-2026-11-16), and [Tokodon](tokodon_parity.md) for the “Last read on {date}” divider.

**Implemented:** `Api.markers()` / `saveMarkers()`; `feeds/home/read-markers.ts` keeps per-account server markers, debounces writes (5 s idle, flush on page hide), never moves backwards, and on 409 re-reads and writes again only if this device is still ahead. `feeds/home/seen-in-viewport.ts` reports a post only once at least half of it was on screen. Home asks for the marker after its first page and, when it is newer than this device's own position, pages older (up to 5 pages) to the marked post, shows “Last read on {date}” above it and scrolls there; otherwise today's behavior, quietly. Retained views (`ReadingHistory`) never re-run this. Opening notifications writes the `notifications` marker; `MenuIndicators.noteServerUnread` uses `unread_count` for the header dot only. Mastodon only; Bluesky/Misskey untouched. The native archive never reads the marker, so its read state stays its own source of truth. `mock-routes.ts` holds Angular page routes, not HTTP fixtures, so marker fixtures are in the specs. Tests: `read-markers.spec.ts`, Home marker cases in `home.spec.ts`.

Use Mastodon's markers API (`/api/v1/markers`) so the last-read spot follows the user across web, native and Android, with no Mawkingbird cloud.

**Code:** `ui/src/app/platform/api/api.ts` (new methods), `ui/src/app/feeds/home/home.ts` and `.html` (prompt, divider, scroll), `ui/src/app/feeds/home/load-more-when-visible.ts` (viewport tracking), `ui/src/app/shell/menu-indicators.ts` (unread indicator). Existing local scroll restoration is described in `mawkingbird/spec/PLAN_B_FOR_SAVE_SCROLL_POSITION.md`; the server marker must coexist with it. Add mock routes in `ui/src/app/mock-routes.ts`.

- [x] `Api`: `GET /api/v1/markers?timeline[]=home&timeline[]=notifications` and `POST /api/v1/markers`. Handle 409 (version conflict) by re-reading, never by overwriting. Add mock routes and fixtures.
- [x] Home: on load, if the server's `home.last_read_id` is newer than the local position, **go there automatically**: load around that post and scroll to it. A divider reading “Last read on {date}” marks the point. Don't add a prompt or button (owner decision 2026-11-16). Newer posts above stay reachable by scrolling up. If the marked post can't be loaded (deleted, too old), fall back to today's behavior quietly.
- [x] Writing the marker: debounced (for example 5 s idle, plus on page hide), and only when posts actually passed the viewport, not merely because they were fetched. Never move the marker backwards.
- [x] Notifications: mark-as-read writes the `notifications` marker, and the menu indicator uses `unread_count` when the server sends it. No badge on the app icon, keeping to the notifications rule.
- [x] Per account: each signed-in Mastodon account has its own markers, with no cross-account leakage. Bluesky and Misskey are unaffected.
- [x] Native archive read state (Sprint 13) treats the server marker as a hint, not its source of truth.
- [x] Tests: marker read/write, debounce, the 409 path, and an account switch.

## 8. Fetch from the original server: missing replies and full follower/favourite/boost lists (web + native) — done 2026-11-16, OFF by default

Reports: [Sengi/Pachli item 2](sengi_pachli_parity.md#2-fill-in-replies-the-home-server-hasnt-seen-from-the-origin-server-done-2026-11-16), [Moshidon M8](moshidon_parity.md#m8-follower-favourite-and-boost-lists-from-the-origin-server-done-2026-11-16).

**Implemented:** `ClientPrefs.fetchFromOrigin` (off by default; part of the prefs blob, so it exports/imports) and its Settings → Privacy row. `reading/origin/origin-reads.ts` is the one helper: derives the origin from the post `uri`/`url` or the account URL, reads through `AnonymousPublicApi`/`externalFetch` (no `Authorization`; native goes through the Rust public transport), 5 s timeouts, null on any failure. Thread loader merges origin-only replies after the home context (`mergeOriginReplies`: dedupe by `uri`, placed under their parent, `originServer` label “From {server} — not on your server yet”); blocked domains (one read of `/api/v1/domain_blocks` per account), locally suppressed and suspended authors stay out. Boost/favourite resolve through `/api/v2/search?resolve=true` first (`StatusActions.resolveOrigin`), reply resolves before the composer opens, and a failure says so; bookmarks of unresolved replies stay local. Remote profiles' Followers/Following (`OriginPeopleSource`) and favourited-by/boosted-by lists read from the origin with a “From {server}” label and quiet home fallback. Tests: `origin-reads.spec.ts` (off = no requests, no Authorization header, 401 fallback, local posts skipped, profile list) and a thread merge test; every existing thread/profile spec runs with the switch off.

Your home server only knows the part of a remote conversation, or of a remote account's lists, that federated to it. This feature reads the rest from the post's or account's own server, anonymously.

**Why it is off by default:** each read is a direct, unauthenticated request from the user's device to a server they didn't choose. It reveals their IP address and what they're reading to that server. Some users won't want that, so they turn it on knowingly.

**Code:** thread loading in `ui/src/app/reading/read/thread-loader.ts` (`loadPublicPost` already resolves remote posts via home-server search and does anonymous public reads). Anonymous reads go through `ui/src/app/accounts/anonymous/anonymous-public-api.ts`, which uses `externalFetch` and strips the token. Profile lists in `ui/src/app/accounts/profile/profile.ts`. Setting in `ui/src/app/settings/privacy/settings-privacy.ts` and `.html`, stored as a signal in `ui/src/app/platform/storage/client-prefs.ts` and registered in `storage-registry.ts`. Native anonymous transport: `src-tauri/src/public_mastodon.rs`.

- [x] **Setting:** Settings → Privacy → “Fetch from the original server”, **off by default**. The hint says, in plain words, what is fetched, that the other server sees your IP address and what you open, and that your sign-in is never sent there. It's a device-level client preference (`ClientPrefs`) and it's included in settings export/import.
- [x] **One shared helper** for origin reads. It derives the origin host from the post or account URL, makes an anonymous request with no `Authorization` header, and uses short timeouts. Fail quietly: a refusal, 401/403 (signed-fetch servers), timeout or CORS failure means fall back to the home server's data, with no error banner. Native uses the existing public-Mastodon transport.
- [x] **Missing replies (thread page):** when the root is remote, fetch the origin's `/api/v1/statuses/:id/context` after the home context renders. Add descendants whose `uri` the home server didn't return, placed by `in_reply_to` and labelled “from {server} — not on your server yet”. Boosting, favouriting or replying to one resolves it through the home server first (`/api/v2/search?resolve=true`); if resolution fails, say so.
- [x] **Remote profiles:** the Followers and Following tabs read the origin server's lists, labelled “from {server}”, so the list matches the count. Hide-collections profiles stay hidden.
- [x] **Remote posts:** the favourited-by and boosted-by lists read from the origin, with the same label and fallback.
- [x] Never send the token to the origin. Never treat origin data as permission to show something the home server refused (blocked domains, suspended accounts and domain blocks still filter the merged result).
- [x] When the switch is off, behavior is exactly as today, with no origin requests at all. A test asserts this.
- [x] Tests: off makes no requests; on merges and dedupes by `uri`; origin failure falls back; blocked-domain replies stay hidden; no `Authorization` header on origin requests. Add mock fixtures for an origin context with extra replies.

## 9. Opening a CW opens the whole thread: harden the existing feature (web + native) — done 2026-11-16

**This already exists.** On the thread page, opening any content warning opens every CW in the thread, and closing one closes them all. That's broader than Moshidon's identical-text rule ([Moshidon M2](moshidon_parity.md#m2-auto-reveal-repeated-content-warnings-in-a-thread-already-supported)), and the owner agreed to keep it that way. The owner marked it important, so make it hold.

**Implemented:** `thread.ts` keeps `threadCwOpen` when the new id is already part of the loaded conversation (`threadIds`) and resets only for a different thread. Origin replies (item 8) are ordinary descendants, so they follow the same state. Radio's listen page now shares one CW state across the post and its comments. Watch's party conversation is a hashtag stream, not a thread, so it keeps per-post CWs. Sensitive-media blur is untouched. Tests: thread CW cases in `thread.spec.ts` and the per-post fallback in `status-card.spec.ts`; Moshidon M2 updated.

**Code:** `ui/src/app/reading/thread/thread.ts` (`threadCwOpen` signal; reset in the `paramMap` subscription, `if (id !== this.currentId()) this.threadCwOpen.set(null)`). `thread.html` passes `[threadCwOpen]`/`(cwToggled)` to each `app-status-card`. In `ui/src/app/posts/status-card/status-card.ts`, `cwCollapsed` reads `threadCwOpen() ?? cwOpen() ?? (feedReader || trusted)`. Added in commit `1aa977e0a` (2026-10-19). There are no spec files for it.

- [x] **Regression tests.** There are none today. Cover these cases: open one CW and its ancestors, the focused post and descendants all open; close one and all close; a per-post toggle still works when no thread state is set; a new thread starts closed.
- [x] **Keep the state while moving within the same thread.** Today, clicking a reply navigates to a new id, and `threadCwOpen` resets to `null`, so the user has to open the CWs again. Reset only when the new post isn't part of the thread already shown (match on the loaded ancestor and descendant ids, or on the root).
- [x] Merged origin-server replies (item 8) obey the same thread-wide state.
- [x] Check the other places that render a conversation (`reading/watch/party-conversation.html`, `reading/radio/listen-page.html`). Where they show a thread, give them the same thread-wide behavior.
- [x] Sensitive-media blur without a CW keeps its own per-post rule; this item is about CWs only.
- [x] Update Moshidon M2 in the report to “already supported” once the tests land.

## 10. Copy image to clipboard (web + native) — web done 2026-11-16; native implemented, awaiting owner Windows check

Report: [Tokodon T2](tokodon_parity.md#t2-copy-image-to-the-clipboard-web-done-2026-11-16-native-awaiting-owner-windows-check).

**Implemented:** `posts/media-download/image-actions.ts`. Web: fetch → PNG (canvas) when needed → `navigator.clipboard.write([new ClipboardItem(...)])`; hidden without `ClipboardItem`/`clipboard.write`; tainted or refused images say “Couldn't copy this image.” Native: Rust `media_copy_image` re-fetches through the image transport and writes RGBA to the OS clipboard (`arboard`); GIFs copy their first frame. “📋 Copy image” is in the lightbox and beside “Copy image address” in the profile photo view; no post ••• entry was added, so the menu budget is unchanged. Tests: `image-actions.spec.ts` (mocked `ClipboardItem`, hidden when unsupported, error path, native path); Rust refused hosts. Not run: native clipboard on the real Windows build.

Copy the image itself, not its address, so it can be pasted into a document or chat.

**Code:** UI: `ui/src/app/posts/lightbox/lightbox.ts` (primary place), `ui/src/app/posts/media-download/` menu, and `ui/src/app/accounts/profile/media/profile-photo-view.ts` (it already has “Copy image address”; add “Copy image” beside it). No `ClipboardItem` use exists anywhere yet. Native: the same Rust fetch path as item 6, plus a clipboard write (`tauri-plugin-clipboard-manager` image support, or Rust `arboard`).

- [x] **Web:** fetch the displayed image, convert to PNG on a canvas when it isn't already PNG (most browsers accept only `image/png` in `ClipboardItem`), then call `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])`. Hide the action where `ClipboardItem` or `clipboard.write` is missing. Cross-origin images that taint the canvas fail with a clear “Couldn't copy this image” message.
- [x] **Native:** the WebView can't fetch remote images directly, so a typed Rust command re-fetches through the image transport (shared with item 6) and writes the image to the OS clipboard. No arbitrary URLs from the renderer.
- [x] Success shows the usual short toast (“Image copied”). Video, GIF animation and audio aren't copied; animated GIFs copy their first frame or the action is hidden, whichever is simpler.
- [x] Fit the ••• menu budget: the lightbox is the primary place; in post menus it goes under “More tools…” if the budget is tight.
- [x] Tests: web unit test with a mocked `ClipboardItem`, hidden when unsupported, and the error path; Rust test that rejects unapproved hosts.
