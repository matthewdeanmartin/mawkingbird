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

Completed after the first trial:

- **Radio Settings tab** (Search · Playlist · Radio · Settings), using the
  settings design language (`mb-settings-row`, checkbox, field). It lists
  allowed players with **Remove {provider}**, **Play the next track
  automatically** (off stops after each recording, for podcasts), and
  **Starting volume**. Stored in `mockingbird_radio_settings` (per account,
  registered); provider widgets receive the volume when they attach.
- **Page-level actions.** Play playlist is a primary Button and Add results is
  an outline Button; drafting a post or thread moves into a ••• menu. Saved
  playlists use the icon-row treatment (load as list, delete), with titles and
  track counts.
- Mixcloud titles already fall back to post text through the cascade (clipped
  to about 80 characters; the bar truncates visually). No change needed.
- Translations: deliberately out of scope until Radio is complete. All i18n is
  done globally at the end.

Sprint 1 validation is recorded with sprint 2 below.

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

Keep explicit publication, upload limits and duplicate-submit protection.
(`MIGRATION.md` covers site deployment, which this sprint does not touch.)

### Sprint 2 progress (2026-10-26) — ready for a user trial

- **Taxonomy.** Studio is no longer a Radio tab. `/radio/studio` (same URL) is
  its own page, reached from the top-level mode navigation, with tabs **New
  audio post** and **My audio** (catalogue, `?view=catalogue`).
- **Composer.** The page hosts the shared `app-compose` (`draftContext="studio"`),
  so the post gets the full composer: text, content warning, visibility,
  language, targets, proofreader, tags, alt text and drafts. Compose gained only
  `attachUploaded(media, file)` and a read-only `attachmentIds`; nothing is
  forked.
- **Recording panel.** Choose a file and see its format, size and duration
  (from the preview's metadata), plus a preview player. **Attach to post** runs
  the session's existing pipeline (server limit check, upload, wait for
  processing) and then hands the processed attachment to the composer. Removing
  it in the composer releases it in Studio; returning to Studio reattaches it.
  **Discard recording** removes it from both.
- **Session.** `publish()` became `attach()` / `detach()` / `posted()`. The
  composer now creates the status, so Studio's own text, warning and visibility
  fields are gone. Retrying a failed attach still reuses the upload.
- **Behaviour change:** Studio previously defaulted to Followers-only
  visibility; the composer now uses the account's normal default.

Still to do (moved to a later sprint): the trim/fade/inspection tools from the
Studio spec, Phase 1. Recording bytes remain session-only.

Validation (sprints 1 and 2 together): see the final report in this file's
history; targeted specs, `make test`, `check:static`, `ng lint`,
`build:mockingbird`, `test:radio:browser` and `make design-verify`.

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

Owner constraint (2026-10-26): never send audio or video bytes through the
Mawkingbird Plus proxy. Playback needs no CORS: an `audio` element plays any
https file. CORS matters only for reading bytes ourselves.

### Sprint 3 progress (2026-10-26) — ready for a user trial

- **Recognition** (`audio-embeds/linked-audio.ts`, pure, no requests). These
  links become playable files:
  - direct https links ending in mp3/ogg/oga/opus/m4a/aac/flac/wav;
  - Commons and Wikipedia `File:`/`Media:` pages, via `Special:FilePath`, a
    redirect to upload.wikimedia.org that needs no API or hash;
  - Archive `/details/<item>/<file>` and `/download/…` file links, via the
    `/download/` address.

  Links are memoized per post object. http, credentialed, ported, wiki-article
  and category links are refused.

- **Radio.** Linked files are native queueable tracks; the track's post copy
  carries the file, so saved playlists keep it. Scans include posts with linked
  files unless the search is limited to native Mastodon audio.
- **Library of Congress** (`linked-audio-resolver.ts`, lazy Radio chunk).
  `loc.gov/item/<id>` and `item/playlist?tracks=a|b` resolve through
  `?fo=json&at=item,resources` (about 11 KB, ACAO `*`). Requests use `fetch`
  with credentials omitted and no referrer; the app's authenticated HTTP client
  is never used for another origin. At most 2 lookups run at once, results
  (including failures) are cached up to 500 entries, and only `tile.loc.gov`
  https files are accepted. Titles come from the item title and first
  contributor. The LoC iframe was not shipped and `frame-src` is unchanged.
- **ID3 titles.** One 64 KB `Range` read for the current and next three MP3
  tracks. It needs the host to allow cross-origin reads; a server that ignores
  Range is cut off after 64 KB. Parser `audio-embeds/id3.ts` handles v2.2–v2.4.
  Verified live: LoC MP3s carry only an encoder frame, so their titles come from
  the JSON instead.
- **Title cascade:** widget metadata → ID3 → native description → post text →
  linked file name → author.
- **Status cards** play linked files inline with `preload="none"` (no bytes until
  Play), except where a provider player already covers the link (Archive item
  pages). Posts with linked files or LoC items get Open in Radio and Add to
  playlist.
- **Playlist import:** Commons pages now import as their file, not the HTML page
  (an older bug). LoC item links import after resolution, and thread imports no
  longer count linked files twice.

Not done: Commons licence/artist metadata (the API supports CORS; titles from the
file name are adequate for now), and podcast RSS enclosures (backlog).

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

### Sprint 4 progress (2026-10-27) — ready for a user trial

- **Thread format** (`playlist-thread.ts`). The root post holds the name,
  optional description and "N tracks, one per reply…". Each reply is
  `n. Title` with the link on the next line. Replies under a public root are
  unlisted; otherwise they match the root.
- **Detection without a marker.** A self-reply thread is a playlist when it holds
  two or more distinct recordings, using these rules:
  - each audio attachment counts as one recording;
  - all audio links in one post count as one recording (alternatives such as
    Spotify, Apple and SoundCloud for the same song);
  - except numbered lines (`3. Title`, or `3) Title`, with the link on the same
    or the next line), where each line is its own recording.
- **Publishing** (`playlist-publisher.ts`) runs from the Playlist tab: choose a
  visibility, review the plan ("create N posts, edit M, delete K"), then Publish
  thread. Progress is saved after every request, with deterministic idempotency
  keys, so a failure resumes with **Update thread** without duplicating posts.
- **Updating.** Diffed against the published entries:
  - a common prefix is kept;
  - removed or reordered entries after it are deleted and reposted;
  - a renamed entry becomes an edit of its reply;
  - a renamed playlist, or a change in track count, edits the root.

  There's a warning above Mastodon's roughly 30 deletions per half hour.
  Threads not laid out one track per reply can be appended to but not pruned.

- **Local model.** The same `mockingbird_radio_playlists` key, with new optional
  `description` and `published` fields; old rows load unchanged. Saving updates
  the loaded playlist (a renamed published one keeps its thread). "Save as a new
  playlist" is in the ••• menu.
- **Find my playlist threads** scans the five most recent pages of your own
  posts (up to 200) and lists qualifying threads. **Add to saved playlists**
  links one to its replies, so it can be edited in place.
- **Rename** on each entry (AppDialogs prompt). The user's title leads the
  title cascade, and numbered prefixes are stripped from post-text titles.
- **Full player:** while an external player is not ready, an overlay covers the
  inert controls with the one step needed: Allow, Load, or a loading status.
- **Feeds:** a provider allowed in Radio gets **Play on {provider}** on cards,
  which loads and starts the player in one click. Players still load only when
  asked. Permission now lives in the shared `ProviderConsent` service.

Not done:

- Opening someone else's playlist thread from its card. Open in Radio loads
  only that post; pasting the root URL into Import, with "Include the author's
  self-reply thread", loads the whole thread.
- Paging the thread finder beyond 200 posts.

## Sprint 5 — Listen: the single-recording page

A video-page-style view for one recording: a large player, the post, and
threaded comments with an inline reply composer (reusing the mini composer).
Add to queue / play next. Comments must stay readable while playback continues;
the dock keeps playing when you navigate away. Podcast-length items get resume
(from the player spec, Phase 1).

Name: **Listen**, the audio counterpart of Watch (route `/listen?post=…`). It is
also where inline-only providers (Deezer, Apple Music/Podcasts, Spotify,
Bandcamp…) go. Their cards get **Open in Listen** instead of Open in Radio, because
a single recording does not need continuous advance.

### Sprint 5 progress (2026-10-27) — ready for a user trial

- **Route.** `/listen?post=<id or portable ref>&server=<origin>[&media=<id>]`,
  the same parameters and server check as Watch (`listenParams` in
  `radio-links.ts`). It belongs to Radio mode.
- **Stage.** Artwork or a placeholder, title (cascade) and author, then **Play**;
  for a recording with a saved position, **Resume from 12:34** and **Start from
  the beginning**. Also **Play next in Radio** and **Add to Radio queue**, and a
  picker when a post holds several recordings. Content-warning, filter and
  text-only gates match Watch.
- **Playback through Radio.** `playNow` inserts after the current track and
  keeps the queue. While Listen shows the playing native recording, the dock is
  hidden and the page has its own transport: play/pause, −15/+30 for anything
  over two minutes, and a position range. Leaving the page hands back to the
  dock and playback continues. Provider recordings (SoundCloud/Mixcloud) keep
  their frame in the dock, and the page says so.
- **Inline-only providers** (Deezer, Apple, Spotify, Bandcamp, Archive embeds…)
  play in the page through the lazy player host, labelled as stopping when you
  leave. Their cards now offer **Open in Listen** where Open in Radio is not
  available.
- **Conversation.** The post's card (the reply composer is inline, as on every
  card), then replies indented by depth up to three levels. New replies,
  edits and deletions update in place.
- **Resume** (player spec, Phase 1). `mockingbird_radio_positions` (per account,
  registered, private, 100 entries) keeps positions for recordings of 10 minutes
  or more. It saves every 15 s and on pause or track change, and is cleared near
  the end. Restoring never autoplays: it is offered as a button.
- **Fix found by the browser check:** returning to a Radio address whose
  `#playlist=` fragment matches the playing queue (browser Back from Listen,
  for one) re-imported it, replacing the queue and stopping playback. A matching
  fragment is now left alone.
- **Entry points.** Card ••• menus (all three) and the audio toolbar for
  inline-only posts; in Radio, the full player's "Open post" became **Open in
  Listen** (not shown for pasted links, which have no post).

## Resolved questions (2026-10-26)

- Search and Playlist stay separate features and tabs.
- Playlist detection needs no marker: a post is a playlist when its author's
  self-reply thread (one or more posts) holds two or more _distinct_ recordings.
  Several provider links to the same song count as one recording, so detection
  must group alternatives. A first heuristic is that links in the same post,
  without other per-link text, are alternatives. Refine it in sprint 4.
- Manual-advance tracks are not Radio. Only sources that report their end can
  join the queue; others stay inline players in feeds.

## Follow-up (2026-10-27): hashtag search, saved searches, audio services

- **Hashtag source** in Search (the playlist builder). `#robotmusic`,
  `robotmusic` or a pasted `/tags/` URL are accepted. Signed in, it reads the
  home server's tag timeline; signed out, the public timeline of the browsing
  server. The server-side media filter applies only to native-only searches,
  because tagged music posts are usually links.
- **Saved searches** (`mockingbird_radio_searches`, per account). **Save this
  search** stores the source with its handle, list or tag and the native-only
  choice, under a suggested name (`#tag`, `@handle`, the list title). Saved
  searches appear in an optgroup of **Audio source**; choosing one fills the
  form and runs it. Signed out, only account and hashtag searches are offered.
  They're removed in Radio → Settings.
- **Audio services** (`mockingbird_audio_services`, per account; shared by
  cards, Listen and Radio). The rules, implemented as one pure function
  (`arrangeSources`) so every surface agrees:
  1. Hidden services never show a player, even as a post's only option or with
     Show all on. The post text still links them.
  2. Subscribing and hiding are mutually exclusive, enforced in the setters and
     repaired on load. Only paid services (Apple Music, Spotify, YouTube Music,
     Amazon Music, TIDAL, Deezer) can be subscribed to.
  3. With subscriptions recorded and Show all off, unsubscribed paid services
     are dropped only when the post also offers a subscribed or free service
     (SoundCloud, Mixcloud, Bandcamp, Apple Podcasts, Internet Archive,
     Audio.com, and services outside the catalogue). A post offering only
     unsubscribed paid services keeps them: they may play previews, and
     nothing better exists.
  4. With subscriptions, the order is subscribed, then free, then the rest;
     without any, the post's order stands.
  5. Native attachments and linked files are never affected.
  6. Saved playlist entries are never removed by preferences: a hidden
     service's track saved on purpose stays playable. Preferences decide only
     what is offered (cards, Listen, Radio's choice of alternative, discovery).
  7. "Show all players" is disabled until a subscription exists, since it has
     no effect without one.

## Next phase: finding music and creator tools (planned 2026-10-27; on ice for user trials)

### What early users are telling us

- **Finding music is hard; filling a playlist is very hard.** Radio searches
  the posts a person already reads (their account, home, lists, a hashtag).
  Few posts carry playable audio, so a scan of hundreds of posts may yield a
  handful of tracks, while a playlist wants 10–30.
- **The common use is one clip:** find a track, listen once. Listen serves
  this, but people have to find it first.
- **The supply has to grow.** Discovery can only surface what exists; the
  fediverse needs more well-formed music posts, which means creator tools.

### Principles carried forward

- No media bytes through the Plus proxy. Catalogue and metadata JSON go
  straight from the browser when the API allows it (verified below); anything
  needing a secret key is a separate owner decision.
- Results become ordinary Radio tracks and can be published with the existing
  playlist-thread publisher. Avoid inventing a second playlist format.
- Prefer sources that are public domain or freely licensed and queueable
  (native, linked files, LoC, Commons, Archive): they play fully, advance
  automatically, and are safe to repost.

### API checks (curl with an `Origin` header, 2026-10-27)

| API                                                        | Browser use                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Internet Archive `advancedsearch.php` and `/metadata/<id>` | 200, ACAO `*`: search by collection or subject, then list files         |
| Library of Congress `/audio/?q=…&fo=json`                  | 200, ACAO `*`: keyword search of audio items (item lookup already used) |
| Wikimedia Commons `list=search` with `filetype:audio`      | 200, ACAO `*` (`origin=*`)                                              |
| song.link / Odesli `v1-alpha.1/links`                      | **401 without a key**: cross-service matching needs an API key          |

Spotify, Apple Music and YouTube playlist contents need provider
authorization (OAuth, MusicKit or Data API keys). None can be read
anonymously from the browser.

### Proposed sprints (in priority order)

**Sprint 6 — catalogue search as a Radio source (biggest supply gain).**

- New Audio source choices: Library of Congress, Internet Archive (audio
  collections such as 78rpm, etree, podcasts) and Wikimedia Commons. A keyword
  search returns tracks directly, with no Mastodon post needed, titled from
  catalogue metadata, with licence or rights text shown.
- Select several results, then add them to the playlist ("Add 12 selected").
  Results stream in pages; results already queued are marked.
- **Fill to N:** a scan option to keep reading a feed or hashtag until N
  playable tracks are found or a page budget runs out, reporting density
  ("found 6 in 400 posts").

**Sprint 7 — stations: out of scope (owner decision, 2026-10-27).**
Mawkingbird is a static client. A station built from feeds would have to
download a very large number of posts to find the few with usable audio, so
stations, hashtag fan-out across servers and feed-derived "more like this" are
dropped. Catalogue search (Sprint 6) is the supply answer instead.

**Sprint 8 — share and creator tools inside Mawkingbird.**

- **Share a track** from Listen, Radio rows and catalogue results. This opens
  the composer prefilled with a title line, the link, optional
  `#nowplaying`/genre tags and attribution (and licence for catalogue items).
  Quote-posting is offered where the server supports it.
- **Catalogue playlist composer:** search LoC, Archive or Commons, pick N
  items, review titles, then publish as a playlist thread. One step from
  "I found good public-domain recordings" to a shareable playlist.
- **Append to my playlist** from any card or result. This adds a reply to a
  chosen published playlist through the existing update plan, with its cost
  shown.
- **Post a song list:** paste a text track list (`Artist – Title` lines, or an
  exported CSV) and link each line to a recording the user picks from
  catalogue or provider search results. Unmatched lines stay as text.
- Studio: optional tracklist and chapters for mixes, in the composer text.

**Sprint 9 — Connectors (on the roadmap, not scheduled).** Cross-platform playlists:

- Reading a Spotify, Apple or YouTube playlist needs that provider's
  authorization. Options:
  - (a) The user signs in to the provider in the browser (PKCE OAuth where the
    provider allows public clients; Spotify does). No secret is stored, but
    each provider needs its own app registration.
  - (b) A Mawkingbird Plus server-side integration holding keys. JSON only,
    never media, but a cost and privacy decision.
  - (c) Rely on user exports (Exportify, TuneMyMusic CSV) through "Post a song
    list".

  Recommend (c) first, then (a) for Spotify if trials show demand.

- Cross-service track matching (offering the Apple link for a Spotify track)
  needs song.link's key or an equivalent. Same owner decision as (b).
  Without it, alternatives come only from what the poster linked, plus the
  catalogue searches above.

### What to learn from the trial before Sprint 6

- Time to the first 10 playable tracks, and which source produced them.
- How often people open Listen versus Radio, and whether single clips lead
  to a second track.
- Whether testers published playlist threads, and where publishing stalled
  (plan cost, rate limits, private tracks).
- Which services testers subscribe to and hide, which tests whether the
  audio-services defaults are right.
- Error reports: provider frames that failed, LoC lookups that found nothing,
  CORS failures on direct files.

Gates still owed before release: `make design-verify` (held for the end of this
work by owner request; no shared design-system widgets changed since the last
run) and `make test-integration`.

### Sprints 6 and 8 progress (2026-10-27) — ready for a user trial

Owner decisions:

- Radio's Search tab is now **Build Playlist**.
- Radio's own saved searches and "Save this search" are removed. Build
  Playlist's Audio source lists the main Search screen's saved searches
  instead: post searches (signed in, through the server's search, offset
  paging) and hashtag searches (as the hashtag source). Account searches are
  not offered. The old `mockingbird_radio_searches` data is dropped. Music
  search (must contain a song) versus regular search (a wide net) is still open.
- Catalogue search is one component in two places: Studio → **Find Shareable**
  (leads with Share) and Build Playlist's Audio source → Public catalogues
  (leads with collecting).
- Sprint 8 today: Share a track, Catalogue playlist, and Append to my playlist.
  Post a song list is deferred.

Implemented:

- **Catalogues** (`catalogue-search.ts`, `catalogue-panel.ts`):
  - Library of Congress `/audio/?fa=online-format:audio`, keeping only
    `www.loc.gov/item/…` results. Nested ids such as `podcasts/2021-01-29/x` are
    now recognised everywhere.
  - Internet Archive `advancedsearch` with `mediatype:audio`, then
    `/metadata/<id>/files`, keeping one MP3 per recording (low-bitrate
    derivatives are dropped).
  - Requests use `fetch` with credentials omitted and no referrer. There is no
    proxy.

  Results show title, creator, date, rights and the item page, with Play,
  Share, Add to playlist and Add to a published playlist. You can also select
  several, then **Add N selected** or **Make a playlist from N selected**
  (replaces the queue after a confirmation and opens Publish).

- **Catalogue tracks** are ordinary Radio tracks on synthetic `catalogue:`
  posts: they play, queue, save and publish. Published and shared links point
  at the item page (`loc.gov/item/…`, `archive.org/details/<id>/<file>`), and
  those pages are themselves queueable when re-imported.
- **Share a track** (`track-actions.ts`) on Listen, Build Playlist rows and
  catalogue results. It opens Studio's composer, which now accepts a handoff
  (Compose `acceptHandoff`), prefilled with the title, credit ("via the Library
  of Congress", or "shared by @acct"), link and `#nowplaying`.
- **Append to my playlist** on Listen and catalogue results lists published
  playlists. It confirms the cost ("create 1 posts and edit 1"), then posts the
  reply and edits the root's count through the existing publisher. Private
  recordings are refused.
- **The Radio tab with nothing queued** shows "Build a playlist first" with a
  **Build a playlist** button.

Not done: Wikimedia Commons in the catalogue panel, Post a song list, and
Append on feed cards (feeds reach it through Open in Listen).
