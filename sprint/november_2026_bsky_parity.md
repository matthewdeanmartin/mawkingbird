# Bluesky parity roadmap, November 2026

Status: sprints 1–5 code complete, awaiting live trials · 2026-11-03. Manual test plans: `test_plans/`.

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

Goal: the parts of Bluesky chat Mawkingbird does not do yet. Hand-off notes
below are for whoever picks this up; check them against the code first.

### Where chat lives today

- `providers/bluesky/bluesky-chat-api.ts`: `getConvoForMembers`,
  `listConvos`, `getMessages`, `sendMessage`, `updateRead`, and `getLog`
  (defined, **never called**). Every call goes to the account's real PDS host
  (`BlueskyPds.resolve()`, shared since sprint 1) with
  `atproto-proxy: did:web:api.bsky.chat#bsky_chat`, through `BlueskyApi.get` /
  `request`, so OAuth and app-password sessions both work. Add new calls as
  `chatGet` / `chatPost` like the existing ones.
- `pages/conversations/conversations.ts` (~1,350 lines) and `.html` (~600):
  one page for Mastodon DMs and Bluesky chats. Bluesky state is
  `bskyConvos`, `bskyMessages`, `bskyLoadError`, `bskySendError`,
  `bskyScopeError` (app password without DM access). It is not i18n-exempt:
  declare `// i18n` keys there.
- Types in `bluesky-types.ts`: `BskyConvoView` (`id`, `rev`, `members`,
  `lastMessage`, `muted`, `unreadCount`) and `BskyMessageView` (`id`, `rev`,
  `text`, `facets`, `sender`, `sentAt`). Neither models `status` (request or
  accepted) or `reactions` yet.
- Specs: `conversations.spec.ts`, `conversations-networks.spec.ts`,
  `bluesky-chat-api.spec.ts`.

### Work items

1. **Model the missing fields.** `BskyConvoView.status?: 'request' | 'accepted'`
   and `BskyMessageView.reactions?: { value: string; sender: { did: string };
   createdAt }[]`. Both are optional: older servers omit them, and a missing
   status means accepted.
2. **Message requests.** `listConvos` takes `status=request` or
   `status=accepted` (and `readState=unread`). Show requests as their own
   filter or section with a count, not mixed into chats. Actions:
   `chat.bsky.convo.acceptConvo {convoId}` (moves it to accepted; replying
   also accepts it) and leave (item 4) as "decline". Don't call `updateRead`
   on a request until it is opened.
3. **Reactions.** `chat.bsky.convo.addReaction {convoId, messageId, value}` and
   `removeReaction` with the same body. `value` is one emoji grapheme. Bluesky
   caps reactions per message per user (the server answers
   `ReactionLimitReached`; show it). Render reactions under each message as
   chips (emoji + count, pressed when yours), and offer a small picker. Reuse
   the composer's `app-emoji-picker` rather than a new one. Use design-system
   parts (Button `size="small"` or the post-action pattern) so it passes the
   inventory review.
4. **Leave and mute.** `chat.bsky.convo.leaveConvo {convoId}` removes it from
   your list (it returns if the other person writes again);
   `muteConvo` / `unmuteConvo {convoId}` silence notifications and are shown
   by `convo.muted`. Put both in a per-conversation menu (`mbMenuItem`), with
   leave confirmed through the existing confirm dialog.
5. **Delete for me.** `chat.bsky.convo.deleteMessageForSelf {convoId, messageId}`
   hides your copy only; the other side keeps it. Say so in the menu label
   ("Delete for me") and confirm it. The view then gets a
   `#deletedMessageView`; render it as "Message deleted".
6. **Who can message you.** The `chat.bsky.actor.declaration` record
   (`rkey: self`, collection `chat.bsky.actor.declaration`,
   `allowIncoming: 'all' | 'following' | 'none'`). Read with
   `com.atproto.repo.getRecord` (absent means `following`, Bluesky's default),
   write with `putRecord` on the account's own repo (not proxied). Put it on
   the Settings → Bluesky moderation page (sprint 4) as a fourth section, or in
   Settings → Privacy if that reads better; one select, saved on change.
7. **Optional: live updates.** `getLog` with a cursor returns `#logCreateMessage`,
   `#logAddReaction`, `#logAcceptConvo` etc. since the cursor. Polling it every
   ~10 s while the page is visible would replace re-listing. Only if time
   allows; correctness of 1–6 comes first.

### Pitfalls

- **Scopes.** OAuth already asks for `transition:chat.bsky`. App-password
  links need the "allow direct messages" option or every call 401s with a
  token-scope error; `isChatScopeError` and the relink hint already cover it.
- **Entryway.** Proxied chat calls 501 on `bsky.social`; always use the
  resolved PDS (already handled by `chatGet` / `chatPost`).
- **Anonymous** sessions have no chat; keep the existing gate.
- **No proxy for media.** Chat has no media upload here; don't add one through
  the Plus proxy.
- **Bundle.** The conversations page is lazy. Keep new chat code out of root
  imports; check `build:mockingbird` (initial is ~902 kB against a 900 kB
  warning budget and 1 MB error budget; don't raise budgets).

### Tests to write

- `bluesky-chat-api.spec.ts`: each new call's NSID, body, PDS host and proxy
  header; `listConvos` status filter.
- `conversations-networks.spec.ts`: requests listed apart with a count; accept
  moves a request; reactions render, toggle, and show the limit error; leave
  and delete-for-me confirm first; muted state toggles.
- Settings: the declaration select reads absent as "people I follow" and writes
  `putRecord` to the right collection and rkey.
- Then the usual gates (`make test`, inventory review, `build:mockingbird`,
  help site if a guide changes) and a manual plan at
  `test_plans/bsky-parity-sprint-6-chat.md` (two accounts: A and B).

### Acceptance

Each action round-trips with bsky.app: a request from a stranger appears under
requests and accepting it moves it; a reaction made here shows on bsky.app and
the other way round; leaving and muting match; delete-for-me hides only your
copy; the "who can message you" setting matches bsky.app's.

### Out of scope

Group chats and chat media are not in Bluesky's public chat API.

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

### Sprint 3 progress (2026-11-02): code complete, needs a live trial

- **Who can reply and quote** (`providers/bluesky/bluesky-post-controls.ts`).
  Threadgate and postgate records at the post's rkey. Every write reads first
  and keeps list rules, hidden replies and detached quotes made elsewhere; a
  gate that would only restate the defaults is deleted instead of written.
  A new dialog (`post-permissions/bluesky-post-controls-dialog.ts`) offers
  everyone, nobody, or some people (mentioned, followers, following) and
  quotes on or off. It opens from 🛡️ in the composer for a new Bluesky thread
  (Bluesky only accepts reply limits on a first post), written right after
  the post exists; a failure keeps the post and says to use the menu. On your
  own posts it opens from ••• → **Reply and quote controls…**.
- **Reading side.** `viewer.replyDisabled` disables Reply with "The author
  limits who can reply to this post"; a limited thread you can reply to says
  so in the button's label. `viewer.embeddingDisabled` takes Quote out of the
  share menu.
- **Hide replies.** In your own Bluesky thread, a reply's ••• menu offers
  **Hide this reply in my thread** (threadgate `hiddenReplies`).
- **Pinned post.** 📌 now shows on your own Bluesky posts and sets
  `pinnedPost` on the profile record (one pin; read-modify-write guarded by
  CID). The profile's first page asks for `includePins`, marks the
  `#reasonPin` item pinned and drops its later duplicate.
- **Ownership fix.** `isOwn()` compared a post's author with the signed-in app
  account, so a Mastodon or Anonymous account with a Bluesky connector never
  owned its own Bluesky posts (no delete, pin or controls). A Bluesky post is
  now owned when the linked Bluesky account wrote it.
- **Quotes.** `quotes_count` (Mastodon 4.5+, Bluesky `quoteCount`) shows as a
  count after ❝ when a post was quoted, opening a quotes dialog
  (`/api/v1/statuses/:id/quotes` or `app.bsky.feed.getQuotes`, 50 per load).
  On your own Bluesky post each quote can be **Detach**ed (postgate
  `detachedEmbeddingUris`) and reattached.
- **Tests.** `bluesky-post-controls.spec.ts` (7), `bluesky-post-controls-dialog.spec.ts`
  (3), `quotes-dialog.spec.ts` (3), status card (+5), composer (+2), adapter
  (+3). One existing assertion changed on purpose: an own Bluesky post now
  shows 📌. `make test` 9,124/9,124, 0 missing; build initial 901.75 kB
  (+0.07 kB); help site; browser suites adoption-11, account-connections and
  post-permissions 38/38 (the action-row test now waits for the Bluesky row
  before measuring; it measured mid-render once).
- **Deferred:** editing list rules (they are kept, not edited); knowing whether
  a reply is already hidden when the page loads (the menu toggles from this
  session's state); quote limits on replies; paging quotes past 50; saving
  thread limits with drafts.
- **Live trial:** limit replies to followers from the composer and check
  bsky.app; turn quotes off on an old post; pin a post and see it lead your
  profile on bsky.app; hide a reply in your thread; open the quotes of a
  quoted post and detach one.

### Sprint 4 progress (2026-11-03): code complete, needs a live trial

Test plan: `test_plans/bsky-parity-sprint-4-moderation.md`.

- **Settings → Bluesky moderation** (new page, People group, beside Muted &
  Blocked; available to Anonymous with a Bluesky connector). Built only from
  design-system parts (PageHeader, Section, Field/Control, Checkbox, Button,
  Notice, ContentState), reconciled as adopted scope. Three sections: muted
  words and tags, moderation lists, moderation services.
- **Muted words.** Read and written as `mutedWordsPref` through
  `putPreferences`; every write re-reads the whole preferences list and
  replaces only that item, so bsky.app's other settings survive. Bluesky
  leaves applying muted words to clients, so a small signal store
  (`bluesky-moderation-state.ts`, no API dependencies) feeds
  `StatusVisibility.activeFilters`: a match becomes a warn filter, collapsing
  the post behind the existing "Filtered: …" stub. It follows bsky.app's
  rules: whole word or phrase, tags-only, expiry, "not from people I follow",
  never the viewer's own posts. Changes apply to cards already on screen.
- **Moderation lists.** Subscribe by bsky.app list address or at-uri, as a mute
  list (`muteActorList`) or a block list (`listblock` record); list and
  unsubscribe (`getListMutes`, `getListBlocks`).
- **Moderation services.** Subscribe by handle (checked with
  `app.bsky.labeler.getServices`), list by name, remove (`labelersPref`).
  AppView reads now send `atproto-accept-labelers` (Bluesky's own moderation
  plus subscriptions; CORS checked on public.api.bsky.app, bsky.social and a
  PDS) and skip it on proxied chat calls, so subscribed services' labels
  arrive and sprint 2's label handling covers the media.
- **Mute thread.** Bluesky posts' ••• menus offer mute or unmute
  notifications from the thread (`muteThread` by root; state from
  `viewer.threadMuted`).
- **Loading.** The shell loads moderation once a Bluesky account is linked,
  in the background. A first version blocked the Bluesky timeline on it; that
  was dropped because muted words are reactive anyway and blocking forced
  every timeline spec to answer an extra request.
- **Tests.** `bluesky-moderation.spec.ts` (10: matcher rules, preference
  preservation, list address parsing, labeler check, thread mute, labeler
  header), `settings-bluesky-moderation.spec.ts` (5, including StatusVisibility
  collapsing a matching post), status card (+1). The settings sidebar's
  Anonymous list gained the page. `make test` 9,140/9,140, 0 missing; build
  initial 901.91 kB (+0.16 kB); help site; browser suites 38/38.
- **Deferred:** per-label visibility choices (show, warn, hide) for moderation
  services' custom labels, and the adult-content switch; Bluesky's "hidden
  posts" preference; moving Mastodon filters onto the same design-system page
  pattern.

### Sprint 5 progress (2026-11-03): code complete, needs a live trial

Test plan: `test_plans/bsky-parity-sprint-5-discovery.md`. New UI throughout:
Mastodon has no starter packs, and Mawkingbird's bundled Starter Kits stay a
separate thing with their own pages.

- **Service** (`providers/bluesky/bluesky-starter-packs.ts`). Parse a
  `bsky.app/starter-pack/<handle>/<rkey>` link; load a pack and every member
  across list pages (public reads, so no account needed); list an account's
  packs; read the signed-in account's curate lists; create a pack in one
  `applyWrites` (a new reference list, its list items, the pack record, TID
  record keys, duplicates collapsed, capped at 150); `getSuggestions` and
  `getSuggestedFollowsByActor`.
- **Pages.** `/bluesky/starter-packs` (open by link, your packs, make one
  from a list, Suggested for you) and `/bluesky/starter-packs/:actor/:rkey`
  (name, creator, description, counts, Open on bsky.app, members, **Follow
  all N** counting only people not yet followed, and "Similar to <name>" after
  a single follow). A shared `BlueskyPeopleList` gives every list the same
  rows and Follow buttons. All design-system parts; four new candidate files
  reconciled as adopted scope.
- **Profiles.** A Bluesky profile lists the starter packs it made and, after
  you follow it there, similar accounts.
- **Getting there.** One-line links on Find people (basic) and on the Starter
  Kits page. Adding a discovery way was tried and reverted: the registry also
  drives Home's invitation-card rotation, whose specs fix its makeup, and
  changing that rotation is a product call, not part of this sprint.
- **Show more / less like this.** Feeds whose generator view has
  `acceptsInteractions` mark their posts with the feed service's DID and the
  item's `feedContext` (looked up from the saved or popular feed cache when a
  caller passes only a uri). The post's ••• menu sends
  `app.bsky.feed.sendInteractions` (`requestMore` / `requestLess`) through the
  account's PDS with `atproto-proxy: <did>#bsky_fg`, then shows it as sent.
- **Help.** Starter Kits guide: a Bluesky starter packs section. Home feed
  guide: teaching a Bluesky feed.
- **Tests.** `bluesky-starter-packs.spec.ts` (4), the UI spec (10: people list,
  pack page, hub, profile discovery), `bluesky-feed-feedback.spec.ts` (2),
  status card (+1). `make test` 9,157/9,157, 0 missing; build initial
  902.21 kB (+0.30 kB); help site; browser suites 38/38.
- **Deferred:** go.bsky.app short links (they need a redirect lookup); picking
  pack members by search rather than from a list; editing or deleting a pack;
  showing a pack's feeds; opening bsky.app starter-pack links inside posts in
  Mawkingbird instead of on bsky.app.
