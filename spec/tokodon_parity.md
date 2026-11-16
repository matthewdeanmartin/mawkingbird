# Functional parity with Tokodon

Audit date: 2026-11-16.

This report lists functional capabilities in Tokodon that mawkingbird lacks or only partly has, and the Tokodon features mawkingbird should not copy. It follows the [Sengi/Pachli](sengi_pachli_parity.md), [Whalebird](whalebird_parity.md) and [Moshidon](moshidon_parity.md) reports. Items covered there, or in the [Phanpy](phanpy_parity.md) and [Mastodon web](mastodon_parity.md) reports, are not repeated.

## Scope and evidence

- Tokodon: `REFERENCE/tokodon`, branch `master`, commit `c23b1d79040fdff4f31432cebea223ab97db57da` (2026-11-16). This is KDE's Qt/C++ client with a QML (Kirigami) UI, aimed at the Linux desktop (Flathub, Snap), with a nightly Android build. Evidence comes from the QML pages and menus, `config.kcfg`, `main.cpp`, the `.desktop` file and the autotests.
- Mawkingbird web: `mawkingbird/ui` at `ac2116a651f1bdd878488a316fd22ff19d4cd242`, plus the working tree. Mawkingbird Native: `mawkingbird_native` at `3fe7c30d50637093783da1e9d1ecb8e5c016ecbc`.
- This is a source audit; neither app was run against a live account. “Missing” and “partial” mean the same as in the earlier reports.

## Overall finding

Tokodon is a solid, conventional Mastodon client. Most of its features match things mawkingbird already has (admin and moderation tools, collections, annual report, delete & re-draft, remove follower, scheduling, filters and public feeds of other servers), or items already in the backlog. It mostly **confirms earlier choices**:

- **Act on a post as another account.** Tokodon's post menu has *Reply as…*, *Boost as…*, *Favorite as…*, *Bookmark as…* and *Open as…*. The owner **declined** this on 2026-11-16 ([Sengi/Pachli item 1](sengi_pachli_parity.md#1-act-on-a-post-as-another-signed-in-account-declined-2026-11-16)): it puts every identity one tap from every post and risks publicly linking accounts kept apart on purpose. Users switch accounts instead.
- **Continue reading where you left off**, shared with other clients through the markers API, with a “Last read on {date}” divider in the timeline. This is [today's TODO, item 7](parity_11_16.md). Tokodon's dated divider is a good detail to copy.
- **Boost alt-text reminder** and **ask before boosting**: [Sengi/Pachli item 4](sengi_pachli_parity.md#4-warn-before-boosting-a-post-with-undescribed-media-missing).
- **Proxy with username and password**: [today's TODO, item 5](parity_11_16.md) already keeps credentials in the OS store.
- **`web+ap:` and app-scheme link handling** (`MimeType=x-scheme-handler/web+ap;x-scheme-handler/tokodon`, `Exec=tokodon %u`) and the KDE Purpose share plugin are [Sengi/Pachli N3](sengi_pachli_parity.md#n3-open-fediverse-links-in-the-app-missing) and [N2](sengi_pachli_parity.md#n2-receive-shares-from-other-apps-including-files-extends-phanpy-11). Tokodon is proof that both work on Linux desktops.

Its new contributions are two small items and one engineering practice.

| Band | Items |
| --- | --- |
| A: accessibility | T1 |
| B: small media action | T2 |
| C: engineering practice, not a feature | T3 |

---

### T1. Rebindable keyboard shortcuts — missing

**Tokodon:** Settings includes KDE's shortcuts module (`KirigamiSettings.ShortcutsConfigurationModule`), so every app action's key can be changed or cleared.

**Mawkingbird:** Has a fixed, Mastodon-compatible key map (`shell/hotkeys.ts`, `g`-prefixed go-to keys, `alt+n`, `j`/`k`) and a shortcut help sheet. Keys can't be changed or turned off.

**Why it matters:** Single-letter shortcuts collide with screen-reader browse-mode keys, speech and switch-access tools, and non-QWERTY layouts. WCAG 2.1.4 (Character Key Shortcuts) asks that single-character shortcuts can be turned off or remapped.

**Completion criterion:**
- Settings → App → Keyboard: one switch “Single-key shortcuts” (on by default, as today).
- A table of actions where each key can be changed or cleared, with conflict detection and “Reset to defaults”.
- Stored as a device preference and included in settings export/import.
- The shortcut help sheet shows the user's current keys.
- Later palette work ([Whalebird W2](whalebird_parity.md#w2-jump-palette-for-every-timeline-list-and-followed-tag-partial)) uses the same table.

Sources: [Tokodon configuration view](../../REFERENCE/tokodon/src/qml/Settings/TokodonConfigurationView.qml); [mawkingbird hotkeys](../ui/src/app/shell/hotkeys.ts), [shortcut help](../ui/src/app/shell/shortcut-help/shortcut-help.ts).

### T2. Copy image to the clipboard — web done 2026-11-16; native awaiting owner Windows check

**Implemented:** lightbox and profile photo view “Copy image”. See [TODO item 10](parity_11_16.md).

**Approved by the owner 2026-11-16.** See [today's TODO, item 10](parity_11_16.md).

**Tokodon:** The attachment menu has *Copy Image* next to *Save Image As…*, *Save Video As…*, *Save Gif As…* and *Save Audio As…*.

**Mawkingbird:** The profile photo view can copy an image's *address*. No copying of the image itself was found (no `ClipboardItem` use anywhere).

**Completion criterion:** In the lightbox, and the media-download menu where it fits: *Copy image* writes PNG through `navigator.clipboard.write(new ClipboardItem(…))` on web (where supported; hidden otherwise). On native, it re-fetches through the image transport and uses the clipboard plugin. It shares the fetch path with [today's TODO, item 6](parity_11_16.md) (image download), so both should be built together. Video and audio aren't copied.

Sources: [Tokodon attachment menu](../../REFERENCE/tokodon/src/qml/PostDelegate/AttachmentMenu.qml); [mawkingbird profile photo view](../ui/src/app/accounts/profile/media/profile-photo-view.ts), [media download](../ui/src/app/posts/media-download/media-download-dialog.ts).

### T3. Accessibility tested through the real accessibility tree — practice to consider

**Tokodon:** Its autotests include Appium tests (`src/autotests/appiumtests/`) that drive the app through the platform accessibility tree, plus model tests for the admin tools (`iprulestooltest.cpp`, `emailblocktooltest.cpp`, `federationtooltest.cpp`).

**Mawkingbird:** Has a large unit suite, design-system Playwright checks and integration tests against `mastodon_mock`. Native has WebView2 smoke tests. Not checked here: whether any test asserts what a screen reader would announce in the packaged native app.

**Suggestion, not a backlog item:** When native acceptance work resumes, add a few Playwright accessibility-tree snapshots (`page.accessibility` or `@axe-core/playwright`) for the post card, composer and thread pages, so new native-only controls (OCR button, proxy settings, update check) get accessible names from day one.

Sources: [Tokodon autotests](../../REFERENCE/tokodon/src/autotests/).

---

## Already covered elsewhere

| Tokodon feature | Where it stands |
| --- | --- |
| Reply, Boost, Favorite, Bookmark and Open as… another account | **Declined** ([Sengi/Pachli item 1](sengi_pachli_parity.md#1-act-on-a-post-as-another-signed-in-account-declined-2026-11-16)): identity-linking risk; switch accounts instead. |
| Continue reading, shared with other clients, “Last read on …” divider | [Today's TODO, item 7](parity_11_16.md) |
| Boost alt-text reminder, ask before boosting | [Sengi/Pachli item 4](sengi_pachli_parity.md#4-warn-before-boosting-a-post-with-undescribed-media-missing) |
| Show number of favourites and boosts (toggle) | [Sengi/Pachli item 5](sengi_pachli_parity.md#5-wellbeing-hide-engagement-counts-missing) |
| Save image, video, GIF or audio as… | Image: [today's TODO, item 6](parity_11_16.md). Video and audio come later. |
| Proxy (HTTP/SOCKS, with credentials) | [Today's TODO, item 5](parity_11_16.md) |
| `web+ap:` link handler, share-into-app plugin | [Sengi/Pachli N3, N2](sengi_pachli_parity.md) |
| Admin tools: accounts, reports, federation, IP rules, email blocks | Already in mawkingbird ([Mastodon item 16](mastodon_parity.md), `admin/admin-api.ts`) |
| Collections, annual report | Already in mawkingbird ([Phanpy item 25](phanpy_parity.md)) |
| Delete & re-draft, remove follower, follow requests, muted, blocked and blocked-domain pages | Already in mawkingbird |
| Public feeds of this server and other servers | Already in mawkingbird |
| Auto-update timelines | Already in mawkingbird (Auto-refresh timeline) |
| Error log page | Already in mawkingbird (observability page, bug report) |
| Profile QR code | Done ([Phanpy item 21](phanpy_parity.md)) |

## Deliberately not taking

| Feature | Why not |
| --- | --- |
| Pop out the composer (and “pop out by default”), standalone composer window | Same as the declined companion window ([Sengi/Pachli N9](sengi_pachli_parity.md)). |
| KUnifiedPush background push, D-Bus-activated notifications, notification policy editor, per-event notification switches, system tray icon | Notifications rule. |
| Akkoma, Pleroma, GoToSocial, Firefish, Iceshrimp and Pixelfed support | Mawkingbird's providers are Mastodon, Bluesky and Misskey. |
| “Crop images on the timeline” toggle | Visual preference. Mawkingbird already has media focal points ([Mastodon item 7](mastodon_parity.md)). Revisit only if users ask for uncropped single images. |
| Content font picker, colour scheme | Visual; the reader already has font choices. |

## Boundaries of this backlog

Visual and Kirigami/Breeze styling differences are excluded. Linux desktop integration (Flathub, Snap, `.desktop` scheme handlers, KDE Purpose) is noted as evidence for existing native items, not as separate work, because Linux runtime acceptance is deferred in the native plan.
