# Functional parity with Whalebird

Audit date: 2026-11-16.

This report lists functional capabilities in the local Whalebird checkout that mawkingbird lacks or only partly has, and the Whalebird features mawkingbird should not copy. It follows the [Sengi/Pachli report](sengi_pachli_parity.md), and items covered there or in the [Phanpy](phanpy_parity.md) and [Mastodon web](mastodon_parity.md) reports are not repeated.

## Scope and evidence

- Whalebird: `REFERENCE/whalebird-desktop`, commit `421179093699a82fb9d95ed6df4b200c931d31f3` (2026-10-29). This is the current rewrite: an Electron shell (`main/`, about 250 lines) around a Next.js/React renderer (`renderer/`), using the `megalodon` library for Mastodon, Pleroma, Friendica, Firefish, GoToSocial and Pixelfed. Accounts are stored in IndexedDB through Dexie.
- Mawkingbird web: `mawkingbird/ui` at `ac2116a651f1bdd878488a316fd22ff19d4cd242`, plus the working tree. Mawkingbird Native: `mawkingbird_native` at `3fe7c30d50637093783da1e9d1ecb8e5c016ecbc`.
- This is a source audit; neither app was run against a live account. “Missing” and “partial” mean the same as in the earlier reports.

## Overall finding

Whalebird is a **small** client. The rewrite dropped much of the older Vue version, and mawkingbird already exceeds it in nearly every functional area: lists, filters, translation, analytics, reading, composing, moderation, Bluesky and Misskey. Its distinctive points are its **Slack-like shell** (an account rail, a channel list of timelines, lists and followed tags, and a detail pane) and **desktop distribution breadth**. Its genuinely useful ideas fit in four items, one of which is already in [today's TODO](parity_11_16.md).

| Band | Items |
| --- | --- |
| A: worth doing | W1 (approved, TODO 7), W2 |
| B: small keyboard polish | W4 |
| C: folded into existing work | W3 (proxy, TODO 5) |
| D: native distribution decision | W5 |
| E: native image download | W6 (approved, TODO 6) |

---

### W1. Sync read position through the server's markers — done 2026-11-16

**Implemented:** automatic jump to the server's home marker with a “Last read on” divider, debounced marker writes, notifications marker. See [TODO item 7](parity_11_16.md).

**Approved by the owner 2026-11-16.** See [today's TODO, item 7](parity_11_16.md).

**Whalebird:** Reads and updates the Mastodon **markers** API (`/api/v1/markers`) for notifications and uses its `unread_count`. The “last read” point is stored on the server, so another client that also uses markers picks up where you left off. Pachli does the same for notifications.

**Mawkingbird:** Keeps read state, scroll restoration and conversation read markers locally (`storage-registry.ts` “Per-conversation read markers”). No call to `/api/v1/markers` was found outside the generated API docs. Reading on the web, then on native, then on Android starts from a different place on each.

**Completion criterion:** For signed-in Mastodon accounts, read the `home` and `notifications` markers on load and offer “Continue from where you left off” in Home. Write the marker (debounced) when the reader actually moves past posts, not merely on fetch. Respect the server's optimistic-locking `version` (409 on conflict: re-read, don't overwrite). Show unread notification counts quietly, without badges on the app icon, in keeping with the notifications rule. This is cross-device sync **without** a Mawkingbird cloud service, which matters given the “cloud last” rule. Native archive read state (Sprint 13) should use the server marker as a hint, not as its source of truth.

Sources: [Whalebird notifications](../../REFERENCE/whalebird-desktop/renderer/components/timelines/Notifications.tsx); [mawkingbird storage registry](../ui/src/app/platform/storage/storage-registry.ts), [Home](../ui/src/app/feeds/home/home.ts).

### W2. Jump palette for every timeline, list and followed tag — partial

**Whalebird:** Ctrl/⌘+K opens a fuzzy “jump to” box listing Home, Notifications, DMs, Local, Public, Favourites, Bookmarks, **every list** and **every followed hashtag** for the current account. Arrow keys and Enter navigate.

**Mawkingbird:** Has `g`-prefixed go-to keys for fixed destinations (`shell/hotkeys.ts`), a shortcut help sheet and search. No quick switcher that reaches a specific list, followed tag, feed or saved search by typing part of its name was found. Mawkingbird has many more destinations than Whalebird (feeds, kits, collections, RSS folders, Radio, settings pages), so a palette pays off even more here.

**Completion criterion:** One shortcut (Ctrl/⌘+K, if it doesn't clash with existing bindings; otherwise `g /`) opens a keyboard-first, screen-reader-labelled palette. It searches the current account's lists, followed tags, pinned and recent feeds, RSS folders and main sections, plus “switch to account …” entries. It uses only already-loaded data and makes no network request per keystroke.

Sources: [Whalebird Jump](../../REFERENCE/whalebird-desktop/renderer/components/Jump.tsx), [timelines layout](../../REFERENCE/whalebird-desktop/renderer/components/layouts/timelines.tsx); [mawkingbird hotkeys](../ui/src/app/shell/hotkeys.ts), [shortcut help](../ui/src/app/shell/shortcut-help/shortcut-help.ts).

### W3. Proxy modes, including “use the OS proxy” — implemented 2026-11-16 (TODO 5), awaiting owner Windows check

**Whalebird:** Settings → Proxy offers no proxy, the system proxy, or manual HTTP or SOCKS with host and port (`set-proxy` IPC in `main/main.ts`).

**Mawkingbird:** This is already [today's TODO, item 5](parity_11_16.md). Whalebird adds one data point: desktop users expect a **“use system proxy”** mode, which the TODO lists as a decision. If adopted, the system proxy still must not bypass Rust's destination checks.

Sources: [Whalebird main process](../../REFERENCE/whalebird-desktop/main/main.ts), [settings](../../REFERENCE/whalebird-desktop/renderer/components/Settings.tsx).

### W4. Switch account with a keystroke — missing

**Whalebird:** Ctrl/⌘+1…9 switches to the Nth account in the account rail.

**Mawkingbird:** Multiple sessions and an account picker exist, but no keyboard account switch was found.

**Completion criterion:** A shortcut (for example `g 1`…`g 9`, to avoid browser tab-switching Ctrl+digits on web) switches to the Nth signed-in account in the picker's order. It's listed in shortcut help and available from the W2 palette. Keep the switch's existing confirmations, such as an unsent draft.

Sources: [Whalebird account layout](../../REFERENCE/whalebird-desktop/renderer/components/layouts/account.tsx); [mawkingbird account picker](../ui/src/app/accounts/sign-in/account-picker/account-picker.ts).

### W5. Desktop distribution channels — decision needed

**Whalebird:** Ships a signed Mac App Store build, Windows Store, NSIS installer, `.dmg`, AppImage, `.deb`, `.rpm`, Snap, Flatpak, AUR and Homebrew cask (`electron-builder.yml`, `electron-builder.mas.yml`, `flatpak-data/`). For many desktop users, “I can install it from my store” *is* the feature.

**Mawkingbird Native:** Publishes unsigned GitHub-release installers (`ops/NATIVE_RELEASE.md`). Windows is the acceptance platform; Linux Docker builds exist, and macOS is deferred.

**Decision:** Pick the channels that match the Windows-first plan before broadening. Candidates are `winget` (free, takes unsigned installers but warns), the Microsoft Store (free developer registration, signs for you), and then Flathub when Linux acceptance happens. Channels interact with [today's TODO, item 3](parity_11_16.md): store builds must not run the self-updater.

Sources: [Whalebird README](../../REFERENCE/whalebird-desktop/README.md), [electron-builder config](../../REFERENCE/whalebird-desktop/electron-builder.yml); [native release runbook](../ops/NATIVE_RELEASE.md).

### W6. Desktop right-click menu: save image, copy link — implemented 2026-11-16 (TODO 6), awaiting owner Windows check

**Approved by the owner 2026-11-16** as native image download. See [today's TODO, item 6](parity_11_16.md).

**Whalebird:** Replaces the browser context menu with a desktop one: Select All, Copy, Cut, Paste, **Save Image As**, **Copy Link**.

**Mawkingbird Native:** Blocks WebView downloads and has no custom context menu. WebView2's default menu probably still shows “Save image as” and “Open link in new window”. Both may fail silently, or trip the navigation and download guards, which would look broken to the user.

**Completion criterion:** Check what right-click on an image, a link and selected text does in the Windows build. If “Save image as” fails, either route it through the native save path ([Sengi/Pachli N6](sengi_pachli_parity.md)) or remove it from the menu. Keep Copy, Copy link and Paste. Never offer “open in new window”, which the pop-up policy denies.

Sources: [Whalebird main process, `context-menu`](../../REFERENCE/whalebird-desktop/main/main.ts); [native host](../../mawkingbird_native/src-tauri/src/lib.rs).

---

## Deliberately not taking

| Feature | Why not |
| --- | --- |
| Slack-style shell: account rail, channel list and a detail pane beside the timeline | Thread and profile panes next to the feed drift toward the declined multicolumn and companion-window layouts. W2 and W4 keep the keyboard speed without the layout. |
| Desktop notifications for follows, favourites, boosts and polls | Notifications rule. |
| Pleroma, Friendica, Firefish, GoToSocial, Pixelfed and Akkoma support through megalodon | Mawkingbird's providers are Mastodon, Bluesky and Misskey. Add a server type for users, not for parity. |
| “Local” (do not federate) visibility for Mastodon forks | Vanilla Mastodon has no such visibility; mawkingbird already offers Misskey's `localOnly`. Revisit only alongside fork support. |
| System font list for the UI font | A small native nicety (Electron `system-font-families`). The reader already offers curated reader fonts; low value next to the backlog. |
| Electron `webSecurity: false`, tokens in IndexedDB | Security anti-patterns. Mawkingbird Native's Rust transport and OS credential store are the deliberate opposite. Don't regress toward them for convenience. |

## Boundaries of this backlog

Visual differences (Tailwind/Material Tailwind styling, the dark theme palette, layout proportions) are excluded. Features Whalebird has and mawkingbird already matches are not listed: multiple accounts, streaming, lists, followed tags, bookmarks and favourites, DMs, follow requests, polls, quotes, emoji reactions where the provider supports them, media description editing, reporting and “open original”. Before closing W1 or W6, verify against a real server and the packaged Windows build respectively.
