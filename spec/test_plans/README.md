# Manual test plans

Steps a person runs against real services before calling work done. Unit and
browser tests mock the network; these plans are the part only a live account
can check. Each plan names the build it was written for, what you need, and
what to record.

Record results in the plan itself: tick the box, add the date, and note
anything that went wrong under **Findings**.

| Plan | Covers | Status |
| --- | --- | --- |
| [Landing pages and the Mastodon connector](landing-and-connector-2026-11.md) | Connector sign-in, front door, return paths | Not run |
| [Bluesky connector OAuth](bsky-connector-oauth.md) | OAuth-first Bluesky connection | Not run |
| [Action row parity](action-row-parity.md) | Bluesky vs Mastodon counts and icons | Not run |
| [Sprint 1: Bluesky video](bsky-parity-sprint-1-video.md) | Video posts | Not run |
| [Sprint 2: engagement and metadata](bsky-parity-sprint-2-metadata.md) | Likers, reposters, languages, link cards, labels | Not run |
| [Sprint 3: author controls](bsky-parity-sprint-3-controls.md) | Reply and quote limits, hide replies, pins, quotes | Not run |
| [Sprint 4: moderation](bsky-parity-sprint-4-moderation.md) | Muted words, mute thread, moderation lists, moderation services | Not run |
| [Sprint 5: discovery](bsky-parity-sprint-5-discovery.md) | Starter packs, suggestions, show more / less like this | Not run |
| [Inbox views](inbox-views-2026-11.md) | Conversations, Stats, Who, Stream; faces; Inbox dot rule | Not run |
| [Explore mode](explore-2026-11.md) | Explore switcher and tabs, feed checkup, Tags suggestions, People, drafts rail card, links in | Not run |
| [Write and Drafts](write-drafts-2026-11.md) | Autosave, versions, shortcuts, quote dialog, scheduling and parking | Not run |
| [Translation fallback](translation-fallback-2026-11.md) | Pair pre-check, browser translator, MyMemory, Apertium, source-language picker | Not run |
| [Phanpy parity 1](phanpy-parity-1-mastodon-2026-11.md) | Private account notes, report rules and forwarding, list rename and replies, profile QR, embed post | Not run |
| [Phanpy parity 2](phanpy-parity-2-mastodon-2026-11.md) | Feature accounts on your profile, familiar followers, alt text from image metadata | Not run |
| [Phanpy parity 3](phanpy-parity-3-mastodon-2026-11.md) | Profile image descriptions and removal, collection language/sensitivity and reporting, server annual reports | Not run |
| [Phanpy parity 4](phanpy-parity-4-2026-11.md) | Translate bio, camera capture, read aloud, AI alt text via OpenRouter | Not run |
| [Install and share](install-and-share-2026-11.md) | Install as an app (Settings, footer), share links/text into the composer | Not run |
| [Chat mentions and live](chat-mentions-and-live-2026-11.md) | 1:1 chat mentions added automatically, Reconnecting… diagnostics | Not run |
| [YouTube client S1](youtube-client-s1-native-search-2026-11.md) | YouTube search on Native without Plus; web Plus unchanged | Not run |
| [YouTube client S2](youtube-client-s2-watch-2026-11.md) | Watch: comment modes, YouTube comments, Subscribe, Share, Find posts, About this video | Not run |
| [YouTube client S3](youtube-client-s3-channels-2026-11.md) | Channel pages, creators on Mastodon (Wikidata, channel links), Follow on Watch, visible chapters | Not run |
| [YouTube client S4](youtube-client-s4-landing-2026-11.md) | Subscriptions landing, Shorts, Recently seen, SponsorBlock, seeking chapters, PeerTube | Not run |
| [YouTube client S5–S6](youtube-client-s5-creator-kits-2026-11.md) | YouTubers on Mastodon: kits page, rail card, Subscribe/Follow all, review spot-check | Not run |
| [Low bandwidth S1: connection meter](low-bandwidth-s1-connection-meter-2026-11.md) | Header chip on slow/unstable/offline, /connection history and report | Not run |
| [Low bandwidth S2–S3](low-bandwidth-s2-s3-offline-and-data-saver-2026-11.md) | Offline banner vs whale, read retries, pictures wait for a tap on slow connections, menu speed stats | Not run |
| [Low bandwidth S4–S5](low-bandwidth-s4-s5-offline-app-and-outbox-2026-11.md) | Opens offline (service worker), saved reads offline, Outbox for posts written offline | Not run |
| [Low bandwidth S6–S7](low-bandwidth-s6-s7-lite-and-native-2026-11.md) | Lite (/m/) screens, staying in Lite, the switch-to-Lite offer, Native offline banner/whale and archived profiles | Not run |
| [Lite: the next hour](lite-next-hour-2026-11.md) | Load-control bar, saved-first threads/profiles, keep-my-place refresh, Outbox in Lite, send-on-reconnect choice | Not run |

The roadmap these come from is `sprint/november_2026_bsky_parity.md`.

## Accounts you need

- **Bluesky A**: a bsky.social account with a **verified email** (video needs it).
- **Bluesky B**: a second Bluesky account, to reply, quote and like as someone else.
- **Mastodon M**: a Mastodon account on a 4.5+ server (quotes need 4.5).
- A browser profile with no Mawkingbird data, for the first-visit checks.

Use a staging build (`/test/` or canary) or a local production build. On
`localhost`, Bluesky OAuth moves you to `127.0.0.1`, which has separate
storage; test connector OAuth on a deployed build instead.
