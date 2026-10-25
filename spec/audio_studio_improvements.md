# Audio Studio improvements

Status: proposed roadmap · 2026-10-25.

Companion: [Audio player improvements](audio_player_improvements.md).
This is a roadmap, not an implementation claim. Sequence work around preparing
one good audio publication before considering a full multitrack editor.

## Purpose and existing baseline

Help an author inspect, improve, caption, and publish a recording entirely in the
browser. Studio owns changes intended for the published recording; Player owns
personal listening preferences. Both should share decoding, analysis, transcript,
and preview components where appropriate.

The existing Studio provides an own-account audio catalogue with durable pointers
and scan checkpoints, local audio staging/preview, publication fields, and explicit
upload/publication. Discovery includes recognized external audio links. Finding a
link in the catalogue does not imply we can download or edit that provider's audio.

Owner constraint: staged recordings commonly measure 40–90 MB and do not need to
survive browser restarts. Preserve that default: originals, decoded audio, and
working renders are temporary. Durable catalogue references are separate from
staged file bytes. Do not turn Player's optional offline cache into automatic
persistence of unpublished drafts.

## Ownership of the brainstormed features

| Capability                                                   | Player responsibility                         | Studio responsibility                                                                  |
| ------------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| Playback speed, resume, smart rewind, sleep timer            | Listening preferences                         | Speed may assist review; it must not silently change the export                        |
| Loudness, EQ, compression, channel controls, noise reduction | Optional reversible listening assistance      | Preview, compare, and explicitly render publication changes                            |
| Waveforms and spectrograms                                   | Navigation/optional exploration               | Inspection, selection, clipping/silence checks, edit boundaries                        |
| Bookmarks, notes, A–B loops                                  | Private listening annotations                 | Review markers and repeatable before/after comparisons                                 |
| Captions, transcript search, translation, chapters           | Read, navigate, optionally generate privately | Generate/import, correct, align, export, and deliberately publish                      |
| Independent pitch control                                    | Optional listening experiment                 | Later creative correction with an explicit export effect                               |
| Silence skipping                                             | Skip pauses during listening                  | Suggest trims; author approves any removal from the published recording                |
| Crossfade, gaps, announcer, visualizer                       | Queue/listening presentation                  | Later fade/join or intro/outro tools; no automatic queue settings baked into exports   |
| Cache/download                                               | Save available published originals            | Download the prepared result and caption files; retain the original during the session |

## Phase 1 — inspect and prepare

1. **File inspection:** duration, format/container, sample rate, channels, source
   file size, and destination instance's currently advertised upload limits.
   Distinguish an unsupported preview codec from an invalid source file.
2. **Waveform and review markers:** select ranges with both pointer and keyboard;
   enter exact times, loop a selection, and attach temporary review notes.
3. **Basic edits:** trim start/end, fade in/out, undo/redo, and reset to original.
   Store an edit description instead of repeatedly overwriting audio. More complex
   cut/join operations follow only after timestamp mapping is reliable.
4. **Original/prepared comparison:** clear A/B preview, explicit bypass, and an
   unambiguous indication of which version would be uploaded. Review-speed changes
   do not affect the prepared recording.
5. **Export plan:** show output format, sample rate/channels, and estimated size
   before processing. Dynamically load an encoder only when required. Preserve
   original bytes when no transformation is requested and the server accepts them.

Acceptance: the original remains recoverable throughout the session; cancelling
processing leaves it intact; no upload starts during inspection or preview;
40–90 MB examples stay responsive without unbounded decoded-memory growth.

## Phase 2 — publication loudness and cleanup

- **Measured loudness matching:** scan the selected publication once for integrated
  loudness and peaks. Offer an explained, adjustable target and headroom rather
  than treating a broadcast target as universal for podcasts or music. Cache the
  measurement against file identity and edit settings; invalidate it when cuts or
  effects make it stale.
- **Peak management and dynamics:** show clipping/peak warnings with useful
  locations. Offer compression/limiting as optional choices. Do not claim true-peak
  compliance unless the implementation actually measures and controls true peaks.
- **Voice cleanup:** EQ, mono/channel selection, and a lazily loaded denoiser.
  Preview a representative passage and compare with the original before rendering.
  Preserve deliberate dynamics, ambience, and stereo unless the author changes them.
- **Silence suggestions:** locate leading/trailing silence and long pauses; let
  the author accept individual trims. Never assume every pause is an error.
- **Prepared download:** render the chosen result once, preview it, and allow
  downloading it independently of publication. Avoid repeated lossy encoding.

Acceptance: an author can hear the effect before committing, reset every setting,
cancel work, and recover after a codec/worker error. Preview and export use the
same effective settings. Test speech, music, quiet sources, clipped sources,
stereo interviews, and unusually long recordings.

## Phase 3 — captions, transcripts, and chapters

- Import supplied VTT/SRT; explicitly generate captions locally when needed.
  Reuse the Player's selected transcription engine and optional model cache.
- Run inference in a worker with bounded chunks, progress, cancellation, and
  language choice. Model download and device cost must be visible; no silent
  server-side fallback.
- Provide editable text, synchronized preview, timing adjustments, and search.
  Review names, numbers, and uncertain passages before publication; machine output
  is not guaranteed accurate. Speaker labels are a later, separately evaluated
  feature, not implied by basic transcription.
- Offer chapter suggestions and author-written chapter titles. Translation is
  optional and separately editable; retain the original-language transcript.
- Export VTT/SRT and plain text. Do not assume Mastodon accepts a standardized
  caption/chapters attachment for audio. Verify the target API's capabilities;
  otherwise offer downloads and explicit transcript/link inclusion in the post.
- Map caption and chapter times through edits, or clearly invalidate/regenerate
  them after changes. Review against the final rendered audio before publishing.

Acceptance: captions survive export/import, remain aligned after supported edits,
and are readable with keyboard and screen reader. No generated transcript is
published automatically. Long-file jobs resume within the session where practical.

## Phase 4 — optional authoring extensions

Evaluate independent pitch correction, more advanced denoising/source separation,
spectrogram-assisted inspection, joining recordings, crossfades, and intro/outro
assembly. Prioritize actual author requests and benchmarks. A multitrack DAW,
automatic music generation, and unattended publishing are outside this roadmap's
initial scope.

## Whole-file work and resource strategy

| Operation                                           | Work required                                                                           | Stored result                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------- |
| File metadata, markers, edit decisions              | Metadata reads or no sample processing                                                  | Small session state                    |
| EQ/compression/channel or denoise preview           | Process the previewed segment/window                                                    | Temporary buffers                      |
| Complete waveform, silence map, integrated loudness | Decode/analyse the selected recording; may stream through it                            | Compact peaks, intervals, measurements |
| Captions/chapters                                   | Analyse relevant audio chunks; transcript-derived work afterward                        | Text and timestamps                    |
| Trimmed/processed/reformatted export                | Render/encode the output range; some formats may permit specialized lossless operations | A new temporary prepared file          |
| Original download/upload                            | Transfer original bytes                                                                 | No transformed copy required           |

Whole-file analysis does not mean rewriting the audio or keeping all decoded PCM
in memory. Decode in bounded chunks where the codec/container permits, release
buffers promptly, and use temporary browser storage only when needed for an
explicit job. The simple `decodeAudioData()` API requires complete file data;
do not assume it supplies a streaming decoder.

Load WASM, ML runtimes/models, and codec bundles on demand. Compare a focused
encoder/decoder with FFmpeg/WASM before choosing the larger dependency. Benchmark
time, peak memory, output quality, cancellation, and worker/thread requirements
on supported browsers. Deployment headers, cross-origin isolation, CSP, and
third-party embed compatibility need review before selecting threaded builds.

Sharing an analysis engine does not authorize sharing private recordings between
accounts. Keep new metadata/storage keys registered and account-scoped. Clear
temporary files and object URLs when the author discards a draft or switches
accounts. Any future restart-persistent draft feature requires a separate product
decision and explicit user-facing storage controls.

## Publication and design constraints

Read `MIGRATION.md` before modifying publishing. Keep public origins, OAuth
redirects, and existing storage key names stable. Preserve explicit publication,
upload limits, visibility/content-warning fields, duplicate-submit protection,
and retry behavior. Retrying a failed publication should not unnecessarily rerender
or reupload an already prepared attachment.

Reuse Button, Checkbox, Field/Control, Content State, and the existing Studio
layout. Keep advanced processing in an expandable area. Display source versus
prepared size/duration clearly; expose progress, cancel, error, and retry states.
Preview must cooperate with Radio so two recordings do not play accidentally.

For implementation, run targeted tests and the complete `cd ui && make test`
gate, static/lint/design checks, and `npm run build:mockingbird`. Verify the
startup budget still excludes optional codecs/models. Review design inventory
changes; run `make design-verify` if shared widgets change. Extend browser checks
for staging, cancellation, preview, captions, export, and explicit publication.
Use the PyPI-installed mock for API integration tests, never the sibling checkout.

## References

- [EBU loudness measurement background](https://tech.ebu.ch/loudness/)
- [Integrated loudness measurement limitations](https://tech.ebu.ch/groups/ploud-old)
- [Browser audio decoding](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)
- [Transformers.js browser transcription](https://huggingface.co/docs/transformers.js/guides/webgpu)
- [whisper.cpp WASM example](https://github.com/ggml-org/whisper.cpp/tree/master/examples/stream.wasm)
- [Storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
