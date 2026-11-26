# Native transport gaps: what works on the web and fails in the desktop app

Status: sprint 0 implemented, uncommitted · 2026-11-23. Sprints 1–6 planned, not started.

## Why

Native shows the same UI as the web, so every button looks finished. Underneath,
the webview cannot reach the network at all (`connect-src 'self' ipc:`). Each
request crosses to Rust, which carries only what it lists. A shared feature that
calls anything unlisted renders normally in Native and fails when pressed.

0.1.0 shipped that way for Mastodon: reading and likes worked, and posting,
replying, boosting, following and deleting all failed. Likes had been opened as a
first slice on 2026-11-13; `02-accounts-and-secrets.md` in `mawkingbird_native`
kept an unticked "confirm exposed social write controls match supported native
operations", and nothing in CI noticed. Eight days of web features then landed on
the same transport.

Allow-listing is right and stays. What was missing is a check that the list and
the UI agree.

## Gaps found (2026-11-23, by reading code; only the Mastodon ones were seen by the owner)

| Area | Fails in Native | Where it is refused |
| --- | --- | --- |
| Mastodon writes | All except like/unlike | **Fixed in sprint 0** |
| Uploads | Pictures, video and audio in posts; avatar and header; Unbird photos; Studio recordings | `native-public-http.ts` (files), `mastodon_write.rs` (`/api/v2/media`), Bluesky `uploadBlob` |
| Saving files | Generated exports now use the desktop save dialog (32 MiB limit) | Implemented for 0.3.0; OS-dialog acceptance pending |
| Live updates | Mastodon streaming WebSocket | CSP |
| Bluesky account | Preferences, lists, bookmarks, drafts, list mutes/blocks, thread mutes, thread/quote controls, starter packs | `bluesky.rs` `operation()`: NSIDs and `repo` collections |
| Bluesky proxied services | Direct and group chat, reports, moderation inbox, feed feedback | `blueskyFetch` refuses the `atproto-proxy` header; login lacks `transition:chat.bsky` |
| Bluesky contacts, video | All | NSIDs; `video.bsky.app` is another host |
| Public Mastodon reads | Boosters/favouriters and bounded opaque account/post IDs are now permitted | Implemented for 0.3.0; real-server acceptance pending |
| PeerTube | Opening a video on Watch | `/api/v1/videos/…` is not a listed path |
| Radio catalogues | Library of Congress, Internet Archive, Openverse, Audius, Wikimedia Commons | CSP; no command |
| Embedded players | SoundCloud, Mixcloud, Spotify, Bandcamp | CSP `frame-src` lists YouTube only |
| Already on hold | Dropbox, Blogger, Twitter, Hugo POSSE | Owner hold; not planned here |

Sprint 1 replaces this hand-made table with a generated one. Treat it as a floor.

## 0.3.0 preparation: existing media metadata (2026-11-26)

The private host now permits `PUT /api/v1/media/:id` with `write:media` (or
umbrella `write`) on the signed-in account's own server. Delete & repost can
reuse existing attachments and save their descriptions and focal points before
publishing. This does not enable uploading new files; the uploads row and sprint
2 above remain open. Coverage includes native IPC, host scope/path boundaries
and a local socket request; a real-account delete-and-repost remains to be checked.

## Sprint 0: Mastodon writes (done)

`mastodon_account_write` carries every write the shared UI makes: an explicit
method+path table with a scope per route, pinned to the account's server, no
redirects, no retries. Deleting a post also drops it from the local archive; a new
or edited post enters it.

Evidence: Rust table, boundary, scope and wire tests; Angular bridge specs; clippy
`-D warnings`; Native frontend and host builds; Windows host smoke. **Not run:** a
real account.

- [ ] Owner: post, reply, boost, bookmark, follow, mute, edit, vote, then delete
      the post. It leaves the profile and stays gone after a restart.
- [ ] A read-only login says to reconnect with Full access.

## Sprint 1: make this impossible to miss

The only sprint that prevents a repeat, so it comes first.

- [ ] `ui/scripts/check-native-transport.mjs`: collect every Mastodon path+method,
      Bluesky NSID, Misskey endpoint and external host `ui/src` calls; compare with
      the Rust lists. Fail on anything unlisted and not in a reviewed
      `native-transport-gaps.json` (call, reason, sprint). Runs in `check:static`.
- [ ] The private host is not in CI here, so compare against one generated
      `transport-policy.json` that `make deploy-source` mirrors, with a Rust test
      that it matches the code.
- [ ] One `NativeSupport` answer per capability. A control whose call is a known gap
      is hidden in Native, or says it isn't available in the desktop app yet. No
      control may be able only to fail.
- [ ] Refusals name the action in plain words (not "transport", not a bare "failed").
- [ ] A mirror check: `native/` differs from the last `deploy-source` output → fail.

## Sprint 2: uploads and saving files

Needs the owner to lift the "media/video uploads" hold.

- [ ] Upload command: file bytes from the composer, size and MIME limits from the
      instance, progress, cancel; no path from the renderer. Then `PUT media/:id`,
      avatar and header.
- [ ] Save command over the existing dialog plugin for text, CSV, HTML and zip;
      `save-file`, `save-csv` and the other blob downloads use one helper.
- [ ] Bluesky `uploadBlob` on the same path.

## Sprint 3: Bluesky account operations

- [ ] Reads and writes: preferences, lists, bookmarks, drafts, list mutes/blocks,
      thread mutes, starter packs.
- [ ] `repo` collections: `list`, `listitem`, `listblock`, `threadgate`, `postgate`,
      `generator` likes; `applyWrites` limited to those and the signed-in DID.

## Sprint 4: Bluesky chat, reports and contacts

- [ ] Named proxy targets (`bsky_chat`, `atproto_labeler`, `bsky_fg`), never a free
      header.
- [ ] Add `transition:chat.bsky` to sign-in. Existing accounts must reconnect; say so.
- [ ] Contacts, reports and moderation inbox. Video service last.

## Sprint 5: radio, PeerTube, players, reading

- [ ] One typed command per catalogue, like `wikidata.rs`: fixed host, path and query.
- [ ] PeerTube details; playback through `native-media`.
- [ ] Owner decision: allow SoundCloud/Mixcloud frames, or open them in the browser.
- [ ] Public reads: booster and favouriter lists, non-numeric ids.
- [ ] Mastodon streaming over a Rust channel, or bounded polling as for Misskey.

## Sprint 6: acceptance

- [ ] Owner walk-through on Windows with one real Mastodon, Bluesky and Misskey
      account: every menu item on a post and a profile.
- [ ] Move each newly working feature into `NATIVE_CHANGELOG.md` (it is deliberately
      absent until then) and delete its row above.

## Order

1 first. Then 2 (a client that can't attach a picture), 3, 4, 5, 6.

### 0.3.0 public reads and generated exports

Public read IDs accept ASCII letters, digits, hyphens and underscores, up to 128
characters; reserved account routes remain denied. This does not remove the
background archive's separate numeric-ID assumptions. Generated files use
`save_export`, a 32 MiB bound, and an OS-selected destination; no renderer path
is accepted. New media uploads and remote media fetching remain separate gaps.

Native component CSS has its own 16/24 kB warning/error limits. The 1 MB startup
bundle cap and all web limits stay unchanged. Native connector handlers load on
the first external request; the initial bundle is 999.61 kB (4.40 kB saved).
