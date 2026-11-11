# Functional parity with Phanpy

Audit date: 2026-11-10.

This report identifies functional capabilities in the local Phanpy checkout that are missing or incomplete in mawkingbird. It is a one-way implementation backlog, not a comparison of appearance or a list of mawkingbird-only features.

## Scope and evidence

- Phanpy: `REFERENCE/phanpy`, commit `dda0b5b2fd895edcca3cf5456a53b5b51a53c1b5` (2026-11-10).
- Mawkingbird: maintained Angular client in `mawkingbird/ui`, commit `eec31c57421dc1b15b6215670a68c161d39edc5f` (2026-11-10), including the working-tree changes present during review. Existing changes were not modified.
- This is a source audit of routes, components, request payloads, persistence and feature gates. Neither application was exercised against a live account. Claims concern these checkouts, not every deployed version of either product.
- “Missing” means no corresponding user workflow was found after checking the relevant implementation and searching the maintained client. “Partial” means related functionality exists, but the stated operation does not. API documentation entries, mock endpoints and models alone do not constitute an implemented feature.
- Server-, browser- and deployment-dependent Phanpy features are explicitly identified. Supporting them means providing the workflow when the dependency is available, with an appropriate unavailable state otherwise.
- Source links are relative to this report. Phanpy links require the sibling reference checkout. Source filenames and symbols are used instead of fragile line numbers.

There are **25 backlog items** below. Several group closely related operations. Suggested delivery bands are planning recommendations, not estimates of implementation effort:

| Band | Work |
| --- | --- |
| A — everyday account and moderation operations | 4–9, 18, 23–24 |
| B — reading and writing workflows | 1–3, 10–12, 16–17, 19–20 |
| C — additional tools and conditional integrations | 13–15, 21–22, 25 |

## Reading and navigation

### 1. Time-bounded Catch-up sessions — missing

**Phanpy:** Fetches a bounded portion of the following timeline, offers hourly ranges and a beyond-12-hours option, retains previous catch-ups, and warns about overlap with the last session. Within the fetched session it supports post-type filters, author grouping, chronological/engagement/information-density sorting, and a ranked list of links shared by followed accounts. Author-to-author keyboard navigation is also supported.

**Mawkingbird:** Home and algorithmic feeds provide feed browsing and ranking, but no equivalent saved, bounded Catch-up session was found. A normal timeline or an engagement-ranked feed does not supply the session boundary, overlap tracking or author-grouped review.

**Completion criterion:** Fetch a selected interval, preserve and reopen the resulting session, identify overlap, and allow its posts and shared links to be reviewed with the above filters and grouping. Retain the account scope and disclose incomplete fetches.

Sources: [Phanpy Catch-up](../../REFERENCE/phanpy/src/pages/catchup.jsx); [mawkingbird Home](../ui/src/app/pages/home/home.ts), [algorithmic feed](../ui/src/app/algo-feed.ts), [routes](../ui/src/app/app.routes.ts).

### 2. Simultaneously active, configurable feed columns — partial

**Phanpy:** Its Shortcuts configuration can host multiple independent timelines at once: following, notifications, mentions, a list, public timelines, a hashtag, a saved search, bookmarks, favourites and the user's profile. Columns retain their own feed interaction, and keyboard commands move focus between them. Shortcut definitions can be reordered and imported/exported.

**Mawkingbird:** Recent/pinned feeds and navigation destinations exist, but the main shell renders one routed page. No equivalent workspace of independently usable Mastodon feed columns was found.

**Completion criterion:** Persist a user-selected set and order of feed sources, display and operate multiple feeds simultaneously, and restore/share that configuration. The specific column styling, floating shortcut button and tab-bar appearance are not parity requirements.

Sources: [Phanpy columns](../../REFERENCE/phanpy/src/components/columns.jsx), [shortcut settings](../../REFERENCE/phanpy/src/components/shortcuts-settings.jsx); [mawkingbird shell](../ui/src/app/shell/shell.html), [recent feeds](../ui/src/app/recent-feeds.ts), [portable configuration](../ui/src/app/portable-config.ts).

### 3. Collapse and expand individual reply branches — partial

**Phanpy:** Builds a reply tree and lets readers collapse/expand sub-conversations, including keyboard control. This is a way to omit an irrelevant branch while continuing to read other replies.

**Mawkingbird:** The ordinary thread page renders ancestors and descendants as sequential status cards. Its reader mode and shared content-warning state do not provide per-branch conversation controls.

**Completion criterion:** Identify parent/child reply relationships and let a reader independently collapse and restore a branch without losing access to its replies. Matching indentation or other tree styling is unnecessary.

Sources: [Phanpy status page, `expandReplies` and reply containers](../../REFERENCE/phanpy/src/pages/status.jsx); [mawkingbird thread template](../ui/src/app/pages/thread/thread.html), [thread logic](../ui/src/app/pages/thread/thread.ts).

## Notifications and account relationships

### 4. Browser push notifications — declined 2026-11-10

**Declined by the owner:** Mawkingbird is deliberately light on notifications. Do not implement or re-propose.

**Phanpy:** Registers a browser Push subscription with Mastodon and exposes event switches and sender policies, including anyone, followed people and followers. Its service worker handles delivery outside the ordinary open-page notification stream. The UI labels this beta.

**Mawkingbird:** The notifications timeline and streaming are implemented, but no PushManager subscription lifecycle or Mastodon push-subscription requests were found. The email-notification settings page is explicitly mock-only and is not this feature.

**Completion criterion:** Enable, update and disable push subscriptions for the correct account; select events and sender policy; receive and open a notification when the app page is closed on a supported platform. Test permissions and account switching as well as delivery.

Sources: [Phanpy push utilities](../../REFERENCE/phanpy/src/utils/push-notifications.js), [settings](../../REFERENCE/phanpy/src/pages/settings.jsx), [service worker](../../REFERENCE/phanpy/public/sw.js); [mawkingbird notification settings](../ui/src/app/pages/settings/notifications/settings-notifications.ts), [streaming](../ui/src/app/streaming.ts), [API](../ui/src/app/api.ts).

### 5. Server notification policies and notification requests — declined 2026-11-10

**Declined by the owner:** Mawkingbird is deliberately light on notifications. Do not implement or re-propose.

**Phanpy:** Reads/writes the v2 notification policy and presents the server's notification-request inbox. Policies cover people not followed, non-followers, new accounts, unsolicited private mentions, moderated accounts and bots, with Accept/Filter/Ignore choices. Individual requests can be allowed or dismissed.

**Mawkingbird:** Has local audience/type filters, grouped notifications and follow-request decisions. Those do not edit the server policy or retrieve/accept/dismiss notification requests. Follow requests and notification requests are different resources.

**Completion criterion:** Persist supported policy fields on the server, show the filtered notification requests and their notifications, and allow or dismiss them. Existing client-side filtering should not be presented as changing this policy.

Sources: [Phanpy notifications, `NOTIFICATIONS_POLICIES` and request actions](../../REFERENCE/phanpy/src/pages/notifications.jsx); [mawkingbird notifications](../ui/src/app/pages/notifications/notifications.ts), [API](../ui/src/app/api.ts).

### 6. Subscribe to a followed account's new posts — declined 2026-11-10

**Declined by the owner:** Mawkingbird is deliberately light on notifications. Do not implement or re-propose.

**Phanpy:** Offers “Notify me about new posts” and its inverse, updating the follow relationship with `notify` and reading `notifying`.

**Mawkingbird:** The Mastodon follow API accepts a reblogs option, and profiles can hide/show boosts, but there is no corresponding new-post notification subscription control.

**Completion criterion:** Toggle notification subscription on a followed profile, reflect the returned relationship, and preserve that setting across reloads. This is separate from browser push: the server subscription should also work for in-app notifications.

Sources: [Phanpy related actions](../../REFERENCE/phanpy/src/components/related-actions.jsx); [mawkingbird `Api.follow`](../ui/src/app/api.ts), [profile actions](../ui/src/app/pages/profile/profile.ts).

### 7. Private notes attached to another account — done 2026-11-10

**Phanpy:** Reads relationship notes and creates/edits a private annotation through the account-note API. The annotation is visible from the profile actions.

**Mawkingbird:** No account relationship-note editor or API mutation was found. Private posts to oneself and local writing drafts are different objects.

**Completion criterion:** Read, create, change and clear an account note, storing it on the server and keeping it private to the signed-in account.

Sources: [Phanpy private-note sheet](../../REFERENCE/phanpy/src/components/private-note-sheet.jsx), [related actions](../../REFERENCE/phanpy/src/components/related-actions.jsx); [mawkingbird profile](../ui/src/app/pages/profile/profile.ts), [API](../ui/src/app/api.ts).

**Implemented:** profile ••• → Add/Edit private note opens `AccountNoteDialog` (`POST /api/v1/accounts/:id/note`; empty clears). The note shows under the handle on the profile with an Edit link. Signed-in Mastodon only.

### 8. Feature/unfeature accounts on one's profile — done 2026-11-10

**Phanpy:** Pins/unpins followed accounts as profile endorsements.

**Mawkingbird:** Retrieves and browses endorsements, including an endorsed-account feed, but that view explicitly describes itself as read-only. The API exposes retrieval but no account pin/unpin mutation. Post pinning is already implemented and is not the gap.

**Completion criterion:** Feature and unfeature an eligible account from its profile and refresh the resulting endorsement membership.

Sources: [Phanpy related actions](../../REFERENCE/phanpy/src/components/related-actions.jsx); [mawkingbird endorsed-list view](../ui/src/app/pages/endorsed-list/endorsed-list.ts), [API](../ui/src/app/api.ts).

**Implemented:** profile ••• → Feature on my profile / Stop featuring on my profile for accounts you follow (`Api.setAccountFeatured`: `POST /endorse` or `/unendorse`, retrying the pre-4.4 `/pin` / `/unpin` on 404 or 405). The relationship's `endorsed` flag updates in place. Your own profile's featured list has a Remove button per account. The `/endorsed` feed view stays read-only.

### 9. Familiar followers on a profile — done 2026-11-10 (follower-list prioritization not done)

**Phanpy:** Uses the familiar-followers endpoint to show people the viewer follows who also follow the viewed account, and prioritizes those people in the follower list.

**Mawkingbird:** Shows the viewer's own follow/mutual relationship and ordinary follower lists, but no familiar-followers query or equivalent mutual-connection summary was found.

**Completion criterion:** Identify and open the relevant familiar follower accounts on a profile, without confusing “we follow each other” with “people I follow also follow this person.”

Sources: [Phanpy familiar-followers utility](../../REFERENCE/phanpy/src/utils/familiar-followers.js), [account information](../../REFERENCE/phanpy/src/components/account-info.jsx); [mawkingbird profile](../ui/src/app/pages/profile/profile.ts), [API](../ui/src/app/api.ts).

**Implemented:** signed-in Mastodon profiles (not your own) fetch `GET /api/v1/accounts/familiar_followers` and show "Followed by people you follow: A, B, C and N more you follow", each name linking to that profile, with a hint that this is not a mutual follow. Old servers show nothing. Not done: reordering the Followers tab to put these people first.

## Composing and media

### 10. Detachable composer with transfer back to the parent — missing

**Phanpy:** Pops the active composer into a separate window and returns it to the parent, carrying composition state. It also offers a minimized composer and shortcuts for composing/replying in a new window.

**Mawkingbird:** Inline composers, drafts and the writing page exist, but no equivalent composer window handoff was found. Manually opening a second app tab is not a transfer of the current composition.

**Completion criterion:** Move an in-progress post or reply to a separate window and back while preserving text, media, poll, audience and reply context; prevent accidental duplicate submission or overwriting an active parent composition. Permit browsing while the composition remains available.

Sources: [Phanpy composer](../../REFERENCE/phanpy/src/components/compose.jsx), [open-compose utility](../../REFERENCE/phanpy/src/utils/open-compose.js); [mawkingbird composer](../ui/src/app/compose/compose.ts), [hotkeys](../ui/src/app/hotkeys.ts).

### 11. Receive operating-system shares into a composition — done 2026-11-10 (links and text; files not yet)

**Phanpy:** Declares a PWA Web Share Target for title, text, URL and image/video/audio files. Its service worker receives the multipart share and hands the data to the app's composer.

**Mawkingbird:** Outgoing sharing exists. The web manifest does not declare an incoming share target, and no equivalent inbound share handler was found.

**Completion criterion:** On a supported installed-web-app platform, select mawkingbird in another app's Share sheet and receive the shared text/link/media in an unsent composition. Do not publish automatically.

Sources: [Phanpy manifest configuration](../../REFERENCE/phanpy/vite.config.js), [share-target handler](../../REFERENCE/phanpy/public/sw.js), [app handoff](../../REFERENCE/phanpy/src/app.jsx); [mawkingbird manifest](../ui/public/site.webmanifest), [outgoing share dialog](../ui/src/app/share-dialog/share-dialog.ts).

**Implemented:** `ui/public/site.webmanifest` now has a name, `id`/`start_url`/`scope` (relative, so canary works), the site description and a GET `share_target` for `title`/`text`/`url`. `/share` joins them (each piece once), parks an unsent draft through the composer handoff and replaces itself with Home. No service worker: sharing **files** is not supported (owner decision 2026-11-10), and iOS has no Web Share Target at all. Install entry points: Settings → Install app (Chrome/Edge install button from the deferred `beforeinstallprompt`; written instructions for iOS, Mac Safari and other browsers) and a footer link beneath the other footer rows, both hidden when already running installed. The browser's automatic mini-infobar is suppressed.

### 12. Integrated GIF search and attachment — missing

**Phanpy:** Has an optional GIF picker; selecting a result downloads it into the media-attachment workflow, including supplied description text. This depends on the configured GIF integration.

**Mawkingbird:** Uploading a GIF file is possible, but no integrated GIF search/picker was found.

**Completion criterion:** Search/browse the supported GIF service, choose a result and attach it to the draft through the normal media validation and upload flow.

Sources: [Phanpy GIF picker](../../REFERENCE/phanpy/src/components/gif-picker-modal.jsx), [composer](../../REFERENCE/phanpy/src/components/compose.jsx); [mawkingbird composer](../ui/src/app/compose/compose.ts).

### 13. Explicit camera capture from the composer — done 2026-11-10

**Phanpy:** Provides “Take photo or video” through a capability-gated file input using `capture="environment"`.

**Mawkingbird:** Offers file selection, paste and drag/drop, but no explicit capture input/control was found. Some mobile file pickers may incidentally offer a camera; that is not the same application capability.

**Completion criterion:** Offer capture on supported devices and place the resulting photo/video into the current draft. Keep ordinary file upload available.

Sources: [Phanpy camera input](../../REFERENCE/phanpy/src/components/camera-capture-input.jsx), [composer](../../REFERENCE/phanpy/src/components/compose.jsx); [mawkingbird composer template](../ui/src/app/compose/compose.html).

**Implemented:** a 📷 button beside 📎 on touch-first devices (`pointer: coarse`) opens a `capture="environment"` input. iOS Safari may take a photo or video; other phones take photos, because Android's camera intent opens for only one kind. The capture goes through the ordinary attach path (upload, metadata alt text, Bluesky rules). Desktop browsers, which ignore `capture`, don't get the button; ordinary upload is unchanged.

### 14. Prefill image descriptions from embedded metadata — done 2026-11-10

**Phanpy:** Extracts IPTC `Caption/Abstract`, XMP `Description` or EXIF `ImageDescription` from an unuploaded image and uses the result as its description.

**Mawkingbird:** Has manual alt text and missing-description advice/requirements, but no equivalent embedded-description extraction was found.

**Completion criterion:** Selecting a supported image with a description in its metadata prepopulates an editable alt-text field without overwriting the user's subsequent edits.

Sources: [Phanpy extraction utility](../../REFERENCE/phanpy/src/utils/extract-image-desc.js), [media attachment](../../REFERENCE/phanpy/src/components/media-attachment.jsx); [mawkingbird alt-text handling](../ui/src/app/compose/alt-text.ts), [composer](../ui/src/app/compose/compose.ts).

**Implemented:** `compose/image-description.ts` reads IPTC Caption/Abstract, then XMP `dc:description` (x-default first), then EXIF ImageDescription from JPEG, PNG (`tEXt`/`iTXt` Description, XMP, `eXIf`) and WebP, locally and before upload. Camera placeholders (e.g. "OLYMPUS DIGITAL CAMERA", "DSC_0042") are ignored; text is capped at 1,500 characters. Only an attachment whose description is still empty is filled, and a note asks the writer to check it until they edit it. Not read: HEIC/AVIF and compressed PNG text.

### 15. Generate descriptions for uploaded or viewed images — done 2026-11-10 (OpenRouter only)

**Phanpy:** With its image-description generator setting and `IMG_ALT_API_URL` configured, it can generate an editable attachment description. The media viewer can also describe an existing image. This is not an unconditional capability of every Phanpy deployment.

**Mawkingbird:** Its AI text/translation tools and manual image descriptions do not expose this image-to-description workflow.

**Completion criterion:** Provide an explicit image-description action in composing and viewing, clearly handle unavailable service/errors, and let the author review generated text before publishing it. Matching Phanpy's external provider is unnecessary.

Sources: [Phanpy attachment generator](../../REFERENCE/phanpy/src/components/media-attachment.jsx), [viewer action](../../REFERENCE/phanpy/src/components/media-modal.jsx), [settings](../../REFERENCE/phanpy/src/pages/settings.jsx); [mawkingbird composer](../ui/src/app/compose/compose.ts), [lightbox](../ui/src/app/lightbox).

**Implemented:** only when AI features are on and OpenRouter is connected. In the composer, ✨ beside an image's alt field asks the chosen model for a description: a local file is downscaled to 1,024 px first, otherwise the uploaded preview URL is sent. The text lands in the field with a "Written by AI… check it" note and is never posted without being shown, and the button never replaces words the writer typed. In the lightbox, "✨ Describe with AI" captions an undescribed image for this viewing only, labelled as AI text. A text-only model gets a clear "pick a model that reads images" error. Not counted against the AI translation budget.

## Post and profile tools

### 16. Read post text and media descriptions aloud — done 2026-11-10

**Phanpy:** Exposes “Speak” for post text and media descriptions using browser speech synthesis when available.

**Mawkingbird:** No corresponding speech-synthesis action was found. Playing attached audio or using an external screen reader is not this user-invoked feature.

**Completion criterion:** Read the selected post or description aloud and stop/cancel playback, using available language/voice support and sensible unavailable behavior.

Sources: [Phanpy speech utility](../../REFERENCE/phanpy/src/utils/speech.js), [post actions](../../REFERENCE/phanpy/src/components/status.jsx), [media-description dialog](../../REFERENCE/phanpy/src/components/media-alt-modal.jsx); [mawkingbird status card](../ui/src/app/status-card/status-card.ts), [lightbox](../ui/src/app/lightbox).

**Implemented:** ••• → Read aloud / Stop reading on every post, using the browser's speech synthesis in the post's language (a local voice preferred). It reads the content warning, text (links as site names), image descriptions and poll choices. The lightbox has "🔊 Read description". One thing speaks at a time; nothing leaves the device. Hidden where the browser has no speech synthesis.

### 17. Translate profile biography and metadata fields — done 2026-11-10

**Phanpy:** “Translate bio” includes the biography and profile field names/values in a translation workflow.

**Mawkingbird:** Post translation is implemented, including media-description text, but profiles do not offer equivalent biography/field translation. UI localization calls in the profile component do not translate user-authored content.

**Completion criterion:** Request a translation of a profile biography and fields while retaining access to the original. Reuse the existing translation choices where appropriate.

Sources: [Phanpy translated-bio sheet](../../REFERENCE/phanpy/src/components/translated-bio-sheet.jsx), [related actions](../../REFERENCE/phanpy/src/components/related-actions.jsx); [mawkingbird profile](../ui/src/app/pages/profile/profile.ts), [translation router](../ui/src/app/translation/translation-router.ts).

**Implemented:** "Translate bio" under another person's bio translates the bio plus each "Label: value" field through the existing chain (browser → MyMemory → Apertium → AI as configured; not the server, which only translates statuses). The original stays visible, the result has Hide, and an unsure language offers source choices.

### 18. Describe and remove profile images — done 2026-11-10

**Phanpy:** On its newer profile-API path, edits avatar/header descriptions and removes either image. The implementation enables that path using the server API-version information and otherwise falls back to traditional profile editing.

**Mawkingbird:** Can upload/replace avatar and header through credential updates, but the editor has no image-description fields or image-removal operation.

**Completion criterion:** On capable servers, read/edit avatar and header descriptions and remove either image without uploading a replacement. Refresh the displayed profile after changes and retain the older-server profile-editing path.

Sources: [Phanpy edit-profile sheet](../../REFERENCE/phanpy/src/components/edit-profile-sheet.jsx); [mawkingbird profile editor](../ui/src/app/pages/settings/profile/settings-profile.ts), [API](../ui/src/app/api.ts).

**Implemented:** Settings → Public profile (Mastodon) shows the current avatar and header (the server's `missing.png` placeholder counts as none). Remove avatar / Remove header ask for confirmation and call `DELETE /api/v1/profile/avatar|header` (Mastodon 4.2+), then clear that image's description. The page probes `GET /api/v1/profile`; when it returns `avatar_description`/`header_description` (4.6, API version 9) the description fields appear, and only changed descriptions are sent with `PATCH /api/v1/profile` after the ordinary credentials save. Older servers keep the existing editor unchanged.

### 19. Unwrap a chain of quoted posts — partial

**Phanpy:** Provides “Unwrap quote chain,” following successive quotes and presenting the chain together, fetching in batches as needed.

**Mawkingbird:** Renders quotes and implements quote-related actions, but no chain traversal/reader was found. Listing posts that quote a status answers a different question.

**Completion criterion:** Starting with a quote of a quote, retrieve and read the successive referenced posts together; terminate safely on missing posts, cycles or the end of the chain, and allow longer chains to continue.

Sources: [Phanpy quote-chain modal](../../REFERENCE/phanpy/src/components/quote-chain-modal.jsx), [post action](../../REFERENCE/phanpy/src/components/status.jsx); [mawkingbird status card](../ui/src/app/status-card/status-card.ts), [quote preview](../ui/src/app/compose/quote-preview).

### 20. Generate portable HTML for a post — done 2026-11-10

**Phanpy:** “Embed post” generates copyable HTML containing attribution, content, media and poll information, with a preview. This is an export operation, not just rendering a linked post inside the app.

**Mawkingbird:** Has sharing, copying and embedded-content display, but no equivalent post-to-HTML export control was found.

**Completion criterion:** Generate, preview and copy a usable HTML representation of a supported post, preserving attribution, links, content warnings and media descriptions.

Sources: [Phanpy post-embed modal](../../REFERENCE/phanpy/src/components/post-embed-modal.jsx); [mawkingbird status card](../ui/src/app/status-card/status-card.ts), [share dialog](../ui/src/app/share-dialog/share-dialog.ts).

**Implemented:** status ••• → Embed post… (public/unlisted Mastodon posts) opens `PostEmbedDialog`: allow-listed, escaped `<blockquote>` HTML with attribution, link, CW as `<details>`, media with descriptions, poll results and up to two quote levels; copy button and a permissionless sandboxed preview.

### 21. Profile QR sharing and in-app QR scanning — done 2026-11-10 (shortcut-import QR not applicable until item 2)

**Phanpy:** Generates profile QR codes and provides a camera scanner for opening supported profile links. QR scanning also participates in shortcut import.

**Mawkingbird:** Ordinary profile links and sharing are available, but no profile QR generator or in-app scanner was found. References to a URL-shortener service's QR capability are not this workflow.

**Completion criterion:** Show a scannable profile link and resolve a supported scanned link into the appropriate in-app account. If shortcut sharing from item 2 is implemented, support its corresponding QR import path as well.

Sources: [Phanpy account information](../../REFERENCE/phanpy/src/components/account-info.jsx), [QR modal](../../REFERENCE/phanpy/src/components/qr-code-modal.jsx), [scanner](../../REFERENCE/phanpy/src/components/qr-scanner-modal.jsx); [mawkingbird profile](../ui/src/app/pages/profile/profile.ts), [share dialog](../ui/src/app/share-dialog/share-dialog.ts).

**Implemented:** profile ••• → QR code (own and other profiles with a canonical URL) opens `ProfileQrDialog`, which lazy-loads the `qr` package to draw the code. Scan a code uses the camera with the native `BarcodeDetector` or the `qr` decoder fallback, accepts profile URLs and handles, and resolves them through the signed-in server before opening the in-app profile.

### 22. Persistent, searchable “Year in Posts” archive — partial

**Phanpy:** Fetches a selected year's posts into a locally persisted, account-scoped dataset; supports regeneration/removal, month browsing, post-type filtering, local text search and ordering by time or engagement.

**Mawkingbird:** Account analytics already includes posting calendars, monthly activity and top posts. The gap is the year-specific persisted corpus and its browsing/search lifecycle, not a missing analytics dashboard or calendar design.

**Completion criterion:** Fetch and retain a selected year's available posts, reopen and search that corpus locally, filter by month/type, change order, and regenerate or remove the saved year. Be explicit about fetch failures and unavailable/deleted posts.

Sources: [Phanpy Year in Posts](../../REFERENCE/phanpy/src/pages/year-in-posts.jsx), [fetch/persistence utilities](../../REFERENCE/phanpy/src/utils/year-in-posts.js); [mawkingbird account analytics](../ui/src/app/account-analytics/account-analytics.ts), [routes](../ui/src/app/app.routes.ts).

## Lists, moderation and newer server capabilities

### 23. Rename Mastodon lists and change their reply policy — done 2026-11-10

**Phanpy:** Its list editor changes the name and chooses replies to list members, replies to followed people, or no replies. It also supports list exclusivity.

**Mawkingbird:** Can create/delete lists, manage membership and toggle exclusivity. `Api.updateList` deliberately preserves the existing title/reply policy while changing exclusivity; no corresponding editor for those two preserved fields was found. Local client-list editing is not editing a server-side Mastodon list.

**Completion criterion:** Rename an existing server list and choose/persist any of the three server reply policies, without resetting exclusivity or membership. Offer the policy during creation too.

Sources: [Phanpy list editor](../../REFERENCE/phanpy/src/components/list-add-edit.jsx); [mawkingbird API](../ui/src/app/api.ts), [list timeline](../ui/src/app/pages/list-timeline/list-timeline.ts), [list dialog](../ui/src/app/list-dialog/list-dialog.ts).

**Implemented:** list page members tab → Rename / replies… opens `ListSettingsDialog` (`Api.editList` resends unchanged fields so exclusivity is kept). The Lists page create row offers the reply policy.

### 24. Report specific server-rule violations and forward reports — done 2026-11-10

**Phanpy:** A report can identify particular server rules and optionally be forwarded to the remote account's server. Rule labels can use available translations.

**Mawkingbird:** Sends category, comment, account ID and optional status IDs. Its report dialog does not collect rule IDs or forwarding consent, and `Api.report` does not send those fields.

**Completion criterion:** Select applicable rules for a rule-violation report, submit their IDs, and explicitly opt into forwarding a remote-account report. Preserve the existing confirmation and error handling. No report needs to be sent merely to implement or review this work.

Sources: [Phanpy report modal](../../REFERENCE/phanpy/src/components/report-modal.jsx); [mawkingbird report dialog](../ui/src/app/report-dialog/report-dialog.ts), [API](../ui/src/app/api.ts).

**Implemented:** choosing `violation` loads the server rules (cached `ServerAbout`) as checkboxes, and at least one is required when the server has rules; `rule_ids` are sent. Remote accounts get an opt-in forward checkbox (`forward: true`); it is never on by default.

### 25. Complete newer Collections and annual-report workflows — done 2026-11-10

These are independent server-dependent sub-items; neither implies that Collections or analytics are wholly absent.

| Sub-item | Phanpy behavior | Remaining mawkingbird work | Completion criterion |
| --- | --- | --- | --- |
| 25a. Collection language and sensitivity | Collection editor exposes language and “Mark as sensitive.” | Creation hard-codes `sensitive: false`; the update contract has name, description and discoverability but no sensitivity or language. | Create/edit supported language and sensitivity fields, and reload their saved values. |
| 25b. Report a collection | Reports include `collectionIds`, comments and optional remote forwarding. | Existing report requests identify accounts/posts only; no collection-report workflow was found. | Report the specific collection ID, with explicit forwarding choice where applicable. |
| 25c. Read a server annual report | The `/annual_report/:year` route fetches a server-provided report and displays its metrics, referenced accounts and top statuses. | Annual-report endpoints appear in generated API documentation, but no application request/view was found. | Read and display an available server report for a year, with unsupported/missing-report handling. |

The annual-report source is a relatively basic reader. This audit does **not** credit Phanpy with a complete report-generation or report-management workflow. It is separate from the client-generated Year in Posts feature in item 22.

Sources: [Phanpy collection editor](../../REFERENCE/phanpy/src/components/collection-add-edit.jsx), [collection reporting](../../REFERENCE/phanpy/src/components/report-collection.jsx), [annual-report page](../../REFERENCE/phanpy/src/pages/annual-report.jsx), [route registration](../../REFERENCE/phanpy/src/app.jsx); [mawkingbird API](../ui/src/app/api.ts), [collection page](../ui/src/app/pages/collection/collection.ts), [report dialog](../ui/src/app/report-dialog/report-dialog.ts), [routes](../ui/src/app/app.routes.ts).

**Implemented:**
- 25a: `CollectionSettingsDialog` creates (Lists → Collections → More options…) and edits (collection page → Edit collection…, owner only) name, description, language, sensitivity and discoverability, reloading saved values. Quick create still sends the explicit defaults. Sensitive collections show a badge on their page.
- 25b: non-owners signed in to Mastodon get Report collection on a collection page. The report goes to the curator's account with `collection_ids`, and the existing rule and opt-in forwarding controls apply.
- 25c: `/annual-report` lists your server reports and, on 4.6+, offers to generate this year's when the state is `eligible` (no polling; a Check again button). `/annual-report/:year` renders any report schema generically: month names, linked accounts and top posts as status cards. 4.3 servers fall back from the per-year route to the list; servers without the API show an unsupported message. Entry: your own profile ••• → Annual report from your server.

## Boundaries of this backlog

Purely visual differences are excluded: themes, typography, spacing, icon choices, status-action placement, the boosts carousel's presentation, hashtag collapsing and animation. Different keyboard bindings are also not a missing feature when the same operation is available.

Existing functional equivalents were not turned into backlog items merely because their interfaces differ. In particular, the source review found multi-account support, draft recovery, scheduling, grouped notifications, multi-hashtag timelines, basic quote controls, ordinary post translation and edit history. References to these capabilities above only identify the narrower remaining gap; they are not a request to reimplement them.

This document is an implementation starting point grounded in the checked-out code. Before closing an item, verify the user-visible workflow against an appropriate server/browser, including persistence and account isolation where relevant. For conditional items, record the capabilities actually tested rather than treating a successful mock response as proof of server support.
