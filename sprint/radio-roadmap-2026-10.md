# Radio and Studio roadmap, October 2026

Status: planned · 2026-10-26. Companion specs:
[audio player](../spec/audio_player_improvements.md),
[audio Studio](../spec/audio_studio_improvements.md). Those specs cover later
listening/processing features; this plan fixes the everyday flow first.

## Owner decisions (2026-10-26)

| Topic           | Decision                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Embed consent   | In Radio, ask once per provider; remember per account. Feeds keep click-to-load.                                                     |
| Persistent dock | Opaque, sticky at the bottom of the middle column, in normal layout flow. No floating, see-through overlay.                          |
| Playlists       | A Mastodon self-reply thread is the playlist. Local copies are drafts or a cache.                                                    |
| Studio          | Top-level navigation only; remove the Radio tab. Studio = the real Compose component plus audio tools.                               |
| Toolbars        | SVG icon buttons with aria-label and tooltip for transport and row actions; overflow ⋯ menu for rare actions. No emoji.              |
| Track titles    | A cascade: provider/archive metadata API → file tags (ID3) where CORS allows → attachment description → first line of post → author. |
| Archives        | Try direct files and Wikimedia Commons first, then the LoC resolver (probe results below).                                           |
| First sprint    | Listening flow.                                                                                                                      |

## Findings from the investigation

- **Embed friction.** Inside Radio an external track needs Load → Play → Play
  inside the iframe. `ExternalPlayer` doesn't create the iframe until it's
  activated, and `RadioPlayer.externalAllowed` lasts only for one session and is
  cleared by `stop()`. Autoplay happens only after `attachWidget` with
  `autoExternalPlay`, i.e. on queue advance.
- **Queueable providers** are only native audio, SoundCloud and Mixcloud
  (`controllable`). This matches the "about 3 domains" observation.
- **Titles.** Queue rows render "Play track N by Author"; the playlist uses
  `media.description || external.label || author`. No title metadata exists.
- **Dock.** `radio-dock.ts` is `position: fixed`, sized to `#main` by a
  ResizeObserver, with a shadow and a `--radio-dock-space` padding hack.
- **Taxonomy.** Studio appears in `shell/mode-nav.ts` and again as a fourth tab
  in `radio-page.html`.
- **Studio composer.** It has a plain post-text textarea that appears only after
  a file is staged. There's no length counter, proofreader, tags, targets or
  visibility parity with `compose/compose.ts`.
- **Playlists** are `localStorage` (`mockingbird_radio_playlists` + account
  suffix) plus a `#playlist=` URL fragment. "Draft playlist thread" hands links
  to Drafts but never links the published thread back to the playlist.
- **"Open in Radio" lands on Search.** `status-card.ts` `radioPost` offers the
  action for any non-video audio embed. `RadioPage.loadPost` builds tracks only
  from controllable sources, so Spotify/Bandcamp/Apple posts produce zero tracks
  and the code sets `view = 'search'`. Even a working link opens the Playlist
  tab, not the player, and _replaces_ the current queue. A failure fetching the
  post anonymously from its origin server is a second possible cause. Not yet
  reproduced in a browser.
- **CSP.** `ui/src/index.html` `frame-src` lists providers explicitly, so any
  new iframe origin must be added there.

### Archive probes (curl, 2026-10-26; not yet browser-verified)

| Source                                             | Result                                                                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `upload.wikimedia.org/.../Example.ogg`             | 200, `application/ogg`, `Access-Control-Allow-Origin: *`. Plays in `<audio>`; Web Audio and ID3/metadata reads should also work.  |
| Commons API `action=query&prop=imageinfo&origin=*` | 200, ACAO `*`. Can supply title, artist, licence and the direct URL for `commons.wikimedia.org/wiki/File:…` links.                |
| `loc.gov/item/playlist?tracks=…&embed=resources`   | 200, `frame-ancestors *`. Framing is allowed. No known postMessage API, so it is inline-only and can't join the queue.            |
| `loc.gov/item/<id>/?fo=json`                       | 200 with ACAO `*` (an earlier bare request got a 403; send an identifying User-Agent). Exposes direct `tile.loc.gov/...mp3` URLs. |

Conclusion: both Wikimedia and LoC can become **native, queueable** tracks by
resolving to direct files. That beats the LoC iframe, which stays an inline
fallback. `media-src https:` already permits the files.

## Sprint 1 — listening flow

1. **Fix Open in Radio.** It adds the track to the current queue (no replace),
   selects it and opens the `radio` view. It's offered only when the post has a
   queueable source; otherwise the post's inline player stays the path. Show an
   error state instead of silently falling back to Search.
2. **Remembered per-provider consent.** On the first Radio use of a provider,
   show an inline "Allow SoundCloud in Radio" prompt. Store the allow-list per
   account (new registered storage key) and give it a revoke control in Settings.
   After consent, the current track's iframe loads and autoplays with no Load
   button; `stop()` no longer clears consent. Feed cards stay click-to-load.
3. **Docked bar.** Replace the fixed overlay with an opaque sticky bar at the
   bottom of the middle column, in normal layout flow. Remove the padding hack.
   Collapsed: artwork, title, author, play/pause, next, expand, close. Expanding
   reveals the iframe for embeds that need to stay visible. Check the 720 px
   mobile layout and the bottom tab bar.
4. **Icon transport controls.** Prev/play/next/stop/expand and playlist row
   actions (move, remove, play) use SVG icons. Prefer extending the design-system
   toolbar with an icon variant; if that touches a shared widget, run
   `make design-verify`.
5. **Title cascade (first pass).** Provider titles (SoundCloud/Mixcloud oEmbed
   or widget metadata), then attachment description, then first line of post
   text, then author. ID3 and archive metadata come in sprint 3.

Acceptance: an external track added from a feed plays in Radio with at most one
click the first time per provider, and zero after that. The dock never covers
post content. Queue rows show titles. Gates: targeted specs, `cd ui && make test`
(including the design inventory check), `npm run build:mockingbird` with the
startup budget, and browser checks with real SoundCloud/Mixcloud frames.

### Sprint 1 progress (2026-10-26) — ready for a user trial

- **Open in Radio.** Offered only for posts with continuous sources. The card
  hands the post object to Radio (`radio-handoff.ts`), so there's no refetch from
  its origin. The post is appended to the queue and plays in the Radio view; add
  and play parameters leave the URL. A non-queueable shared link explains itself
  on Search. Shared links still never autoplay.
- **Consent.** `mockingbird_radio_providers` (per account, registered) remembers
  allowed providers. The first use shows **Allow {provider} in Radio**; after
  that, the frame loads and plays on select or advance. Stop and Close no longer
  forget consent. `forgetProvider()` exists but has no UI yet.
- **Dock.** It's an opaque sticky bar in the column flow: thumbnail, title,
  author, and play/pause, next, show/hide player and stop. The provider frame
  stays loaded but folded. The fixed overlay, ResizeObserver and padding hack
  are removed.
- **Icons.** Local SVG icons (`radio-icon.ts`) on the transport and
  playlist-row ToolbarButtons, with aria-label and tooltip. Accessible names are
  unchanged.
- **Titles.** `track-title.ts` cascade: SoundCloud `getCurrentSound`, then
  native description, then post text, then author. It's used in the dock, the
  full player heading, the queue and playlist rows.

Not yet done in sprint 1:

- Page-level Radio toolbars (Play playlist, Add results, Draft post/thread,
  saved-playlist Load/Delete) still render as text-only buttons. Planned
  treatment: icon buttons plus a ⋯ overflow menu.
- A Settings or Playlist control to revoke a provider.
- Mixcloud titles (its widget has no title method; oEmbed would contact the
  provider before consent).
- Translations of the new strings (they fall back to English).

Validation: `cd ui && make test` (includes `design:inventory-check`, test
inventory and coverage), `npm run check:static`, `ng lint`,
`npm run build:mockingbird` (initial total 840.94 kB),
`npm run test:radio:browser` (passed twice), and `make design-verify`
(418 browser assertions). The inventory was regenerated and reviewed (one
styling escape removed). `make test-integration` was not run; no API calls
changed.

## Sprint 2 — Studio as Write-plus-audio, and the taxonomy

1. Remove the Studio tab from Radio. Studio stays in top-level mode navigation.
2. Rebuild Studio around the real Compose component, with the staged audio
   preattached: text, content warning, visibility, length, proofreader, tags and
   targets. Decide whether Compose accepts an injected attachment or Studio wraps
   it. Investigate before choosing; avoid forking Compose.
3. Audio tools go in a side panel (stacked on mobile): inspection details and the
   preview player first. The trim/fade work from the Studio spec, Phase 1, comes
   later.
4. Keep the catalogue as a secondary Studio view.

Read `MIGRATION.md` before touching publishing. Keep explicit publication,
upload limits and duplicate-submit protection.

## Sprint 3 — more sources and better titles

1. Direct audio links (`https`, audio extension or checked content type) become
   native queueable tracks.
2. Wikimedia Commons: `upload.wikimedia.org` files and `File:` pages, resolved
   through the Commons API for title, artist and licence.
3. Library of Congress: resolve `loc.gov/item/<id>` (and the `playlist?tracks=`
   form) through `?fo=json` to `tile.loc.gov` MP3s with item titles. The LoC
   iframe stays an inline fallback only; add `https://www.loc.gov` to `frame-src`
   only if that fallback is shipped.
4. ID3 title/artist reads for CORS-readable native files, using byte-range
   requests and lazy loading; keep this out of the root bundle.

## Sprint 4 — playlists as threads

1. Model: a playlist = a root post (name and description) plus self-replies,
   each holding one or more track links. It's identified by the root post's URL.
   The existing thread import already reads this shape.
2. Publish creates the thread; editing a published playlist appends replies, or
   edits/deletes replies where the server supports that. Show which operations
   cost a new post.
3. Local playlists become unpublished drafts and a cache of published ones. Keep
   the existing storage key name and migrate its contents in place.
4. A "My playlists" view lists the user's playlist roots (via a hashtag or
   marker convention, to decide in this sprint). It can open, play, append and
   share a playlist.
5. Per-entry titles, editable in the playlist and carried in the reply text.

## Sprint 5 — single-recording page

A video-page-style view for one recording: a large player, the post, and
threaded comments with an inline reply composer (reusing the mini composer).
Add to queue / play next. Comments must stay readable while playback continues;
the dock keeps playing when you navigate away. Podcast-length items get resume
(from the player spec, Phase 1).

## Resolved questions (2026-10-26)

- Search and Playlist stay separate features and tabs.
- Playlist detection needs no marker: a post is a playlist when its author's
  self-reply thread (one or more posts) holds two or more _distinct_ recordings.
  Several provider links to the same song count as one recording, so detection
  must group alternatives. A first heuristic is that links in the same post,
  without other per-link text, are alternatives. Refine it in sprint 4.
- Manual-advance tracks are not Radio. Only sources that report their end can
  join the queue; others stay inline players in feeds.
