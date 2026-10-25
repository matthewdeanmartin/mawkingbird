# Audio player improvements

Status: proposed roadmap · 2026-10-25.

Companion: [Audio Studio improvements](audio_studio_improvements.md).
This document plans future work; it does not claim these improvements are implemented.
Priorities are sequencing suggestions, not delivery commitments.

## Purpose and existing baseline

Make Radio useful for sustained podcast, music, and spoken-audio listening.
Listening adjustments should leave the publisher's recording unchanged. Preparing
and exporting a changed recording belongs in Studio.

The current prototype scans an account, home feed, or list. Discovery includes
native audio and supported external embeds by default, with a native-only checkbox.
Native audio, SoundCloud, and Mixcloud support the persistent Radio queue.
Other supported providers play inline after explicit activation. Search includes
media, provider, and delivery facets. Ordinary YouTube links remain video.
`music.youtube.com` links are audio and appear in Radio discovery, with an
explicitly loaded YouTube Music player. They are not yet controllable queue items.

Current external recognition covers Spotify, SoundCloud, Mixcloud, Apple Music,
Apple Podcasts, TIDAL, YouTube Music, Amazon Music, Deezer, Internet Archive,
and qualified Bandcamp/Audio.com URLs. Recognizing a provider,
resolving a playable iframe, controlling it, and obtaining its audio bytes are
separate capabilities. Bandcamp/Audio.com ordinary links may remain unresolved;
Apple Podcasts can contain video and is not automatically classified as audio.

## Phase 1 — everyday listening

| Feature             | Scope                                                                                                                    | Acceptance                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Playback speed      | Native playback at 0.75×, 1×, 1.25×, 1.5×, 1.75×, and 2× with pitch preservation; provider controls only where supported | Remember the preference; preserve it across navigation and native queue transitions; explain unsupported providers |
| Resume history      | Store recording identity and last position, with explicit continue/restart actions                                       | Do not autoplay on restore; distinguish completed recordings; allow clearing history                               |
| Smart rewind        | Optional short rewind after a long pause                                                                                 | Clamp at zero; preserve the user's seek and loop choices                                                           |
| Bookmarks and notes | Named timestamps and private notes linked to the original post                                                           | Keyboard accessible; retain original recording timestamps at every speed                                           |
| Sleep timer         | Stop after a duration or at the end of a finite recording; optional fade                                                 | Show remaining time and cancellation; prevent queue advancement after expiry                                       |
| Download original   | Save an available original recording without conversion                                                                  | Show size when known; offer provider download/original-link fallback when bytes are unavailable                    |
| Keep offline        | Explicitly cache accessible recordings with post attribution                                                             | Show progress, cancel, storage use, expiry/removal, and an adjustable budget; verify playback offline              |

Use native `playbackRate` and `preservesPitch` for speed; no WASM or whole-file
conversion is needed. Offline storage is distinct from a user-owned download.
Request persistence where appropriate, but do not promise browser data can never
be evicted. Scope private media and listening history to the account; define
account-switch, sign-out, deleted-post, and expired-URL behavior before shipping.
Do not fetch or extract recordings from opaque subscription-player iframes.

## Phase 2 — lightweight listening assistance

1. **Level spoken audio:** optional adaptive gain with bounded adjustment, gentle
   attack/release, and peak management. Avoid raising background noise during
   silence. This is adaptive levelling, not a claim of exact whole-track loudness
   normalization. Music remains unprocessed by default.
2. **EQ, compression, and channel controls:** simple presets, mono, balance, and
   left/right-only listening. Offer bypass and reset; avoid a wall of controls.
3. **Waveform navigation and A–B loops:** progressive waveform where possible,
   accessible timestamp alternatives, and explicit loop start/end/clear actions.
4. **Silence skipping:** analyse ahead of playback, preserve a little pause for
   intelligibility, and avoid skipping audio that has not been classified yet.
   Transcript positions and bookmarks continue to refer to original timestamps.
5. **Voice clarity/noise reduction:** combine the lightweight controls first;
   evaluate a lazily loaded denoiser separately against speech, music, latency,
   CPU, and battery use. Always retain ordinary-playback fallback.

Audio processing requires access to samples. A remote recording that plays in an
audio element is not necessarily CORS-readable for Web Audio. Check capability
before rerouting playback: an inaccessible media-element source can output silence.
Do not let a failed enhancement break the unprocessed player.

## Phase 3 — captions and navigation through speech

- Display supplied captions first; support local VTT/SRT import and accessible
  transcript presentation, click-to-seek, and search within the recording.
- Offer **Generate captions on this device** as an explicit action. Investigate
  Transformers.js/Whisper with WebGPU and a WASM fallback, or whisper.cpp/WASM.
  Select one implementation after a device/browser spike, rather than shipping
  both engines by default.
- Show model download size, processing progress, cancellation, language choice,
  and removable local model storage. Run inference off the UI thread; process
  bounded chunks and cache timestamped results against recording identity.
- Treat generated text as machine-generated and editable. Do not promise real-time
  performance on phones or silently switch to remote inference.
- Derive chapter suggestions from transcript/topic boundaries later. Translation
  is a separate opt-in model/capability with its own download and accuracy costs.
- Reuse Studio's transcript representation and import/export support. A listener's
  transcript or notes remain private unless explicitly exported or published.

## Phase 4 — optional listening experiments

Independent pitch adjustment, a live visualizer, a spectrogram, crossfade/gap
controls, and an optional spoken announcer for author/title/content warning.
Load analysis/visualization code on demand and honor reduced motion. Crossfades
apply only where both sources are controllable and compatible; do not overlap
opaque embeds or bypass a content warning. Announcements must respect the same
reveal and playback-consent rules as the recording itself.

## Processing and storage budget

| Work                                         | Whole-recording analysis?                                 | Rewrite audio?                       |
| -------------------------------------------- | --------------------------------------------------------- | ------------------------------------ |
| Speed, EQ, compression, mono, adaptive level | No; during playback                                       | No                                   |
| Denoising, silence skipping, live spectrum   | Bounded windows; skipping needs look-ahead                | No                                   |
| Complete waveform/silence map                | Eventually every section; can build progressively         | No                                   |
| Exact integrated loudness                    | Entire recording once, unless trustworthy metadata exists | No; cache measurement and apply gain |
| Captions and derived chapters                | Every section being captioned; can be incremental         | No                                   |
| Bookmarks, notes, resume, sleep timer        | No sample analysis                                        | No                                   |
| Offline copy/download                        | Transfer original bytes                                   | No                                   |

Decoding can consume substantially more memory than the compressed file. Avoid
whole-podcast PCM buffers. `decodeAudioData()` requires complete file data;
incremental decoding needs a separately validated codec/container pipeline.
Neither FFmpeg nor an ML model belongs in startup imports or route guards.

## Shareable Radio entry points

Account links use `radio?acct=user%40server`; individual recordings use
`radio?post=<encoded-original-post-url>`. Generate URLs relative to the deployment
base, including `/canary/`. Public/unlisted audio posts offer **Open in Radio**;
Radio offers **Copy Radio link**. Recipients can read public sources anonymously,
with no autoplay. Home feeds, lists and private posts are not shared.

## Provider coverage backlog

Implemented in this pass: Amazon Music `.com` album/track ASIN links, Deezer
canonical music/podcast links, and Internet Archive item embeds. These are
click-to-load inline players; automatic queue advance is not claimed. Archive
item URLs have unknown media type unless a linked filename identifies audio or
video. Generic books/movies must never acquire an audio facet merely by host.

Library of Congress exposes public audio resources through its item/resource
APIs. A generic `loc.gov` iframe URL has not been verified. Its associated
American Archive of Public Broadcasting project documents embeds, but needs a
separate provider resolver. See [LOC APIs](https://www.loc.gov/apis/json-and-yaml/requests/endpoints/)
and [AAPB library resources](https://www.loc.gov/static/portals/librarians/american-library-association/annual/pdf/american-archive-of-public-broadcasting-resources-for-libraries.pdf).

These are qualitative reach/practicality estimates, not a market-share study.
Verify current URL forms, iframe origins, playback restrictions, browser-only
resolution, and control protocols before promoting a provider to supported.

| Priority         | Gap                                                                                | Proposed treatment                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High             | Podcast-host links                                                                 | Begin with Podbean, then evaluate Buzzsprout, Acast, Libsyn, and Spreaker; a host's embed support does not guarantee arbitrary episode URLs can be resolved without a backend |
| High             | Direct audio links and podcast RSS enclosures                                      | Potentially broad coverage across independent publishers; validate content type, redirects, HTTPS, CORS, and existing RSS infrastructure                                      |
| Medium           | Audiomack                                                                          | Documented embeds; potentially valuable for independent music and particular regions/genres                                                                                   |
| Medium           | TuneIn                                                                             | Documented station/show embeds; live streams need distinct duration, seek, and queue-end behavior                                                                             |
| Investigate      | iHeartRadio, Pandora, regional services such as QQ Music/NetEase/JioSaavn          | Audience relevance varies; do not assume a supported general-purpose embed or accessible audio bytes                                                                          |
| Improve existing | Bandcamp/Audio.com resolution; supported short links; Spotify control capabilities | May increase useful coverage more than adding small providers; preserve exact-host validation and parent-page CSP                                                             |

For every addition: explicit provider-specific Load action; no provider request
before activation; deduplicate alternatives within a post; preserve native-only
filtering, media facets, content warnings, and ordinary link fallback. An inline
player should not be labelled queueable until lifecycle and end events are tested.

## Design and release checks

Reuse the design system's Button, Checkbox, Field/Control, and Content State.
Keep the dock compact, expose advanced controls progressively, and provide
keyboard/text alternatives for waveform gestures. Test real recordings and
provider frames on desktop and mobile, background/navigation transitions,
long/sparse feeds, failed fetches, CORS rejection, and low-memory conditions.

Implementation gates: targeted specs, `cd ui && make test`,
`npm run build:mockingbird`, static/lint/design checks, and browser assertions.
Review/regenerate control inventory when source locations change. Run
`make design-verify` if shared design widgets change. Keep the 1 MB startup
budget and stable public origins/storage keys; test new integration behavior
against the PyPI-installed mock, not the sibling source checkout.

## References

- [Browser playback speed](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate)
- [Web Audio cross-origin restrictions](https://www.w3.org/TR/webaudio-1.0/#MediaElementAudioSourceNode-security)
- [Complete-file decoding](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)
- [Browser storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [Transformers.js WebGPU transcription](https://huggingface.co/docs/transformers.js/guides/webgpu)
- [whisper.cpp browser streaming example](https://github.com/ggml-org/whisper.cpp/tree/master/examples/stream.wasm)
- [Deezer widget](https://newsroom-deezer.com/2021/04/deezers-new-embeddable-widget-player-adds-instant-audio-to-any-website/)
- [Podbean embeds](https://help.podbean.com/support/solutions/articles/25000004800-embed-your-podcast-player-elsewhere)
- [Audiomack embeds](https://creators.audiomack.com/about)
- [Internet Archive audio players](https://archivesupport.zendesk.com/hc/en-us/articles/360016551052--Audio-and-Music-Items-Tips-Troubleshooting)
- [TuneIn embeds](https://cms.tunein.com/listen/embedded/)
