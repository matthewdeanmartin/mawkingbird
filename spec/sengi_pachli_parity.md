# Functional parity with Sengi and Pachli, and what native makes possible

Audit date: 2026-11-16.

This report lists functional capabilities in the local Sengi and Pachli checkouts that mawkingbird lacks or only partly has. It also lists ideas that neither client delivered, or could only deliver on one platform, that become practical in Mawkingbird Native (Tauri desktop and Android). It is a backlog of ideas to choose from, not a commitment to match either app. Part 4 lists ideas from both apps that mawkingbird should deliberately **not** copy.

## Scope and evidence

- Sengi: `REFERENCE/sengi`, commit `4c0a9769821407bec4f189be0a8f6a5981658bf0` (2026-03-10). This is an Angular 7 web app. Its Electron wrapper lives in a separate repository that was not reviewed, so desktop-only Sengi behavior is inferred from the web source and README only.
- Pachli: `REFERENCE/pachli-android`, commit `e88ad9e70c5479c700cc23774054a7edaf7ccbd9` (2026-11-13). This is a native Android (Kotlin) Tusky fork. Evidence comes from the CHANGELOG feature entries, preference keys, the manifest and the named source files.
- Mawkingbird web: `mawkingbird/ui`, commit `ac2116a651f1bdd878488a316fd22ff19d4cd242` (2026-11-16), including uncommitted working-tree changes present during review.
- Mawkingbird Native: `mawkingbird_native`, commit `3fe7c30d50637093783da1e9d1ecb8e5c016ecbc` (2026-11-15). Its only Tauri plugin is `tauri-plugin-opener`. The Android target is an experimental reader with no share intents and no Keystore credential storage ([sprint 09](../../mawkingbird_native/sprint/09-android.md)).
- This is a source audit. No app was run against a live account. “Missing” means no matching user workflow was found after searching the maintained client. “Partial” means related functionality exists but the stated operation does not. Server-, platform- or store-dependent capabilities are marked as such.
- Items already covered by the [Phanpy](phanpy_parity.md) or [Mastodon web](mastodon_parity.md) reports are not repeated. Where an item extends one of them, it links to the earlier item.

## Owner exclusions applied

- **No multicolumn.** Sengi's defining feature is a TweetDeck-style column deck. It is out of scope for good. Ideas that only make sense *because of* columns are in Part 4. Sengi's other premise, one narrow column kept at the side of the screen, does not need multiple columns, so it is kept as N9.
- **Notifications stay light.** This rule (from the Phanpy and Mastodon reports) covers push, UnifiedPush, pull/polling notifications, sounds, badges and new-post subscriptions. Pachli and Sengi are both notification-heavy. Those features appear only in Part 4, so nobody mistakes them for oversights.
- **No exit tools** (2026-10-30). Nothing in either app conflicts with this rule.
- **••• menu budget.** Post and profile menus hold at most 10 entries (`ui/src/app/menu-budget.ts`). New per-post actions must fit, or go in “More tools…”.

## Summary

There are **10 cross-platform backlog items** (Part 1–2) and **13 native opportunities** (Part 3). The suggested bands are planning recommendations, not effort estimates:

| Band | Items | Why |
| --- | --- | --- |
| A: unique to mawkingbird's multi-account, multi-network shape | 2 (1 declined) | Sengi's best remaining idea. |
| B: small reading-comfort and accessibility wins | 3, 4, 5, 6, 7, 8 | Mostly local settings and rendering. Pachli's best ideas. |
| C: native capabilities that no web client can match | N1, N2, N3, N5, N6 | These separate a native app from a wrapped web page. |
| D: native plumbing that a distributed app needs | N7, N8, N10, N11, N12 | Expected by users once the app is installed, not differentiators. |
| E: decisions needed before work | 9 | Product or policy decisions come before code. |

**Owner decisions 2026-11-16:** approved and scheduled in [today's TODO](parity_11_16.md): **10** (moderation warnings and severed relationships), **N1** (offline OCR), **N7** (proxy), **N11** (update check), **N13** (local AI). Declined: **N9** (companion window). Deferred: **N4** (Radio media controls; Radio has other problems to fix first).

Declined: **1** (act as another account; see the item). Still recommended next: **N2** (OS share target with files). **2** is now [today's TODO, item 8](parity_11_16.md).

---

# Part 1: Ideas from Sengi

Sengi is the closest relative: also Angular, also desktop-minded, also built around many accounts. Its column deck is excluded. What remains is how it treats several accounts as one tool.

### 1. Act on a post as another signed-in account — declined 2026-11-16

**Declined by the owner 2026-11-16. Do not implement or re-propose.** Acting as another account puts every identity one tap from every post, and a single slip publicly links accounts the user keeps apart on purpose (work and personal, public and pseudonymous). To act as another Mastodon account, the user switches accounts. Cross-posting one's own writing to several networks is a different thing and stays allowed. The rule is in [`ops/engineering/contributing.md`](../ops/engineering/contributing.md) § “One account acts at a time”. The text below is kept as a record of what was declined.

**Sengi:** Selecting a different account in the left bar changes which account performs actions on any visible post. The action bar keeps favourite, boost and bookmark state *per account* (`favoriteStatePerAccountId`, `bootedStatePerAccountId`). When the post lives on another server, Sengi resolves it through the acting account's own server first. You can boost a post with your project account that you are reading on your personal one, without switching the app's whole session.

**Mawkingbird:** Supports several sessions (`auth.otherSessions()`) and a switcher in `account-picker`. All post actions in `connections/status-actions.ts` run as the current session, and no per-post account chooser was found. Switching accounts reloads the context and loses your place in the feed.

**Completion criterion:** From a post's actions, choose another signed-in Mastodon (and, where it makes sense, Bluesky) account to reply, boost, favourite, bookmark or quote with. Resolve the post on that account's server (`/api/v2/search?resolve=true`, already used by `thread-loader.ts`) and show the result's state for that account. The current account stays the default, and the acting account is named on every button press. Never let one account's private data reach another account's view. A reply as another account opens the composer with that identity locked. Also offer **Open as…** (from Tokodon): open the thread through another account that can see more of it, such as a followers-only conversation. Moshidon (long-press boost or favourite) and Tokodon (Reply, Boost, Favorite, Bookmark and Open as…) both ship this feature, as does Sengi.

**Why it matters:** mawkingbird already has more accounts and more networks per user than most clients. This is the payoff of that design, and it doesn't need multiple columns.

Sources: [Sengi action bar](../../REFERENCE/sengi/src/app/components/stream/status/action-bar/action-bar.component.ts), [accounts state](../../REFERENCE/sengi/src/app/states/accounts.state.ts); [mawkingbird status actions](../ui/src/app/connections/status-actions.ts), [account picker](../ui/src/app/accounts/sign-in/account-picker/account-picker.ts), [thread loader](../ui/src/app/reading/read/thread-loader.ts).

### 2. Fill in replies the home server hasn't seen, from the origin server — partial

**Approved by the owner 2026-11-16**, **off by default** behind a Settings → Privacy switch, together with Moshidon M8. See [today's TODO, item 8](parity_11_16.md).

**Sengi:** After loading a thread through the home server, Sengi also fetches the context from the post's *origin* server's public API (`getRemoteStatusContext`). It merges replies whose `uri` the home server didn't return. A setting (“disable remote status fetching”) turns this off.

**Mawkingbird:** `thread-loader.ts` resolves a remote post through the home server and falls back to an anonymous public read when resolution fails. It never *combines* the two. When the home server knows the post, replies that never federated to it stay invisible. This is the most common complaint about Mastodon threads (“where are the replies?”). Mastodon 4.4's server-side reply fetching helps only on upgraded servers and only after a delay.

**Completion criterion:** For a signed-in thread whose root is on another server, fetch that server's public context in the background. Add replies not already present (match on `uri`), labelled “from {server}, not yet on your server”. Interacting with one of them resolves it through the home server first (as item 1 does). Offer an off switch, fail quietly when the origin refuses anonymous reads, and never send the user's token to the origin.

Sources: [Sengi thread, `retrieveRemoteThread`](../../REFERENCE/sengi/src/app/components/stream/thread/thread.component.ts), [setting](../../REFERENCE/sengi/src/app/components/floating-column/settings/settings.component.html); [mawkingbird thread loader, `loadPublicPost`](../ui/src/app/reading/read/thread-loader.ts).

### 3. Hide bots and self-boosts in Home — missing

**Sengi:** Each stream has `hideBoosts`, `hideReplies` and `hideBots`. **Pachli:** has a “show self-boosts” preference for Home (`TAB_SHOW_HOME_SELF_BOOSTS`).

**Mawkingbird:** The Home filter chips cover Replies and Retweets/boosts (`feeds/home/home.ts`), and profiles can hide an account's boosts. Neither a bot filter (using `account.bot`) nor a self-boost filter (boosts where the booster wrote the post) was found.

**Completion criterion:** Add two Home filters that persist per account and count toward the filter summary: hide posts from accounts marked as bots, and hide boosts of one's own posts. Show what was hidden, as the existing chips do.

Sources: [Sengi `StreamElement`](../../REFERENCE/sengi/src/app/states/streams.state.ts), [Pachli preference keys](../../REFERENCE/pachli-android/core/preferences/src/main/kotlin/app/pachli/core/preferences/SettingsConstants.kt); [mawkingbird Home](../ui/src/app/feeds/home/home.ts).

**Already covered in Sengi's reading settings:** “Slow mode (manual loading)” matches mawkingbird's *Auto-refresh timeline* switch. Keyword content-warning policies are mostly covered by Mastodon server filters with the Warn action, plus the existing “expand content warnings” preference. Sengi's language list and autodetection on posting are covered by the composer's language-mismatch check (`confidentLanguage` in `compose.ts`).

---

# Part 2: Ideas from Pachli

Pachli's strengths are accessibility, careful reading and long-term polish rather than big features. Its Android-only features are in Part 3.

### 4. Warn before boosting a post with undescribed media — missing

**Pachli 3.10:** An option warns before you boost a post with images or video that lack descriptions (`CONFIRM_REBLOGS` became a three-way choice: never, always, or only when media lacks captions).

**Mawkingbird:** Encourages and requires alt text when *writing*. No warning was found at boost time.

**Completion criterion:** An off-by-default (or on, owner's choice) setting that interrupts a boost of a post with any undescribed attachment. Offer “Boost anyway”, “Describe with AI” (where Phanpy item 15's AI is configured) and Cancel. Bluesky reposts get the same check.

Sources: [Pachli CHANGELOG v3.10.0](../../REFERENCE/pachli-android/CHANGELOG.md), [preferences](../../REFERENCE/pachli-android/app/src/main/java/app/pachli/components/preference/PreferencesFragment.kt); [mawkingbird status card](../ui/src/app/posts/status-card/status-card.ts).

### 5. Wellbeing: hide engagement counts — missing

**Pachli:** “Wellbeing” settings hide favourite and boost counts on posts (`WELLBEING_HIDE_STATS_POSTS`) and follower counts on profiles (`WELLBEING_HIDE_STATS_PROFILE`), separately.

**Mawkingbird:** No setting to hide counts was found. This fits mawkingbird's “quieter than other apps” stance better than Pachli's limited-notifications half of the same feature (excluded in Part 4).

**Completion criterion:** Two switches that remove counts from post action bars and profile headers in every provider's rendering. Ranking that uses counts still works, and the user's own analytics page is unaffected.

Sources: [Pachli preference keys](../../REFERENCE/pachli-android/core/preferences/src/main/kotlin/app/pachli/core/preferences/SettingsConstants.kt), [StatusDisplayOptions](../../REFERENCE/pachli-android/core/data/src/main/kotlin/app/pachli/core/data/model/StatusDisplayOptions.kt).

### 6. Highlight followed hashtags in posts — missing

**Pachli 3.7:** Hashtags you follow are visually marked inside post text, so you can see *why* a post from a stranger is in Home.

**Mawkingbird:** Follows hashtags and shows them in Home, but no marking of followed tags inside post content was found.

**Completion criterion:** Mark followed hashtags in rendered content, and give the mark an accessible name (not colour alone). For posts that appear in Home only because of a followed tag, state that reason on the post.

Sources: [Pachli CHANGELOG v3.7.0](../../REFERENCE/pachli-android/CHANGELOG.md).

### 7. Show pronouns and server role badges — missing

**Pachli:** Displays pronouns from profile fields next to names in timelines (`PRONOUN_DISPLAY`). It shows the server's role badges (moderator, admin, custom roles) on profiles and account lists.

**Mawkingbird:** No pronoun display or role badges were found in post or profile rendering.

**Completion criterion:** Read a pronoun-labelled profile field (match “pronouns” across common languages) and optionally show it after the display name. Show `account.roles` entries that the server marks highlighted. Both are off-switchable and both have screen-reader text.

Sources: [Pachli CHANGELOG v3.2.0, v2.15.0, v2.1.0](../../REFERENCE/pachli-android/CHANGELOG.md).

### 8. Reading-accessibility display options — partial

**Pachli:** Underline links (`LINKS_TO_UNDERLINE`), absolute timestamps (`ABSOLUTE_TIME_VIEW`), don't animate GIF avatars or custom emoji, and a choice of accessible fonts. **Sengi:** “freeze animated avatar”.

**Mawkingbird:** Respects `prefers-reduced-motion` in several places and has appearance settings. No link-underline, absolute-time or freeze-animated-avatar/emoji switch was found.

**Completion criterion:** Settings → Appearance gains: underline links in posts; show absolute timestamps; freeze animated avatars and custom emoji (show the first frame, animate on hover/focus). Each defaults off unless `prefers-reduced-motion` is set, in which case freezing defaults on.

Sources: [Pachli preference keys](../../REFERENCE/pachli-android/core/preferences/src/main/kotlin/app/pachli/core/preferences/SettingsConstants.kt), [Sengi settings](../../REFERENCE/sengi/src/app/components/floating-column/settings/settings.component.html); [mawkingbird appearance settings](../ui/src/app/settings/appearance/settings-appearance.html).

### 9. Several drafts in progress at once — decision needed

**Pachli 3.3:** “Multiple simultaneous compose tasks”: each draft is its own Android task, so you can switch between half-written posts with the OS app switcher. Pachli 3.10 returns you to the draft after you leave the app.

**Mawkingbird:** Has drafts and the composer handoff, but one active composer. This overlaps with [Phanpy item 10](phanpy_parity.md#10-detachable-composer-with-transfer-back-to-the-parent-missing) (detachable composer window).

**Decision:** N9's extra windows were declined, so a drafts switcher inside the single composer is the likely shape on both web and native. Decide before building it.

Sources: [Pachli CHANGELOG v3.3.0, v3.10.0](../../REFERENCE/pachli-android/CHANGELOG.md); [mawkingbird composer](../ui/src/app/publishing/compose/compose.ts).

### 10. Moderation warnings and severed relationships — approved 2026-11-16

These are **end-user** notices, not admin tools, so the owner moved them out of the notifications exclusion.

**Pachli:** Shows `moderation_warning` notifications (v2.15) and `severed_relationships` notifications (v2.4). Mastodon 4.3+ sends both to the affected user. A moderation warning means a moderator acted on *your* account (warning, posts deleted or marked sensitive, account disabled, silenced or suspended), with an appeal. Severed relationships means you lost follows or followers because your admin blocked a server, you blocked a domain, or a remote server was suspended.

**Mawkingbird:** The notifications code handles mentions, boosts and favourites. Neither of these types was found, so a user can be struck or lose followers without the app ever telling them.

**Completion criterion:** Render both types, even when the user's notification filters hide everything else. Explain what happened in plain words, link the affected posts, and link out to the server's appeal page (`/disputes/strikes/:id`) and lost-relationships download (`/severed_relationships`), because Mastodon has no REST API for either. Add no push, sound or badge. Implementation checklist: [today's TODO, item 2](parity_11_16.md).

Sources: [Pachli CHANGELOG v2.15.0, v2.4.0](../../REFERENCE/pachli-android/CHANGELOG.md), [preference keys](../../REFERENCE/pachli-android/core/preferences/src/main/kotlin/app/pachli/core/preferences/SettingsConstants.kt).

---

# Part 3: What native code makes possible

These capabilities are impossible or crippled in a browser. Some are Pachli features that only work because it is an Android app. Others are ideas that *none* of Sengi, Pachli, Phanpy or Elk delivered. Each must follow the native architecture rules in the [native roadmap](../../mawkingbird_native/spec/roadmap_and_plan.md): typed IPC, Rust-validated destinations, no unrestricted fetch, credentials in the OS store, and web builds never showing native-only features.

“Platforms” says where each item is realistic. Linux and macOS are deferred targets. iOS is out of reach for now (see Part 4).

### N1. Offline OCR to draft alt text — approved 2026-11-16

**Approved by the owner 2026-11-16.** Windows first; see [today's TODO, item 4](parity_11_16.md).

**Gap:** Phanpy and mawkingbird draft descriptions with a *cloud* model (Phanpy item 15 needs OpenRouter). The most common undescribed image on Mastodon is a screenshot of text, and the OS can read it for free, offline and privately.

**Native path:** Windows `Windows.Media.Ocr` (built in, no download). Android ML Kit Text Recognition (bundled model, no Play Services needed for the bundled variant). macOS Vision later.

**Completion criterion:** For an attached image, “Read text from image” fills the alt-text field with the recognized text, marked as machine-read for the writer to check, using the same rules as metadata prefill (Phanpy 14): never overwrite typed text. No network request is made. Show it only where the OS recognizer exists.

**Platforms:** Windows, Android.

### N2. Receive shares from other apps, including files — extends Phanpy 11

**Pachli:** Declares `SEND` and `SEND_MULTIPLE` for text, images, video and audio. It also publishes Android *direct share* shortcuts per account (`UpdateShortCutsUseCase`, `share_shortcuts`), so “share to @me@server” appears directly in the share sheet.

**Mawkingbird:** Web takes text and links through the manifest `share_target` (Phanpy 11). Files were declined because they need a service worker, and iOS can't do it at all. The native Android manifest has no share intent.

**Completion criterion:** Android: accept text, links and up to four images, video or audio, then open an unsent composition (never auto-post). Add direct-share targets for each signed-in account. Windows: register as a Share target (the Windows share contract, or at minimum a “Send to Mawkingbird” entry). Shared files go through the normal attach path, including EXIF cleaning and metadata alt-text prefill.

**Platforms:** Android first, then Windows.

Sources: [Pachli manifest](../../REFERENCE/pachli-android/app/src/main/AndroidManifest.xml), [shortcuts](../../REFERENCE/pachli-android/app/src/main/java/app/pachli/util/UpdateShortCutsUseCase.kt); [native Android manifest](../../mawkingbird_native/src-tauri/gen/android/app/src/main/AndroidManifest.xml).

### N3. Open fediverse links in the app — missing

**Pachli:** `IntentRouterActivity` receives links and routes profiles, posts and hashtags into the app rather than the browser.

**Mawkingbird:** Native sends every external link to the browser, which is correct for ordinary web pages. Nothing brings a Mastodon link *into* the app.

**Completion criterion:** Register `web+ap:`, `web+mastodon:` and an app scheme through `tauri-plugin-deep-link`. On Android, offer “Open in Mawkingbird” in the share sheet (arbitrary instance domains can't be verified App Links). Add a paste-a-link field that resolves through the home server, as the Phanpy 21 QR scanner already does. Unrecognized URLs still go to the browser.

**Platforms:** Windows, Android.

Sources: [Pachli intent router](../../REFERENCE/pachli-android/feature/intentrouter/src/main/kotlin/app/pachli/feature/intentrouter/IntentRouterActivity.kt).

### N4. OS media controls and background audio for Radio and video — deferred 2026-11-16

**Deferred by the owner 2026-11-16:** Radio has other problems to fix first. Revisit after that work.

**Pachli:** Pauses when headphones disconnect, has repeat and mute-by-default, shows subtitles, and pauses video while swiping through media.

**Mawkingbird:** Has Radio queues, playlists and a video player. No `navigator.mediaSession` use was found, even though the web API exists. Native Android has no foreground service, so Radio dies when the screen locks.

**Completion criterion:** Web and native: set Media Session metadata (title, author, artwork) and play/pause/next/previous handlers for Radio and video, so keyboard media keys, Windows media flyouts and lock screens work. Native Android: a media foreground service so Radio keeps playing with the screen off, and pause when audio output becomes noisy (headphones unplugged). Windows: SMTC integration comes free with WebView2 Media Session, which still needs verification.

**Platforms:** Web (partial), Windows, Android.

Sources: [Pachli CHANGELOG v2.15.0](../../REFERENCE/pachli-android/CHANGELOG.md).

### N5. Offline translation and language identification — new for desktop

**Pachli:** On the Play Store build, translates with ML Kit on-device models, downloaded over Wi-Fi only (`TRANSLATION_BACKEND`, `TRANSLATION_DOWNLOAD_REQUIRE_WIFI`). It identifies language on-device to warn about the wrong posting language.

**Mawkingbird:** Native translation calls hosted MyMemory and Apertium and OpenRouter, and the roadmap marks offline models as “not implemented or promised”. The web chain's “browser” step relies on Chrome's built-in Translator, which WebView2 may not expose; verify this.

**Completion criterion:** An opt-in, downloadable offline engine. Desktop: Bergamot/Firefox Translations models (MPL, run in Rust or wasm, about 20–40 MB per language pair). Android: ML Kit only for Play builds, or Bergamot if size allows. The engine becomes the first free step of the existing translation router, with per-pair download, delete and disk use shown. No text leaves the device.

**Platforms:** Windows, Android. **Decision first:** model licensing, disk budget and which pairs to ship.

Sources: [Pachli translation](../../REFERENCE/pachli-android/app/src/main/java/app/pachli/translation/Translation.kt), [language identification](../../REFERENCE/pachli-android/app/src/main/java/app/pachli/languageidentification/LanguageIdentification.kt); [native capability matrix](../../mawkingbird_native/spec/plus_local_capabilities.md).

### N6. Save media into a real folder library — extends existing download

**Pachli:** Download location per account or per sender (`DOWNLOAD_LOCATION`), so saved images arrive organised.

**Mawkingbird:** Has a media-download dialog that uses browser downloads. The archive roadmap plans a separate, explicit “Download Media” feature.

**Completion criterion:** Native: choose a library folder and a layout (flat, per account, per sender), and write the alt text alongside (XMP description or a sidecar `.txt`) so descriptions survive outside the app. Never overwrite files, and record the source post URL. Bulk “save all media from this person” waits for the archive's Download Media decision.

**Platforms:** Windows, Android (MediaStore).

Sources: [Pachli CHANGELOG v2.8.2](../../REFERENCE/pachli-android/CHANGELOG.md); [mawkingbird media download](../ui/src/app/posts/media-download/media-download-dialog.ts), [archive roadmap](../../mawkingbird_native/spec/local_archive_roadmap.md).

### N7. Proxy support — approved 2026-11-16

**Approved by the owner 2026-11-16.** See [today's TODO, item 5](parity_11_16.md).

**Pachli:** Has a manual HTTP proxy setting (`HTTP_PROXY_ENABLED`, server, port).

**Mawkingbird Native:** Rust clients call `.no_proxy()` on purpose (DNS pinning, SSRF policy). A browser user behind a mandatory corporate proxy can use the web app, but can't use native at all. Privacy-minded users also can't route through Tor or SOCKS.

**Completion criterion:** An explicit proxy setting (HTTP CONNECT and SOCKS5, with an optional Tor preset) that keeps every existing destination check. The destination host is still validated, and private-address blocking applies to the target, not to the proxy. When the proxy fails, show an error; never fall back to a direct connection. System-proxy auto-detection stays off unless the owner decides otherwise.

**Platforms:** Windows, Android.

Sources: [Pachli preference keys](../../REFERENCE/pachli-android/core/preferences/src/main/kotlin/app/pachli/core/preferences/SettingsConstants.kt); [native feeds](../../mawkingbird_native/src-tauri/src/feeds.rs), [connectors](../../mawkingbird_native/src-tauri/src/connectors.rs).

### N8. App lock and screenshot protection for private material — new idea

**Gap:** No reference client locks itself. The planned native archive will hold followers-only posts and DMs for several identities on disk, which is more sensitive than any browser cache.

**Completion criterion:** An optional app lock using Windows Hello or Android BiometricPrompt/device credential, on launch and after N minutes idle. Android: set `FLAG_SECURE` on DM and private-conversation screens so they don't appear in the recent-apps preview or screenshots. Locking never deletes data, and a failed unlock never offers a bypass.

**Platforms:** Windows, Android.

### N9. Quick-compose hotkey and a narrow companion window — declined 2026-11-16

**Declined by the owner 2026-11-16.** Do not implement or re-propose the companion window or extra composer windows.

**Sengi:** Built to be “left at the side of your screen, keeping an eye on it while doing other stuff”, with Win+Alt+arrow column shortcuts. Its Docker image even ships a landing page just to open itself as a pop-up.

**Mawkingbird:** Single window, no global shortcut. Tauri has neither the window-state nor the global-shortcut plugin installed.

**Completion criterion:** (a) A user-chosen global shortcut that opens a composer window from anywhere, even when Mawkingbird is minimised. Posting from that window uses the normal composer rules. (b) An optional always-on-top narrow window showing one feed, which is a single column, not a deck. (c) Remember window size and position. Composer windows also settle Phanpy 10 and item 9 above on native.

**Platforms:** Windows (then macOS and Linux). **Decision first:** whether (b) creeps toward multicolumn. A single companion window with one feed is the boundary.

Sources: [Sengi README](../../REFERENCE/sengi/README.md), [settings shortcuts](../../REFERENCE/sengi/src/app/components/floating-column/settings/settings.component.html).

### N10. Queued and scheduled posting where the server can't schedule — new idea

**Gap:** Mastodon schedules on the server, and mawkingbird already supports that. Bluesky has no scheduling API, and Misskey's support varies. No reference client fills this for multi-network users. Pachli saves a post that failed to send as a draft. Nobody has an outbox.

**Completion criterion:** A local outbox that holds posts composed offline and sends them when the network returns. Scheduled posts for providers without server scheduling are sent by native **only while the app runs**, which the UI states plainly (“will post at 9:00 if Mawkingbird is open; otherwise when it next opens”). Follow the native rule on ambiguous outcomes: if a send times out after the request may have reached the server, stop and ask; never retry silently. This does not need the hosted always-online service, so it doesn't break “cloud last”.

**Platforms:** Windows, Android (WorkManager would allow sending with the app closed; that's a later decision).

### N11. Signed in-app updates — approved 2026-11-16

**Approved by the owner 2026-11-16 in reduced form:** a manual version check against GitHub releases that links to the download page. No signing keys and no self-installing updater for now (too early). See [today's TODO, item 3](parity_11_16.md).

**Pachli:** Checks for updates on a chosen schedule and offers a manual check (`UPDATE_NOTIFICATION_FREQUENCY`), because F-Droid and GitHub builds don't update themselves.

**Mawkingbird Native:** Has no updater. Debug APKs from Actions even change their signing key every build ([sprint 09](../../mawkingbird_native/sprint/09-android.md)).

**Completion criterion:** Settings → About shows the version and offers “Check for updates”. Use `tauri-plugin-updater` with a signature checked against a key built into the app. Install only on the user's request. No automatic nagging, consistent with the notification stance. Android gets a stable release signing key before any public APK.

### N12. Background-work and database diagnostics — needed by the archive

**Pachli:** About → Workers and About → Database tabs show background jobs, their last run and outcome, and database stats.

**Mawkingbird Native:** Has diagnostics logging. The archive roadmap plans “Data activity” for collection coverage. Pachli's version is a good model for the *operations* half: which jobs exist, when they last ran, which hit 429s, and how big the database and FTS index are.

**Completion criterion:** A native-only Settings → Data activity page listing collector jobs (state, last run, next run, last error category, backoff), database size by table and index, and a “pause background collection” switch. No private content appears on it.

Sources: [Pachli CHANGELOG v3.4.0, v3.2.2](../../REFERENCE/pachli-android/CHANGELOG.md); [archive sprint 10](../../mawkingbird_native/sprint/10-local-archive.md).

### N13. Local AI endpoint as a free OpenRouter alternative — approved 2026-11-16

**Approved by the owner 2026-11-16** as a local AI connector. See [today's TODO, item 1](parity_11_16.md).

**Gap:** “Locally supportable capabilities are free”, yet every AI feature (translation, image descriptions, suggestions) needs paid OpenRouter. Many desktop users already run Ollama or LM Studio, which expose OpenAI-compatible APIs on `localhost`.

**Conflict:** The native host blocks private and loopback destinations, except the exact `mastomini.local` test host.

**Completion criterion (if approved):** One explicit, user-entered loopback endpoint (`127.0.0.1` or `localhost` and one port), treated as a separate provider with its own model list. Show it as “runs on your computer”, and apply no budget. The exception covers only that exact host and port, never arbitrary LAN or `.local` access.

**Platforms:** Windows (Android rarely has a local model server).

---

# Part 4: Deliberately not taking

Competing well sometimes means not copying. These are features from Sengi or Pachli that mawkingbird should skip, with the reason, so they aren't re-proposed as oversights.

| Feature | App | Why not |
| --- | --- | --- |
| Column deck, column switching shortcuts, per-column headers (“Title – Account Icon – Domain”) | Sengi | Owner exclusion: never multicolumn. Per-feed filters survive as item 3. |
| Swipeable tabs holding many timelines, tab-tap behaviour, tab alignment | Pachli | A navigation shape for phones that duplicates mawkingbird's pinned/recent feeds. Phanpy item 2 already covers the shortcut idea. |
| Push notifications, UnifiedPush, periodic pull notifications, notification light/vibrate/sound | Pachli | Notification rule. |
| Notification sounds, avatar notification badges, notification hub | Sengi | Notification rule. |
| “Limited notifications” wellbeing mode | Pachli | Notification rule. The other half of wellbeing (counts) is item 5. |
| Twitter bridge setting | Sengi | The service is dead and the idea is obsolete. |
| Auto-follow accounts when adding them to a list (Pleroma) | Sengi | A surprising side effect: adding to a list should never change who you follow. |
| Confirm before favouriting | Pachli | Friction without a safety benefit. Item 4's targeted boost warning is the useful version. |
| “Copy all data” (raw status JSON) on every post | Sengi | A developer tool that would take a ••• slot. If needed, put it in a diagnostics view, not the post menu. |
| Reverse (oldest-first) Home timeline lab | Pachli | Phanpy item 1's bounded Catch-up sessions answer the same need without flipping the feed. |
| Server-specific support for Akkoma, GoToSocial, Iceshrimp, Sharkey and Pleroma | Both | Mawkingbird's providers are Mastodon, Bluesky and Misskey. Add support when a user needs it, not for parity. |
| Hide the top toolbar, hide the FAB, choose nav position | Pachli | Layout preferences, not functions. |
| iOS app, iOS share extension | — | Tauri iOS needs Xcode on a Mac, and a share extension is a separate Swift target. Not reachable until the Mac decision changes; web `share_target` doesn't work on iOS either. |
| Encrypted *cloud* backup (Android Auto Backup) | Pachli | Cloud comes last. The local encrypted backup already in the [capability matrix](../../mawkingbird_native/spec/plus_local_capabilities.md) is the right first step. |

## Boundaries of this backlog

Purely visual differences are excluded: themes, fonts (except as accessibility options in item 8), icon sets, spacing and animation. Items where mawkingbird already has an equivalent were not turned into backlog entries just because the interface differs: slow/manual loading, language detection when posting, poll results, list reply policy and exclusivity, trending links, suggested accounts, scheduled posts, drafts, quote posts, Markdown and EXIF stripping.

Native items must keep the web build honest: native-only menu entries, routes and copy never appear in the web app ([sprint 10 visibility rule](../../mawkingbird_native/sprint/10-local-archive.md)). Before closing a native item, record which OS and version it was accepted on, not just that it compiled. For items that depend on the server or platform, record the capability actually tested.
