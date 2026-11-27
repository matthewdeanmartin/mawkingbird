# Mawkingbird for Firefox

A small WebExtension: share the page you're reading, quote a selection, open
Mastodon/Bluesky/Twitter links in Mawkingbird, subscribe to a site's feed, find
its author on the fediverse, and keep a sidebar about the page you're on
(`/panel`: write about it, your posts about it, other people's). Plan and sprints: [spec/firefox-extension.md](../spec/firefox-extension.md).

Plain JavaScript (ES modules; `.mjs` is the same, for Node scripts and tests).
No build step: `src/` is exactly what ships. Nothing here touches `ui/` or
`native/`, and nothing here runs in CI.

```sh
cd extension
make install    # npm ci (web-ext only)
make check      # unit tests, then Mozilla's linter
make run        # a throwaway Firefox profile with the extension; reloads on save
make build      # unsigned .zip in <OS temp>/mawkingbird/extension/
make sign       # signed unlisted .xpi (AMO API keys in WEB_EXT_API_KEY/SECRET)
make harness    # bridge test page at http://localhost:4300/dev/harness.html
```

## Layout

| Path | What |
| --- | --- |
| `src/manifest.json` | Manifest V3, Firefox 140+ |
| `src/background.js` | Right-click menus |
| `src/popup/` | Toolbar popup: actions plus the page's feeds and author |
| `src/lib/page-scan.js` | Reads a page's feeds and fediverse author, only on a popup click |
| `src/lib/links.js` | Every Mawkingbird URL the extension opens; mirrors `ui/src/app/posts/copy-link/deep-links.ts` |
| `src/lib/settings.js` | Which Mawkingbird to open (production, canary, test, localhost) |
| `src/sidebar/` | Mawkingbird's `/panel` for the active tab, following it |
| `src/options/` | Which Mawkingbird; sites you've allowed |
| `src/lib/fetch-guard.js`, `src/lib/bridge.js` | The bridge: what may be fetched for mawkingbird.com, and how |
| `src/bridge/content.js` | Runs on mawkingbird.com; relays the app's requests |
| `src/grant/` | "Let Mawkingbird read example.com?" |
| `client/` | The app's side of the bridge and its protocol (not shipped in the extension) |
| `dev/` | `make harness`: a local page for trying the bridge |
| `test/` | `node --test`, no browser |

## Installing without the store

See [test_plans/firefox-extension-sprint-1.md](../test_plans/firefox-extension-sprint-1.md).
In short: `about:debugging` → This Firefox → Load Temporary Add-on → pick
`src/manifest.json` (gone after a restart), or `make sign` for a signed `.xpi`
that stays installed.

## Known lint warning

`web-ext lint` warns that Firefox for Android 140 lacks
`data_collection_permissions`. The extension is desktop-only (Android has no
sidebar), so the warning stands.
