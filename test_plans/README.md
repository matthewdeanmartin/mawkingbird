# Manual test plans

Steps a person runs against real services before calling work done. Unit and
browser tests mock the network; these plans are the part only a live account
can check. Each plan names the build it was written for, what you need, and
what to record.

Record results in the plan itself: tick the box, add the date, and note
anything that went wrong under **Findings**.

| Plan | Covers | Status |
| --- | --- | --- |
| [Bluesky connector OAuth](bsky-connector-oauth.md) | OAuth-first Bluesky connection | Not run |
| [Action row parity](action-row-parity.md) | Bluesky vs Mastodon counts and icons | Not run |
| [Sprint 1: Bluesky video](bsky-parity-sprint-1-video.md) | Video posts | Not run |
| [Sprint 2: engagement and metadata](bsky-parity-sprint-2-metadata.md) | Likers, reposters, languages, link cards, labels | Not run |
| [Sprint 3: author controls](bsky-parity-sprint-3-controls.md) | Reply and quote limits, hide replies, pins, quotes | Not run |
| [Sprint 4: moderation](bsky-parity-sprint-4-moderation.md) | Muted words, mute thread, moderation lists, moderation services | Not run |
| [Sprint 5: discovery](bsky-parity-sprint-5-discovery.md) | Starter packs, suggestions, show more / less like this | Not run |
| [Write and Drafts](write-drafts-2026-11.md) | Autosave, versions, word count, Write shortcuts | Not run |

The roadmap these come from is `sprint/november_2026_bsky_parity.md`.

## Accounts you need

- **Bluesky A**: a bsky.social account with a **verified email** (video needs it).
- **Bluesky B**: a second Bluesky account, to reply, quote and like as someone else.
- **Mastodon M**: a Mastodon account on a 4.5+ server (quotes need 4.5).
- A browser profile with no Mawkingbird data, for the first-visit checks.

Use a staging build (`/test/` or canary) or a local production build. On
`localhost`, Bluesky OAuth moves you to `127.0.0.1`, which has separate
storage; test connector OAuth on a deployed build instead.
