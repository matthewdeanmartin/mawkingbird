# Bluesky parity roadmap, November 2026

Status: sprints 1 and 2 code complete, awaiting live trials · 2026-11-02.

Mawkingbird is a client first; Bluesky is one of its two networks. Today a
Bluesky account can read, reply, like, repost, quote, bookmark, follow, block,
mute, report, use feeds and lists, and chat. This roadmap closes the gaps where
**Bluesky has an API and Mawkingbird does not use it**. Where Bluesky has no
such feature at all, there is nothing to build; those are listed at the end so
nobody plans them again.

Ground rules for every sprint:

- Works for both ways in: a Bluesky-first identity and a Bluesky connector
  under a Mastodon or Anonymous account, with OAuth and app-password sessions.
  Calls go through `BlueskyApi`, which already picks the right transport.
- Media bytes go from the browser straight to Bluesky. Never through the
  Mawkingbird Plus proxy or a CORS proxy.
- English only: declare `// i18n` keys and run `i18n:extract`. Strings join
  the global translation pass. The translated SEO pages are the exception.
- Gates per AGENTS.md: targeted specs while working, then `cd ui && make test`,
  `npm run build:mockingbird`, and `make design-verify` when a shared widget
  changes. Browser gates run once at the end of a sprint.

Already done before this roadmap (2026-11-02): OAuth-first Bluesky connector,
with the app password as the last resort, and Bluesky counts in the action row
placed and styled like Mastodon's (`span[mbPostAction]`).

## Sprint 1: video posts

Goal: a Bluesky post, or the Bluesky half of a cross-post, can carry one video.

API: service auth from the account's PDS (`com.atproto.server.getServiceAuth`,
`aud` = the PDS `did:web`, `lxm` = `com.atproto.repo.uploadBlob`), then
`app.bsky.video.uploadVideo` on `https://video.bsky.app`, polled with
`app.bsky.video.getJobStatus` until the job returns a blob. Limits come from
`app.bsky.video.getUploadLimits` (`aud` = `did:web:video.bsky.app`). The post
embeds `app.bsky.embed.video` with `alt` and `aspectRatio`, or
`recordWithMedia` when quoting. The video service allows browser CORS
(`Access-Control-Allow-Origin: *`, checked 2026-11-02), so no proxy is needed.

1. **Upload service** (`providers/bluesky/bluesky-video.ts`). Limits check,
   service token, upload, job polling with progress, `already_exists` reuse,
   failures surfaced with Bluesky's own message. PDS resolution moves out of
   `BlueskyChatApi` into a shared resolver.
2. **Composer.** Bluesky accepts MP4, MPEG, WebM and QuickTime, one video per
   post, never mixed with images. Size (300 MB) and duration (10 minutes) are
   checked when the file is picked, from its metadata. Alt text uses the
   existing media description editor. Progress shows while Bluesky processes.
3. **Copy.** "Bluesky takes images only" notices become the real rules.

Acceptance: a Bluesky-only post with a video and a cross-post with a video
both publish, play in the timeline, and keep alt text and aspect ratio; a
daily-limit refusal says so before uploading; a second video or a video plus
images is refused at pick time with the reason.

Follow-ups, not in this sprint: captions (`captions`, WebVTT blobs); the
multipart upload (`app.bsky.video.startUpload` / `finishUpload`) that Bluesky's
own app now uses for large files; video on the Write page.

## Sprint 2: who engaged, and post metadata

Goal: Bluesky counts open their lists, and posts carry the metadata Bluesky
feeds and filters rely on.

1. **Liked by, reposted by, quotes.** `app.bsky.feed.getLikes`,
   `app.bsky.feed.getRepostedBy`, `app.bsky.feed.getQuotes`. The static
   Bluesky counts become count buttons that open the existing account-list
   dialog (quotes open a post list).
2. **Post languages.** Send `langs` from the composer's existing post-language
   choice. Bluesky's language filters and many feeds depend on it.
3. **Link cards.** When the post has a link and no other media, attach
   `app.bsky.embed.external` with title, description and an uploaded thumb.
   Metadata comes from the page through the existing article fetch path; a
   failed fetch posts without a card rather than blocking.
4. **Content labels.** Self-labels (`labels` with `com.atproto.label.defs#selfLabels`:
   sexual, nudity, porn, graphic-media) on posts with media.

Acceptance: counts open the right lists and paginate; a post written in German
shows `langs: ['de']`; a link-only post shows a card on bsky.app; a labelled
image is blurred on bsky.app.

## Sprint 3: reply and quote controls, and quotes

Goal: the controls Bluesky gives authors over their own threads.

1. **Who can reply** (`app.bsky.feed.threadgate`): everyone, nobody,
   mentioned, followers, following, list members. Set at compose time and
   editable afterwards from the post menu.
2. **Hide replies** (threadgate `hiddenReplies`) on your own threads.
3. **Quote controls** (`app.bsky.feed.postgate`): disable quoting, and detach
   your post from someone's quote (`detachedEmbeddingUris`).
4. **Pinned post.** Pin and unpin from the post menu (`pinnedPost` on
   `app.bsky.actor.profile`), and show the pin on profiles.
5. **Reading side.** Show "replies limited" and respect it in the reply button.
6. **Quotes list** (moved from sprint 2). A quote count after ❝ on both
   networks, opening the quoting posts: `app.bsky.feed.getQuotes` for Bluesky,
   `/api/v1/statuses/:id/quotes` for Mastodon.

Acceptance: each setting round-trips through bsky.app; a limited thread
disables Reply with the reason; a pinned post leads the profile; the quote
count opens the posts that quoted it.

## Sprint 4: moderation

Goal: Bluesky's own moderation tools, not only block and mute.

1. **Muted words and tags** (`mutedWordsPref` via `app.bsky.actor.putPreferences`),
   including expiry and "exclude people I follow", applied to Bluesky timelines.
2. **Mute thread** (`app.bsky.graph.muteThread` / `unmuteThread`).
3. **Moderation lists.** Subscribe to mute lists (`muteActorList`) and block
   lists (`app.bsky.graph.listblock`), and create your own.
4. **Labelers.** Show subscribed moderation services
   (`app.bsky.labeler.getServices`) and honour their labels' blur/hide settings.

Acceptance: a muted word hides matching posts in Home and feeds; a subscribed
block list blocks its members; preferences changed here show up on bsky.app.

## Sprint 5: discovery

Goal: Bluesky's ways to find people, wired into Mawkingbird's.

1. **Starter packs** (`app.bsky.graph.getStarterPack`,
   `getActorStarterPacks`, `app.bsky.graph.starterpack`). Open one, follow
   all or some, and create one from a list. Fits beside Mawkingbird's own
   starter kits.
2. **Suggestions** (`app.bsky.actor.getSuggestions`,
   `app.bsky.graph.getSuggestedFollowsByActor`) after a follow and on Explore.
3. **Feed feedback** (`app.bsky.feed.sendInteractions`): "show more / show less
   like this" for feeds that accept it.

Acceptance: a bsky.app starter pack link opens in Mawkingbird and follows
work; following someone offers related accounts.

## Sprint 6: chat

Goal: the parts of Bluesky chat Mawkingbird does not do yet.

1. **Reactions** (`chat.bsky.convo.addReaction` / `removeReaction`).
2. **Message requests**: accept (`acceptConvo`) and see requests apart from
   accepted chats.
3. **Leave and mute a conversation** (`leaveConvo`, `muteConvo`).
4. **Delete a message for yourself** (`deleteMessageForSelf`).
5. **Chat settings**: who can message you (`chat.bsky.actor.declaration`).

Acceptance: each action round-trips with bsky.app.

## Not possible on Bluesky

No API exists, so these stay Mastodon-only or out of scope:

- Editing a post (Mawkingbird's delete-and-repost replacement stays).
- Polls.
- Free-text content warnings (Bluesky has labels; sprint 2 covers them).
- Followers-only or private posts.
- Server-side scheduled posts and server-side drafts.
- Native GIF search (bsky.app uses a third-party GIF service, not an AT
  Protocol API).

## Evidence

### Sprint 1 progress (2026-11-02): code complete, needs a live trial

- **Upload service** (`providers/bluesky/bluesky-video.ts`). `checkLimits()`
  asks `getUploadLimits` with a `did:web:video.bsky.app` token and refuses with
  Bluesky's message when `canUpload` is false; an unreachable limits endpoint
  does not block (the upload reports the same refusal). `upload()` gets a
  30-minute `uploadBlob` token for `did:web:<PDS host>` from the PDS itself,
  posts the raw bytes to `uploadVideo` with `did` and a random file name (the
  original name stays private), reuses the job on a 409 `already_exists`, and
  polls `getJobStatus` (unauthenticated, as Bluesky allows) every 1.5 s, up to
  about 10 minutes. `metadata()` reads width, height and duration in the
  browser. Bytes go straight to `video.bsky.app` (CORS verified), never a proxy.
- **PDS resolver** (`bluesky-pds.ts`), moved out of `BlueskyChatApi` so chat
  and video share it.
- **Composer.** Bluesky takes up to four images, or one video on its own.
  Picking enforces it with the reason in the media notice: video beside photos,
  a second video, over 300 MB, or over 10 minutes is left out. A Bluesky-only
  video is held locally (no Mastodon upload) and previews in the existing
  player. At submit the video embed carries alt text from the description
  field and the aspect ratio from the file; quotes use `recordWithMedia`.
  Progress ("Uploading…", "Bluesky is processing the video (40%)…") shows in
  the media notice. Failures name Bluesky's reason, such as the daily limit or
  an unverified email, and post nothing to Bluesky. For a "both" post with
  photos and a video, Bluesky gets the photos.
- **Copy.** The Posting media help guide and the Bluesky landing page state
  the video rules.
- **Tests.** `bluesky-video.spec.ts` (7): token audience and method, upload
  request, polling and progress, 409 reuse, failed job, refused upload, limits.
  `compose.spec.ts` (+7): pick rules, size and length limits, the posted embed,
  and a refusal's reason. `make test` 9,089/9,089 with 0 missing from the
  manifest; `build:mockingbird` initial bundle unchanged (901.68 kB, still
  over the 900 kB warning budget it already exceeded); SEO and help-site checks
  pass. `design-verify` not rerun: no shared widget changed.
- **Not yet verified:** a real upload against Bluesky. Unit tests mock the
  network. The trial needs a signed-in account with a verified email: post a
  short MP4 Bluesky-only, then a cross-post, and check playback and alt text on
  bsky.app.
- **Deferred, as planned:** captions, multipart upload, video on the Write
  page. Video metadata is not stripped in the browser; Bluesky's transcode
  writes a new file.

### Sprint 2 progress (2026-11-02): code complete, needs a live trial

- **Liked by and reposted by.** Bluesky's like and repost counts are now
  count buttons, placed and styled like Mastodon's, that open the shared
  AccountListDialog. With a Bluesky post URI the dialog reads
  `app.bsky.feed.getLikes` / `getRepostedBy` through `publicGet`, so readers
  with no Bluesky account see them too. One page of 100, the same depth the
  Mastodon lists show.
- **Post languages.** The composer's post language goes out as `langs` on
  every post of a Bluesky thread, fixed when posting starts.
- **Link cards.** A Bluesky post with a link and no media or quote gets an
  `app.bsky.embed.external` card: title and description from
  `cardyb.bsky.app` (Bluesky's own card service, the one bsky.app uses; not an
  AT Protocol API, CORS open, checked 2026-11-02) and the image shrunk and
  uploaded as the thumb. An 8 s timeout or any failure posts without a card.
- **Content labels, writing.** With ⚠️ on, media attached and Bluesky a
  destination, a "Bluesky label" select offers suggestive, nudity, adult
  content and graphic media, sent as `com.atproto.label.defs#selfLabels`. With
  no label picked, a hint says Bluesky will not hide the media.
- **Content labels, reading** (added: it was a gap). Incoming Bluesky posts
  with a content label, from the author or a moderation service and not
  withdrawn, arrive as `sensitive`, so the card keeps their media covered.
  Before this every Bluesky post was `sensitive: false`.
- **Tests.** `bluesky-link-card.spec.ts` (4), `account-list-dialog.spec.ts`
  (+2), `bluesky-adapter.spec.ts` (+3), `compose.spec.ts` (+3) and the
  status-card row test now expecting count buttons. `make test` 9,101/9,101,
  0 missing; build initial bundle unchanged; help site and the adoption-11 and
  account-connections browser suites pass (34/34).
- **Deferred:**
  - **Quotes list** (`app.bsky.feed.getQuotes`). Neither network shows a
    quote count today, so it needs a new count and a post-list view on both;
    it moves to sprint 3, beside quote controls.
  - **Paging** past the first 100 likers or reposters.
  - The label choice is not saved with drafts.
- **Live trial:** post in German and check `langs` on bsky.app; post a link
  and check the card; post an image with a label and check it is blurred on
  bsky.app; open the like and repost lists on a busy post.
