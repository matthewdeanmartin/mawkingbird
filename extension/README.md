# Mawkingbird for Firefox

A small WebExtension: share the page you're reading, quote a selection, open
Mastodon/Bluesky/Twitter links in Mawkingbird, and keep Lite (`/m/`) in the
sidebar. Plan and sprints: [spec/firefox-extension.md](../spec/firefox-extension.md).

No build step: `src/` is exactly what ships. Nothing here touches `ui/` or
`native/`, and nothing here runs in CI.

```sh
cd extension
make install    # npm ci (web-ext only)
make check      # unit tests, then Mozilla's linter
make run        # a throwaway Firefox profile with the extension; reloads on save
make build      # unsigned .zip in <OS temp>/mawkingbird/extension/
make sign       # signed unlisted .xpi (AMO API keys in WEB_EXT_API_KEY/SECRET)
```

## Layout

| Path | What |
| --- | --- |
| `src/manifest.json` | Manifest V3, Firefox 140+ |
| `src/background.js` | Right-click menus, toolbar button |
| `src/lib/links.js` | Every Mawkingbird URL the extension opens; mirrors `ui/src/app/posts/copy-link/deep-links.ts` |
| `src/lib/settings.js` | Which Mawkingbird to open (production, canary, test, localhost) |
| `src/sidebar/` | Lite in a frame plus a strip acting on the current tab |
| `src/options/` | The one setting |
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
