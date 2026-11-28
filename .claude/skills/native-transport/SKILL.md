---
name: native-transport
description: Keep Mawkingbird Native (the desktop app) working when ui/ code changes how it talks to the network. Use when adding or changing an API endpoint, HTTP method, header, host, upload, download, WebSocket or fetch, or when touching native/ or the Rust host.
---

# Native transport

Native is this same `ui/` inside a webview with no network access
(`connect-src 'self' ipc:`). Each request crosses into Rust, which forwards only what
it explicitly lists. So a new call works on the web and fails in Native, behind a
button that looks finished. 0.1.0 shipped unable to post because of this.

## Rules

- **Never edit `native/`.** It's a generated mirror of the private
  `../mawkingbird_native`, replaced by its `make deploy-source`. Change the host
  there. Run deploy-source only when asked. A new kind of host file (SQL, fixture)
  must be added to the list in `scripts/deploy-source.sh`.
- The allow-lists live in `../mawkingbird_native/src-tauri/src/`:
  `mastodon_write.rs`, `public_mastodon.rs`, `bluesky.rs`, `misskey.rs`. Any other
  host needs its own typed command.
- **In the same change**, either:
  - extend the list in the private repo (the owner deploys it), or
  - hide the control in Native and add a row to `spec/native-transport-gaps.md`.
    There's no general `isNative()`. The Native build swaps in
    `platform/build/runtime-policy.native.ts`, so inject `RUNTIME_POLICY` (its
    `hostedServices` is `false` in Native). For a feature flag, exclude it in
    `isFeatureAvailableInBuild()` in `platform/build/feature-flags.ts`.
- A button that can only fail is a bug. Don't ship one in either app.
- Media bytes never go through the Plus proxy. Play from the origin.

## Checking

Grep the `.rs` list for the endpoint path or host you added. Say in your report which
branch you took. Changelog entries name only what works in Native (native-release
skill).
