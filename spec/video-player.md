# Video playback and a dedicated Watch page

Status: implemented · 2026-10-07.

Related proposals: [Focus modes](media-focus.md), [Watch Parties](watch-party.md).

Owner decision: YouTube links and uploaded videos ship together in the first
release. Internal implementation may stage uploads first; it is not a separate
uploaded-only product release.

Owner playback rules: no loop, ever; no autoplay; no autoplay-next. Opening or
expanding any video keeps it paused, even if it was playing before expansion.
The mini composer gets basic uploaded-video preview before posting; complex
content creation belongs on `/write` and is outside this playback milestone.

## Pitch

Make video a destination, rather than a thumbnail that sends you elsewhere.
Click Play in a post, then open Watch for a large player, the author's identity,
the original post, and its conversation. Keep social context and moderation
within reach. On phones, put the player above the conversation; on desktop,
give the player a wide column and the conversation a narrower one.

Build the experience around browser video controls and YouTube's official
embedded player. Custom controls, cross-page mini-players, queues, and playback
synchronization can follow. The first release should feel complete without
depending on those features.

## Baseline before this milestone

- `ui/src/app/status-card/status-card.html` sends every attachment through an
  image thumbnail and the image lightbox, regardless of attachment type.
- `lightbox/lightbox.html` is an image viewer. Its document-level left/right
  shortcuts need careful handling if playback is added.
- `preview-card/preview-card.*` renders a link, including cards of type `video`.
- Home already has a Media view. Home, profiles, and tags reuse the media grid
  and `profile-photo-view`, which already plays video with native controls.
  Consolidate this existing support rather than creating a separate player for
  each surface. Preserve existing `?photo=` links.
- `models.ts` has attachment type, URL, preview, and description, but does not
  model optional duration, dimensions, or remote URL metadata.
- The composer already accepts Mastodon video/audio files, but its attachment
  previews are images. This is a playback project, not a new upload pipeline.
- Feed reader and images-off settings already suppress visual presentation.
  New players must respect those preferences, content warnings, and sensitive
  media gates.

## Reference comparison

These are source observations from local checkouts, not a live usability audit
or claims about every released version. Inspected revisions: Elk `ae4ebf33`,
Phanpy `e79149d0`, Mastodon `60593f6a8d`, Nicolium `5be34453d`.

| Client | Observed approach | What Mawkingbird should take | Tradeoff to avoid copying automatically |
| --- | --- | --- | --- |
| Elk | Native inline video, `preload="none"`, playback driven by a 75% intersection threshold and autoplay preference; reduced-motion/data-saving handling. External embedded media starts behind an explicit play overlay and warning, then uses sanitized iframe content. | Lightweight playback, explicit external-player activation, media-loading preferences. | Uploaded video loops in this implementation; long videos should end normally. Keep controls outside thumbnail buttons. |
| Phanpy | Media-first layouts and carousels; native controls in expanded media; duration badges and special short-animation behavior. A `lite-youtube` branch uses `nocookie` and `autoPause`; iframe cards can open an embed modal. | Attractive media presentation, descriptions, duration, and a lightweight external-player placeholder. | Its YouTube branch is conditional on card shape and parses `watch?v=` narrowly. Its expanded video path uses eager preload. Our URL parser and feed loading need broader coverage. |
| Mastodon | Custom uploaded-video controls, buffered seeking, volume, fullscreen, playback handoff to an app mini-player, and scoped keyboard actions including K/Space, M, F, J/L, and frame stepping. Link-card video activates an iframe on interaction. | State handoff and keyboard discipline; a useful benchmark for a later custom-control phase. | Rebuilding all control behavior up front increases maintenance and accessibility work. Its J/L seek interval is five seconds; a YouTube-style interval would be our own product decision. |
| Nicolium | Custom video backed by `useMediaPlayer` and shared controls, with a system-controls option. Packs time/volume/mute for expanded playback or app PiP; visibility changes pause playback. An extended player restores a starting time. | Shared player logic, native-controls fallback, position preservation when expanding. | Some handoffs automatically deploy an app mini-player. Make continuing playback an explicit user choice here. |

Evidence entry points, relative to this spec:

- Elk: [StatusAttachment.vue](../../REFERENCE/elk/app/components/status/StatusAttachment.vue),
  [StatusEmbeddedMedia.vue](../../REFERENCE/elk/app/components/status/StatusEmbeddedMedia.vue).
- Phanpy: [media.jsx](../../REFERENCE/phanpy/src/components/media.jsx),
  [media-modal.jsx](../../REFERENCE/phanpy/src/components/media-modal.jsx),
  [media-first-container.jsx](../../REFERENCE/phanpy/src/components/media-first-container.jsx),
  [status-card.jsx](../../REFERENCE/phanpy/src/components/status-card.jsx).
- Mastodon: [video/index.tsx](../../REFERENCE/mastodon/app/javascript/mastodon/features/video/index.tsx),
  [status/components/card.tsx](../../REFERENCE/mastodon/app/javascript/mastodon/features/status/components/card.tsx).
- Nicolium: [video.tsx](../../REFERENCE/nicolium/packages/nicolium/src/components/media/video.tsx),
  [extended-video-player.tsx](../../REFERENCE/nicolium/packages/nicolium/src/components/media/extended-video-player.tsx).

## Proposed release boundary

1. Type-aware attachment rendering and shared native player for uploaded video.
2. YouTube URL recognition and click-to-load official embeds.
3. A dedicated, lazy-loaded Watch page for both source types.
4. Consolidation of profile/tag/Home media-view playback and composer previews.

Uploaded playback can land first internally as the foundation; YouTube and
Watch complete the same first product milestone. Other providers keep working as external
links. Adaptive streaming libraries and custom controls are later decisions.

## Player behavior

| Source | Feed behavior | Expanded/Watch behavior |
| --- | --- | --- |
| Image | Existing thumbnail/lightbox | Existing image viewer |
| Uploaded `video` | Poster, Play, duration if supplied, Open Watch | Native controls, contain aspect ratio, no automatic loop |
| `gifv` | Animation badge; explicit play, no loop | Shared media viewer, accessible pause/play; excluded from video-only filtering by default |
| Audio | Native audio controls or descriptive attachment row | Never render as a broken image; a dedicated listening experience is outside scope |
| Unknown/unsupported | Description and safe open-original action | Useful fallback, without guessing playback support from a preview image |
| Recognized YouTube link | Title/source and Play on YouTube control; no iframe until activation | Official player, original post and conversation, provider fallback |

No autoplay, including when opening Watch. Expansion preserves playback
position and controls, but always leaves playback paused. Uploaded
videos initially use `preload="none"`; after activation metadata/buffering may
load. Do not mount an active player behind a collapsed warning or reveal gate.

Only one Mawkingbird-managed player plays at a time. Starting another pauses
the previous one. A feed player pauses when its card leaves view and does not
automatically restart on return. Deliberately selected Watch playback may
continue while its conversation scrolls. Remove listeners and stop playback
when the surface is destroyed or the active account changes. Native browser
PiP is offered where supported; app mini-player persistence is deferred.

Uploaded Watch playback must offer play/pause, seeking, elapsed/total time,
mute/volume, fullscreen, and a playback-speed choice. Use native controls for
the core actions and add a small labelled speed selector where needed. Add
K/Space for play/pause, J/L for ten-second seeking, M for mute, and F for
fullscreen when the uploaded player wrapper has focus. Keep native seek-bar
keyboard behavior intact. Inside YouTube, use the provider's own controls and
shortcuts. Do not install page-wide playback shortcuts that hijack composition.

Use optional metadata for duration and dimensions, not a fetch per card.
Handle missing poster, missing metadata, expired URL, unsupported codec,
buffering, denied autoplay, and playback errors. A descriptive fallback with
Retry and Open original should remain usable. Keep media descriptions visible;
descriptions are not timed subtitles. Expose provider captions when available,
without claiming uploaded clips have caption tracks the API did not supply.

Preserve time, volume, mute, and speed during uploaded-player handoff. Pause
the old element; never start its replacement automatically. Restore time
after metadata, clamping to valid duration. Do not persist a watch-history
database in v1. YouTube uses an isolated official iframe without loading a
provider SDK into Mawkingbird's document. Its current position cannot transfer
between views; show that limitation explicitly. Each view opens paused at the
original link's start time. Activating another player or scrolling an inline
YouTube player out of view closes its iframe; reloading requires a user action.

## YouTube recognition and external requests

Use parsed URLs with exact allowed hostnames, not provider-name regexes or a
substring match. Support `youtube.com/watch`, `youtu.be`, `/shorts/`, `/live/`,
and `/embed/` variants, including documented www/mobile hosts. Validate video
IDs and bounded start times from `t`/`start`. Reject lookalike hosts, invalid
schemes, credential-bearing URLs, and malformed values. Playlists, channels,
and unidentified live URLs remain ordinary links in v1.

Recognize card URLs and links already present in post HTML; a missing server
card must not prevent playback. Parse inertly and choose one primary video
per post initially. Do not fetch YouTube metadata from every feed card.

Construct the iframe URL ourselves from the validated ID, using
`youtube-nocookie.com`. Never inject server-provided `card.html` as trusted
markup. Use a labelled iframe and the permissions required for the supported
player features. Before activation, avoid provider SDKs, preconnects, and new
direct YouTube thumbnail requests; use an existing server preview or a neutral
placeholder. Existing preview images can themselves be remote requests, so do
not claim the entire card makes no third-party contact.

Clicking Play explicitly permits that embed to load. A remembered provider
preference can follow later. Privacy-enhanced mode changes personalization,
but does not make playback anonymous or prevent external requests.
[YouTube embedding documentation](https://support.google.com/youtube/answer/171780).

Use a provider-compatible referrer policy such as
`strict-origin-when-cross-origin`; do not carry the generic external link's
`noreferrer` behavior over to the iframe. Missing client identification can
produce YouTube error 153. Validate player viewport requirements and errors
for deleted/private videos and disabled embedding; keep Open on YouTube
available. Keep the site's self-only script policy. Allow only the
privacy-enhanced YouTube origin in `frame-src`; do not load the IFrame API into
the parent document or scrape media URLs. Cross-origin provider errors remain
inside the official player, alongside our always-available external link.
[YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference).

## Watch page

Proposed route: `/watch`, with validated source context. Uploaded attachment
links identify the originating status and attachment, not just an arbitrary
video URL. Provider/server context must accompany server-local IDs. Resolve
visibility through the existing authorized provider; a copied link confers no
access to a private post. YouTube-only sources can identify a validated video
ID, with post context optional. Do not put access tokens in URLs.

Desktop: large player, title or attachment description, author, post actions,
and conversation alongside or below. Mobile: player followed by the same
context, with full-width controls. No unrelated recommendation engine in v1.
Use existing conversation loading, reporting, blocking, and reply behavior.
Browser Back returns to the originating feed and scroll position. Existing
photo-view deep links continue to resolve.

Future action: Start Watch Party. Until that feature ships, omit the action;
do not expose a button that creates a fake room. Opening Watch never publishes.

## Implementation and acceptance

Use a small typed media descriptor and source adapters shared by status cards,
media grids/viewers, and Watch. Extend attachment metadata with optional fields;
preserve existing provider fixtures. Defer player/provider SDK code and Watch
route components; keep optional feature dependencies out of root imports and
route guards. Use existing design-system controls, localization, and focus
restoration. Player shortcuts must not consume composer typing, form-control
actions, or seek keys as gallery navigation.

Meaningful checks for implementation:

- Video/audio/unknown fixtures render by type, including missing metadata and
  mixed attachments. Image lightbox navigation still works.
- Warning/reveal, text-reader, and images-off settings cannot accidentally
  activate players. Explicit playback remains possible through a media row.
- Player controls do not navigate the parent post. Seek shortcuts do not change
  attachments. Account changes and unmounts stop the old player.
- Uploaded expansion preserves state; simultaneous players and failed play
  promises behave predictably. YouTube URL tests include malicious hosts,
  unsupported forms, timestamps, and absent cards.
- Before activation there is no iframe/API load. Provider failure leaves a
  usable link. Watch enforces post visibility and restores feed navigation.
- Manually verify real playback on desktop Chromium/Firefox and Safari/iOS,
  keyboard and screen-reader use, portrait media, and 320px layouts. DOM tests
  alone do not establish codec, PiP, or cross-origin iframe behavior.
- Follow contributor gates: Node 22 or supported newer, committed lockfile and
  `npm ci`, targeted specs, then `cd ui && make test` and
  `cd ui && npm run build:mockingbird`. Inspect the initial-size report; preserve
  the 1 MB initial error budget and test inventory. Any integration additions
  use the PyPI-installed mastodon-mock wheel, never the sibling checkout.

Implementation includes shared lazy player controls, typed attachment handling,
YouTube recognition, the lazy `/watch` route, and basic composer previews.
Watch Parties and focus preferences remain separate proposals.

Validation: targeted player, source, visibility, handoff, lightbox, status-card,
and composer tests; full contributor test gate and production build. Browser
verification covers uploaded playback in Chromium and Firefox, paused Watch
handoff, stopped-at-end behavior, and a 320px layout. Safari/iOS and assistive
technology verification remain manual follow-up checks.
