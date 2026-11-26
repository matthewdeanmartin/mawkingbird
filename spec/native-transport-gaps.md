# Native transport gaps: what works on the web and fails in the desktop app

Status: updated for the three 0.3.0 implementation sprints, 2026-11-26. The numbered roadmap below is historical; the current scope/evidence is at the end.

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
| Uploads | Video/audio, avatar/header and Bluesky media remain unsupported. Mastodon PNG/JPEG/GIF/WebP attachments now work, up to 16 MiB. | Dedicated `mastodon_picture_upload`; other file operations remain refused |
| Saving files | Generated exports now use the desktop save dialog (32 MiB limit) | Implemented for 0.3.0; OS-dialog acceptance pending |
| Live updates | Mastodon streaming WebSocket | CSP |
| Bluesky account | Server-synced drafts, thread/quote controls and starter-pack management remain unsupported. Preferences, bookmarks, lists, list mutes/blocks, thread mutes and atomic replace-post are implemented. | `bluesky.rs` `operation()`: NSIDs and `repo` collections |
| Bluesky proxied services | Direct and group chat, reports, moderation inbox, feed feedback | `blueskyFetch` refuses the `atproto-proxy` header; login lacks `transition:chat.bsky` |
| Bluesky contacts, video | All | NSIDs; `video.bsky.app` is another host |
| Public Mastodon reads | Boosters/favouriters and bounded opaque account/post IDs are now permitted | Implemented for 0.3.0; real-server acceptance pending |
| PeerTube | HLS-only/live streams open externally. Public metadata and direct MP4 playback are supported. | Narrow `/api/v1/videos/:uuid-or-short-id` read and native-media |
| Radio catalogues | Library of Congress, Internet Archive, Openverse, Audius, Wikimedia Commons | CSP; no command |
| Embedded players | SoundCloud, Mixcloud, Spotify, Bandcamp | CSP `frame-src` lists YouTube only |
| Already on hold | Dropbox, Blogger, Twitter, Hugo POSSE | Owner hold; not planned here |

Sprint 1 replaces this hand-made table with a generated one. Treat it as a floor.

## 0.3.0 preparation: existing media metadata (2026-11-26)

The private host now permits `PUT /api/v1/media/:id` with `write:media` (or
umbrella `write`) on the signed-in account's own server. Delete & repost can
reuse existing attachments and save their descriptions and focal points before
publishing. This metadata route does not upload files; the later picture-upload command
below handles new attachments. Coverage includes native IPC, host scope/path boundaries
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

The earlier plan recorded an owner hold on media/video uploads. Treat that as
historical planning context: the technical blockers are the missing binary upload
bridge and host operations below. A new explicit implementation request sets scope.

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
is accepted. Picture uploads are handled separately; other media uploads remain gaps.

Native component CSS has its own 16/24 kB warning/error limits. The 1 MB startup
bundle cap and all web limits stay unchanged. Native connector handlers load on
the first external request; the initial bundle is 999.61 kB (4.40 kB saved).

### 0.3.0 implementation — three sprints (2026-11-26)

1. Release automation: draft directly from Unreleased; promotion and version
   stamping happen only in CI after publication. One metadata overlay feeds the
   installers, SBOM and independent bookkeeping PR. Local source deployment
   imports public release state; conflicts warn loudly and continue. No cross-repo
   Actions and no rollback/tag movement. Isolated tests use pinned kaclm 6.10.1;
   it drops empty Unreleased after promotion, so automation restores that heading.
2. Mastodon pictures: a dedicated, same-account, `write:media` command accepts
   bounded base64 bytes and creates multipart PNG/JPEG/GIF/WebP uploads (16 MiB;
   server limits still apply). At most four uploads run together. Alt text is
   preserved; 202 processing is polled, including empty 206 responses, before
   reporting completion. No renderer-chosen filesystem paths or credential
   redirects. The existing uploading indicator/errors are reused. Byte progress,
   in-flight cancellation, video/audio, avatar/header and Bluesky blobs remain
   deferred; an upload timeout does not retry the POST automatically.
3. Bluesky preferences/bookmarks/list membership and list moderation/thread mutes
   are allowed on the signed-in PDS. Atomic replacement and list deletion use
   bounded applyWrites batches, restricted to the signed-in DID and reviewed
   collections; unknown operations, foreign repositories and mixed forbidden
   writes reject the whole batch. PeerTube metadata is public and scoped to one
   video ID, without query credentials. Native chooses direct MP4; HLS-only/live
   results trigger Watch's existing external-browser fallback.

Light checks: 7 Mastodon host tests, 12 Native HTTP tests, 69 targeted Bluesky/
PeerTube/Watch UI tests; 130 Rust tests pass (the pre-existing opt-in live OAuth
probe is not part of the offline suite). Release-version tests, an isolated real
kaclm promotion/rerun, Actionlint and offline Zizmor pass. Final build/host smoke
results are recorded in the release handoff; these are not real-account posting
or live PeerTube playback acceptance claims.

Deferred Bluesky features remain server draft sync, starter-pack management,
thread/quote gates, blob/video uploads and chat/reporting service proxies. Reading
preferences/lists already worked before these sprints; don't describe all Bluesky
support as newly added. Deferred transport failures remain explicit to callers.

Final Native evidence: frontend build passes at 999.84 kB initial size (under the
unchanged 1 MB cap); Rust clippy with warnings denied and Windows host build pass.
The actual Windows WebView2 host fetched live PeerTube metadata through Rust,
decoded/played the MP4 through native-media, and successfully sought to 30 seconds.
The broader live-host smoke reached an unrelated Apertium translation HTTP 500;
the owner explicitly accepts flaky free third-party services as warnings, not a
0.3.0 blocker. No real-account Mastodon/Bluesky writes were made by these checks.

The final full UI run passes all 11,498 tests with coverage (81.05% lines), and
the runtime manifest audit passes after documenting two already-committed Watch
mode test replacements. Shell's spec now drains its lazy onboarding import before
teardown. Design static/build checks pass; 470 browser checks passed initially,
and all 8 checks in the affected files pass after updating three stale Inbox
expectations to Conversations/Stats/Stream. No visual assertions were removed.
SEO and targeted lint pass. Tests renamed/replaced in this work are documented
in `ui/test-removals.md`; generated manifests were updated by the audit tool.

The ordinary web production build also passes, including startup/Lite budgets.
All release changes remain uncommitted; GitHub has not run the new workflows or
built the 0.3.0 installers yet. Unrelated Firefox-extension work is excluded.
