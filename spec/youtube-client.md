# Video client: YouTube without a YouTube account, PeerTube playback

Status: S1–S4 implemented, live tests pending · 2026-11-18. Pair B gates on the
combined tree; S5–S6 proposed.

### S4 evidence (2026-11-18)

- Owner feedback folded in:
  - The web no longer upsells Plus for YouTube search. It says to search from
    the app and links **Install Mawkingbird Native** (`/settings/app`), using
    new keys. The web Plus path still works.
  - Video search's hand-offs ("Search all posts", Google) are a labelled
    "Search elsewhere" list of plain links, not peer buttons.
  - The empty queue's copy no longer repeats "queue".
- Landing: the video mode's first tab is **Subscriptions** (`/videos`).
  - One page of Home's posts from people you follow is merged into the RSS
    uploads by video ID (`mergeFollowedPosts`). A post adds to "Shared by"
    (avatars plus "Watch with their replies"), or becomes its own item for a
    video you aren't subscribed to.
  - Shorts are flagged from `/shorts/` links and hidden unless toggled.
  - The header is one compact Toolbar (All videos, Saved, Shorts, Refresh,
    Customize).
- **Recently seen** (owner request) on the watch queue:
  - Post history entries now note the video (Watch params, title and poster;
    never a media URL; `seen-videos.ts`).
  - The queue page offers the newest six not already queued, below the queue,
    with Add and Watch.
  - It follows the History setting. There is no new storage key, and the
    registry note is updated.
- Player bridge: the YouTube embed gets `enablejsapi=1&origin=…`.
  - Watch reads the playhead from `infoDelivery` messages, accepted only from
    the `youtube-nocookie.com` origin and that exact frame, and only a finite
    numeric time.
  - It seeks with a `postMessage` command. Native videos use `timeupdate` and
    `currentTime`. No Google script runs in the page.
  - Chapters now seek in place (before, `?t=` reloaded and unloaded the
    player), falling back to the `?t=` cue when nothing is loaded. The current
    chapter follows playback.
- SponsorBlock:
  - A `connector-sponsorblock` flag (on by default).
  - The web fetches directly (CORS `*` verified); Native uses
    `sponsorblock_segments` in Rust. Both send only a 4-hex SHA-256 prefix and
    a fixed category list (sponsor, self-promo, subscribe reminder, intro,
    outro), and treat 404 as none.
  - Under the player: a strip and a count. A **Skip** button shows only while
    a segment plays. It never skips automatically and never submits.
- PeerTube:
  - `peertubeSource` recognises `/w/<shortUUID>` and `/videos/watch/<uuid>` on
    any https host, and `statusVideo` falls back to it.
  - Cards show the poster and "Open Watch to play it here". The `peertube`
    Watch/queue param is validated.
  - Watch resolves `/api/v1/videos/:id` anonymously. It plays HLS on the web
    and a ≤720p MP4 on Native through the shared player.
  - NSFW videos gate like sensitive media. Failure shows "Open it on <host>".
  - **Follow** goes to the channel's ActivityPub actor. RSS subscribe for
    PeerTube is not done.
- Native: `sponsorblock.rs` (fixed host, path and category list; tests refuse
  full IDs and path tricks), registered and noted in the capability table.
- Focused checks: the reading, posts/status-card, shell, platform and
  post-history subset (206 files, 2,405 tests), then the Watch spec rerun
  (22 tests). Plus `cargo test --lib sponsorblock`, lint, `check:static`,
  `check:i18n`, the deep-link audit (0 broken) and the reconciled inventory.
- Pair B gates: below.

### S3 evidence (2026-11-18)

- Spikes: Wikidata SPARQL answers browsers (`Access-Control-Allow-Origin: *`)
  and gave TechConnectify@mas.to and geerlingguy@mastodon.social (CGP Grey has
  an item but no P4033). Technology Connections' own About links list
  `mas.to/@TechConnectify`. Channel uploads now arrive as `LockupView`.
- Native: `wikidata.rs` (`wikidata_channel_creator`). Rust builds one fixed
  P2397→P4033 query from a validated channel ID; there is no renderer-supplied
  SPARQL. Native's CSP blocks remote fetches, hence the command. Its test
  covers injection attempts. Registered, and noted in the capability table.
- Client:
  - The `connector-wikidata` connection flag (on by default; only the
    channel ID is sent) and the `PLATFORM_WIKIDATA` token.
  - `YoutubeFeeds.channel()` (Native): handle, About links (scheme added,
    non-web dropped), subscribers, and paged uploads, which can be skipped.
  - `CreatorLinks`: candidates come from the channel's About links (Mastodon-
    shaped, not Medium/Bluesky/YouTube) and Wikidata. Each is looked up
    publicly on its own server; it counts as confirmed when its profile links
    the channel ID or @handle. Ranking: confirmed, then agreement, then the
    channel's own claim.
  - `/videos/channel/:channelId`: RSS uploads for everyone (open to
    strangers via a narrow `publicChannel` auth-guard rule and a `LINKS`
    contract in the deep-link audit), plus the Native extras. The double
    subscribe: Subscribe (RSS) and Follow (the shared FollowButton, foreign
    handle), with the source and an "is it really them" note when unconfirmed.
  - Watch: Follow and a Channel link. Search results and subscription rows
    link to channel pages.
- S2 follow-up (owner asked to surface chapters): `details()` now uses
  `getInfo`, so YouTube's own markers, creator before automatic, come before
  description timestamps. Technology Connections videos have automatic
  chapters with no timestamps in the description. Chapters show under the
  player, not in the collapsed section, with their source and the cued one
  highlighted.
- Unbird gate fixes (owner decisions): the shell spec includes `/unbird`.
  `mockingbird_oauth_signup` is NOT_VAULTED (single-device, in-flight OAuth
  secret). The test manifest was accepted after another developer's test-quality
  pass (approved): 10,390 present, 0 added, 0 missing.
- Focused checks: `test:subset` over videos/watch/build/guard/routes (29
  files, 330 tests), `cargo test --lib wikidata`, lint on the touched files,
  `check:static` green, `check:i18n`, the deep-link audit (0 broken), and the
  reconciled inventory (677 candidates).
- Deferred to the end of pair B (after S4): `make test`, `build:mockingbird`,
  design-verify, native full gates, and `test-deep-links-browser` (a new
  public route).
- Live: [S3 test plan](test_plans/youtube-client-s3-channels-2026-11.md), not run.

### S2 evidence (2026-11-18)

- Spike (Node, youtubei.js 18.1.0, no key/OAuth/cookies): search, `player`
  details, top comments (20 per page, more available) and a channel's uploads
  all worked anonymously, using only the four allow-listed endpoints. No Rust change was needed.
- Comment modes: `PartyConversation` picks the mode per visit (post → replies,
  party tags → replies + hashtag, bare video → hashtag). A compact Toolbar of
  pressed buttons replaces the persisted `<select>`, and the stored `mode` is
  dropped from `mockingbird_watch_party`; the key name is unchanged. Adding a tag
  while tags are hidden switches to show them. On Native, **YouTube** mode shows
  `YoutubeComments`: read-only, plain text, paged on request, never polled.
  The reader's Mastodon keyword filters (thread context) are applied to it via
  `keywordFilterAction`.
- Watch: the source post's card moved under the player (YouTube's
  "description" spot), so Like/Boost/Quote/Bookmark are the card's own,
  including POSSE and Raindrop. The compact-view topic line is gone.
  `WatchVideoPanel` adds:
  - Subscribe (channel from Native details, or resolved from the post's
    link-card author on the web);
  - Share (the shared Compose in a Dialog, with the cue link and party tag);
  - Find posts about this video (`VideoPostFinder`: link timeline +
    search, bare videos, Mastodon accounts);
  - on Native, About this video (length, not-family-safe note, chapters,
    description).
  `/watch?t=` cues the embed, which stays paused. Chapters link to it, and
  `t` is not part of queue keys.
- Native YouTube search failures no longer mention Plus.
- Changes from the plan:
  - **Follow** on Watch moves to S3, because it needs CreatorLinks to know the
    creator's Mastodon account.
  - The share sheet's "at mm:ss" field became the cue link (the embed loads no
    Google script, so the app cannot read the playhead). Cue a chapter, then Share.
- Focused checks: `test:subset` over watch/videos/video-player (22 files, 201
  tests), lint and prettier on the touched files, `i18n:extract` +
  `check:i18n`, `audit_deep_links.py` (0 broken), and the reviewed inventory
  (two new candidate files reconciled).
- Live: [S2 test plan](test_plans/youtube-client-s2-watch-2026-11.md), not run.
- Pair A gates (2026-11-18, combined S1+S2 tree):
  - `check:static`: first red on the committed Unbird key `mockingbird_unbird`.
    The IndexedDB name was declared as `UNBIRD_DB_NAME`, which the guard does
    not exempt, so it is now declared as `DB_NAME` and still exported. The
    watch-party registry note is updated. After that, **green**.
  - `make test`: 10,387 of 10,389 passed. The **2 failures are in committed
    Unbird work, not this sprint**, and each needs an owner decision:
    `shell.spec` expects 6 switcher modes (Unbird added a seventh), and
    `vault-manifest.spec` has the new secret `mockingbird_oauth_signup` in
    neither vault list. Specs affected by the post-gate fixes (unbird,
    storage, vault) were rerun: 234 of 235, the same vault failure.
  - `build:mockingbird`: **green**. Initial bundle 921.68 kB, over the 900 kB
    warning budget (under the 1 MB error). Only `platform-http.ts` (the S1
    token) and a registry note line from this work are in initial chunks; all
    YouTube, Watch and comments code is lazy.
  - `make design-verify`: **green**, 463 browser tests.
  - Native: `check-host` and `test-host` (93 passed) **green**. `make frontend`
    needs `MAWKINGBIRD_SOURCE` set; rerun with this checkout, then
    `smoke-frontend`, both **green**.
  - Not run: SEO (no public page changed), `test-deep-links-browser` (no route,
    resolver or landing change; the source audit is clean), `test-integration`.

### S1 evidence (2026-11-18)

- Native: `src-tauri/src/youtube.rs` (`youtube_innertube`), registered in
  `lib.rs`, `build.rs` and `capabilities/main.json`. `cargo test --lib youtube`
  passes 4 new tests: endpoint allowlist, header refusal, body bounds, stream
  URLs stripped. The capability table row is updated.
- Client: `PLATFORM_YOUTUBE` token (web `null`, native invoke). In
  `YoutubeFeeds`, there is one routed Innertube session, `canSearch()`
  (Native or Plus), `canReadDetails()` and `details()` via `player`. Chapter
  parsing lives in `youtube-details.ts`. `/videos` and `/videos/search` gate on
  `canSearch()`, with a new start hint when search is available.
- Focused checks: `test:subset src/app/reading/videos` (13 files, 83 tests),
  `ng lint` on the touched files, `i18n:extract` + `check:i18n`, the reviewed
  `design:inventory-check`, and `design:build` + `video-feeds.browser.mjs` (2 passed).
- Deferred to the end of pair A (after S2), per the cadence: `make test`,
  `check:static`, `build:mockingbird`, design-verify, and the native full gates.
- Live: [test plan](test_plans/youtube-client-s1-native-search-2026-11.md), not run.

Builds on: [Video playback and Watch](video-player.md), [Watch Parties](watch-party.md),
the starter catalogue (`ops/engineering/starter-catalog.md`), and the sibling
`youtuberfinder` repo (to be retired into `mawkingbird_starters`).

## Pitch

`/videos` should feel like a video app made for people on Mastodon. Subscribe to
creators, watch without YouTube's feed, and talk about a video where your
people already are: in the replies to a post, or in a hashtag stream such as
#monsterdon. Find creators through curated "YouTubers on Mastodon" packs.

We will never get a paid, OAuth-blessed YouTube Data API key. Everything here
uses public channel RSS, YouTube's anonymous web endpoints (on Native only),
oEmbed, Wikidata, and Mastodon itself.

## Owner decisions (2026-11-17)

| Topic | Decision |
|---|---|
| Platform split | **Native-first, web degrades.** Native gets search, channel pages and video metadata directly. Web keeps RSS subscriptions, Mastodon-sourced video and Plus-proxied search as it has today. |
| Subscribe | **Two buttons.** "Subscribe" adds the channel RSS to video subscriptions. "Follow" follows the creator's known Mastodon account. |
| Like | Like = favourite the Mastodon post. Also Bookmark, Boost and Quote, reusing existing post actions. Do not rebuild the mini composer; add a video-specific share sheet only. |
| Comments | **Auto-pick, switchable.** Opened from a post → replies. Opened from a party or hashtag → tag stream. A toolbar toggle switches between them when both exist. |
| Directory | **YouTube starters are their own pack kind**, not ordinary starter packs, because each creator may need a double subscribe (channel RSS + Mastodon follow). The youtuberfinder ETL moves into `mawkingbird_starters`, and that work comes last. Until it lands, a fake one-creator kit (Technology Connections) stands in. |
| SponsorBlock | **Yes.** Show segments on the scrubber with a Skip button. |
| Release cadence | Six sprints, **push after every two** (after S2, S4, S6). Run the full gates once per pair, on the combined tree. Focused checks only inside a sprint. |
| Language | **Video titles win.** Detect from recent RSS titles and descriptions. Profile text only breaks ties. Use Wikidata language of work when present. Multi-language channels are allowed. |
| Safety gate | **Automated, with stricter rules.** No human review per creator. Deny by default on any signal, then spot-check samples. |
| `/videos` landing | **Subscriptions feed.** Newest videos from subscribed channels, merged with video posts from people you follow. |
| PeerTube | **Playback + follow only.** No PeerTube search. |

House rules that apply: no autoplay, no autoplay-next, no loop (video-player.md).
No video bytes through the Plus proxy. No new-video notifications. Use toolbars,
not pill tabs. English only until the feature settles.

## What is broken today

1. **Native search is still Plus-gated.** `YoutubeFeeds.search()`
   (`ui/src/app/reading/videos/youtube-feeds.ts`) throws "requires Mawkingbird
   Plus" before it checks for a native transport. Native exposes only GET
   readers (`PLATFORM_FEED_READ`, `PLATFORM_ARTICLE_READ`). youtubei.js search
   needs `POST /youtubei/v1/search`. **Fix:** add a narrow native transport,
   `PLATFORM_YOUTUBE` (see below). Gate the call on "native transport present
   OR Plus", not on Plus alone.
2. **There are no channel pages.** A channel is only a subscription row. You
   cannot open one and browse its uploads.
3. **There are no Like/Subscribe/Follow actions on `/watch`** for a bare
   YouTube video (`/watch?youtube=`). A video reached through a post has the
   post's actions, buried in the status card.
4. **The comment mode is implicit.** `party-conversation` assumes the hashtag
   model. The replies model only appears as the thread under the post.
5. **Creator discovery is missing.** youtuberfinder's data never reaches the app.

## Architecture

### Native transport: `PLATFORM_YOUTUBE`

A small, allow-listed transport in `mawkingbird_native`, not a general fetch.
It mirrors how youtubei.js is already sandboxed in `search()`:

- `POST https://www.youtube.com/youtubei/v1/{search,browse,player,next}`, with
  the youtubei.js client headers, anonymous (no cookies, no stored visitor data
  beyond the session).
- `GET` for channel pages and `/oembed` (already covered by `PLATFORM_ARTICLE_READ`).
- Reject every other origin and path. Record each endpoint in the native
  capability inventory (`mawkingbird_native/spec/plus_local_capabilities.md`).

| Endpoint | Used for |
|---|---|
| `search` | Video and channel search |
| `browse` | Channel page: uploads, shorts, playlists, about (handle, links, country) |
| `player` | Duration, description, `isFamilySafe`, live/premiere state, chapters from description. No stream URLs: playback stays in the official embed. |
| `next` | YouTube comments, read-only (third comment mode). **Never** related videos (owner, 2026-11-17). |

Web uses the same code path through the Plus proxy for `search` only, as
today. Web `browse`/`player` falls back to RSS + oEmbed (title, author,
thumbnail), which is enough for a degraded channel page.

**How to know the endpoint list is acceptable.** `mawkingbird_native`'s rule
(`spec/plus_local_capabilities.md`) is "scoped native transport replaces
relay for implemented adapters; not an unrestricted proxy". The existing
YouTube embed allowlist in `src-tauri/src/windows_network.rs` is the
precedent. `PLATFORM_YOUTUBE` is acceptable when all of these hold:

- Rust unit tests prove it accepts exactly `https://www.youtube.com` +
  `/youtubei/v1/{search,browse,player,next}`, and rejects lookalike hosts
  (`youtube.com.evil.test`), other paths, `http:` and redirects off-origin.
  The same tests already exist for the embed allowlist.
- It sends no cookies, stores no Google identity and never reads stream URLs
  (playback stays in the official embed).
- Request bodies are size-capped and the response is returned as text only.
- The capability table row "CORS-limited public/provider reads" lists it.
- The owner does a live smoke on Windows Native: search, open a channel,
  load comments.

If any item fails, the endpoint stays out and that feature degrades to RSS.

YouTube's internal API changes without notice. Keep youtubei.js pinned and
behind one service (`YoutubeFeeds`, renamed `YoutubeSource` or split). Every
consumer must survive a failed call by falling back to RSS.

### Identity graph: channel ↔ Mastodon account

One lookup service, `CreatorLinks`, resolves in both directions and caches per device:

1. **Starter pack data** (curated, offline). This is the primary source.
2. **Wikidata** (works on the web too, because the SPARQL endpoint sends CORS
   headers): P2397 YouTube channel ID ↔ P4033 Mastodon address, plus the
   official website and language of work. Verify the property IDs during
   implementation before relying on any beyond P2397/P4033.
3. **Mastodon profile evidence**: the account's bio or profile fields link the
   channel, ideally with a `rel=me` verified field.
4. **Channel about links** (Native `browse`): the channel lists a Mastodon URL.

Show the source behind every match, because "Follow on Mastodon" is a trust
claim. Verified (rel=me or both directions) shows plainly. One-directional
matches say "linked from their channel" or "says so in their profile".

## Screens

### `/videos`: Subscriptions (landing)

- One merged, newest-first list: RSS uploads from enabled subscriptions, plus
  video posts from Home (`/videos/fedi` data). Remove duplicates by video ID. When a
  followed person posted about an upload, show the post's avatar stack on
  that video.
- Toolbar (`mb-toolbar`): Subscriptions · Fediverse · Parties · Queue ·
  Discover. Existing routes keep their URLs.
- Empty state: "Find creators" leads to Discover (packs) and channel search.
- Hide Shorts by default; one toolbar filter shows them.

### Channel page: `/videos/channel/:channelId` (new, shareable)

- Header: avatar, name, handle, **Subscribe** (RSS) and **Follow** (Mastodon,
  only when `CreatorLinks` has a match, showing its source).
- Uploads grid from RSS (15 newest, every platform). On Native, `browse`
  pages further back and adds playlists.
- "On Mastodon": the creator's recent posts, when linked.
- Deep-link rules: anonymous visitors can open it (RSS needs no account). Run
  `audit_deep_links.py` when the route is added.

### `/watch`: the video page

- **Action bar under the player:** Like, Boost, Quote, Bookmark (act on the
  source post), Subscribe, Follow, Queue, Share.
  - With no source post (`/watch?youtube=`), the post actions become "Share
    this video", which opens the video share sheet. Subscribe and Follow still work.
- **Comments panel, up to three modes** in a toolbar toggle:
  - *Replies*: the thread under the source post (today's ThreadLoader).
  - *Hashtag*: the live tag stream (today's `PartyConversation`).
  - *YouTube* (Native only, read-only, collapsed until chosen): top comments
    from the `next` endpoint, read through youtubei.js `getComments` with the
    same anonymous web-client request the YouTube page makes. It needs no API key
    and no OAuth app. There is no reply/like UI; a comment can only be quoted
    into the share sheet. Comments pass through the reader's own muted words and
    filters. If YouTube changes the endpoint, the mode hides itself.
    Sprint 2 starts with a spike that confirms it works anonymously.
  - Default: replies when there is a `post` param, hashtag when there is a `party`/`tag` param.
    Show the toggle only when both are possible. A bare video can start
    either mode: "Find posts about this video" (search by URL and video ID) or
    "Watch with a hashtag".
  - "Find posts about this video" is the clever fallback for bare videos. It
    searches Mastodon for the video URL across `youtu.be` / `youtube.com/watch` /
    `shorts/`. The candidates then become a choice of replies threads.
- **Video share sheet** (not a new composer): it prefills the regular composer
  with the link, an optional "at mm:ss" timestamp link, the party hashtag in
  hashtag mode, and the creator's Mastodon mention when one is linked. It hands
  off to the existing mini composer.
- **Metadata (Native):** duration, chapters as seek links, and the description
  with links cleaned (`ui/src/lib` link cleaning). On web, oEmbed basics only.

### Discover: `/videos/discover`

- Video-scoped starter packs by topic and language, from `mawkingbird_starters`.
- Each card: creator, Mastodon handle, channel, language(s), and how the link was
  established. Row actions are Subscribe + Follow. Pack actions are "Subscribe to
  all" (existing `subscribeAll`) and "Follow all" (the existing starter-pack follow flow).
- Channel search (Native or Plus) is a secondary tab. Results show "on Mastodon"
  badges from `CreatorLinks`.

## Starter ETL migration (youtuberfinder → mawkingbird_starters)

Pipeline stages, each producing reviewable artefacts like other starter ETL:

1. **Collect:** Mastodon profile search (existing discovery queries) plus
   Wikidata P2397 ∧ P4033 seeds.
2. **Link:** require channel evidence (profile link, rel=me, Wikidata, or the
   channel's about link). Classify the account as native creator, RSS mirror,
   bridge, or bot. Mirrors and bots never go into Follow packs.
3. **Language:** run the in-repo detector over the latest ~15 RSS titles and
   descriptions. Any language above a threshold share is listed. Profile text
   breaks ties only. Wikidata language of work overrides when present. This fixes
   the "English header, German videos" failure.
4. **Safety (deny by default, automated):** exclude on any of these:
   - `isFamilySafe=false` or age-restricted recent uploads (`player` per sample video);
   - the Mastodon account is marked sensitive by default, or it posts mostly with media flagged
     sensitive;
   - matches on the shared blocklists (domains, known extremist channel IDs,
     Wikidata "instance of" political-organisation/hate-group classes);
   - keyword screens over titles, descriptions and bio for adult/extremist
     vocab, in each detected language rather than English only.
   An LLM may write a topic summary. It never moves a creator past a safety exclusion.
   Spot-check: each refresh writes a random sample of published creators
   for the owner to skim. A spot-check rejection becomes a blocklist entry, so it
   stays rejected after the next refresh.
5. **Categorise and publish:** topic × language packs, catalogue schema
   validation, locale coverage regenerated per `starter-catalog.md`.

The legacy LLM categorisation output is untrusted. Re-run every creator through
stages 3–4 before the first publish.

## PeerTube: playback + follow

- **Playback:** PeerTube already counts as a video host
  (`video-discovery.ts`). Make sure `/watch` plays PeerTube links in the
  PeerTube embed (`/videos/embed/:uuid`) with the same no-autoplay parameters,
  and native uploads as today.
- **Follow:** a PeerTube channel is an ActivityPub actor
  (`channel@instance`). "Follow" uses the normal Mastodon follow by lookup,
  so new uploads arrive in Home and the `/videos` Fediverse view. Offer
  "Subscribe" through the channel RSS
  (`/feeds/videos.xml?videoChannelId=`) for anonymous visitors.
- Comments on a PeerTube video federate as replies, so replies mode works without changes.
- No Sepia Search, no PeerTube discovery packs for now.

## SponsorBlock

SponsorBlock is a third-party, crowd-sourced database (`sponsor.ajay.app`,
public, no key, CORS-enabled, so it works on the web too). It is not part of
YouTube. YouTube Premium's "Jump ahead" is YouTube's own, different feature
and is not available to us.

- Look up segments by video ID through the privacy-preserving hash-prefix
  endpoint (send the first 4 hex characters of the SHA-256 of the video ID,
  never the full ID).
- Draw the segments on a strip under the player. When playback enters a
  segment, show a **Skip** button. Never skip automatically; that respects the
  "nothing happens on its own" playback rules.
- Seeking needs the YouTube IFrame Player API's `seekTo`. Check whether the
  current embed already loads it; if not, adding it is part of the sprint.
- Read only: we never submit segments or votes.

## Sprints

Every sprint gets a manual live-account test plan in `/test_plans/`. A **push**
follows each pair of sprints, after one run of the full gates on the combined
tree (AGENTS.md cadence). The owner authorises each push; agents leave work
uncommitted.

### Pair A: the client works

1. **S1: Unbreak search, native transport.** Add `PLATFORM_YOUTUBE` in
   `mawkingbird_native` and pass the acceptance list above. Fix the gate order in
   `YoutubeFeeds.search()` to "native transport, else Plus proxy". Add the
   anonymous `player` metadata call (duration, chapters, family-safe). Add unit
   specs for the gate matrix (Native/web × Plus/not × flag off).
2. **S2: Watch page.** Action bar (Like/Boost/Quote/Bookmark, Subscribe, Follow,
   Queue, Share). Add the comment-mode toolbar with replies/hashtag auto-pick,
   then a spike and build of read-only YouTube comments. Add "Find posts about this
   video" and the video share sheet that hands off to the mini composer.

**Push 1.**

### Pair B: channels and the landing

3. **S3: Channel page + CreatorLinks.** `/videos/channel/:id`, shareable and
   open to visitors who aren't signed in (run the deep-link audit). CreatorLinks
   draws on profile evidence, Wikidata and channel about links, and shows its
   source on every match. Add the double subscribe (Subscribe + Follow) on the
   channel page.
4. **S4: Subscriptions landing, SponsorBlock, PeerTube.** `/videos` opens on
   the merged Subscriptions feed with the `mb-toolbar` and Shorts filter.
   Add SponsorBlock marks + Skip. PeerTube embed playback with no autoplay,
   plus channel Follow/RSS.

**Push 2.**

### Pair C: YouTube starters (their own pack kind)

5. **S5: YouTube starter kit, end to end with a fake kit.**
   - Define the YouTube starter schema in `mawkingbird_starters`, separate
     from people packs. Each entry holds: channel ID, channel title, Mastodon
     handle (optional), link evidence and its source, languages, topic, and the
     account kind (creator / RSS mirror / bridge).
   - Check in one fake kit, **"Technology Connections"**, with a single
     creator. The channel ID and the Mastodon handle are both to verify against
     the live channel and profile before checking in; do not trust memory.
     Mark it `sample: true` so the catalogue never publishes it as a real pack.
   - Discover page `/videos/discover`. Rows offer Subscribe + Follow. Kit
     actions: "Subscribe to all" (RSS), "Follow all" (Mastodon), and "Do
     both". Each one reports what it did per creator. Entries without a handle
     offer RSS only; mirrors/bots offer RSS only.
   - Load the kit lazily, outside the root bundle (1 MB budget).
6. **S6: The real ETL.** Port the youtuberfinder pipeline into
   `mawkingbird_starters`: collect, link, language (titles win), safety (deny by
   default, automated), categorise, publish. Re-run every legacy creator from
   scratch. Each refresh writes a spot-check sample, and rejections become
   blocklist entries. Replace the fake kit with the generated topic ×
   language kits. youtuberfinder becomes read-only.

**Push 3.**

## Decided out / parked

- **Related videos: no.** Next up comes from the queue, subscriptions and the
  creator's channel, not YouTube's recommendations.
- **YouTube Premium features** (Jump ahead, downloads, background play) are
  out of reach without a Google account and are not imitated.
