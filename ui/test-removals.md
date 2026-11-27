# Removed tests

A test that disappears is explained here, in the change that removes it. The test
run fails otherwise. Nobody needs to audit lists: read the reasons in the diff.

**Removing tests is fine** when they were renamed, covered code that is gone, or were
badly conceived: pinning an implementation detail, duplicating another test, testing
nothing. It is not a way to make a failing run pass. Whoever removes a test also tells
the owner, with the reason, in their report. The run prints what to say.

```
- test: src/app/example.spec.ts :: Example opens the panel
  reason: renamed
  now: src/app/example.spec.ts :: Example opens the panel at once
  why: The delay is gone, so the name says when it opens.
```

- `test`: the identity as test-manifest.json has it, copied exactly.
- `reason`: `renamed`, `replaced` (the behavior changed on purpose), `moved` (to a
  library), `dead-code` or `poor-test`.
- `now`: the test that covers it today. Required for renamed, replaced and moved; repeat
  the line for several. It must run.
- `why`: a sentence. For `replaced`, what changed and who decided.

Do not edit test-manifest.json or lib-test-manifest.json. A green local run updates
them: new tests are accepted as they are, and explained removals leave. Commit the
result. CI checks without writing. Entries stay as history, newest first.

## 2026-11-26: Posts about a link searches when the link isn't trending

- test: src/app/feeds/link-timeline/link-timeline.spec.ts :: LinkTimeline explains a link the server is not trending instead of showing an error
  reason: replaced
  now: src/app/feeds/link-timeline/link-timeline.spec.ts :: LinkTimeline explains a link nobody found and offers a search for the site
  now: src/app/feeds/link-timeline/link-timeline.spec.ts :: LinkTimeline falls back to searching for the link when it is not trending
  why: A not-trending 404 now falls back to post search (owner request, 2026-11-26); the sentence shows only when search also finds nothing.

## 2026-11-26: Video Subscriptions are YouTube only

- test: src/app/reading/videos/video-items.spec.ts :: mergeFollowedPosts adds who shared an upload, and posts about other videos as their own items
  reason: dead-code
  why: The owner made Video's Subscriptions YouTube only (2026-11-26); fediverse video posts are the Posts tab's, so the merge that folded them in was removed.

- test: src/app/reading/videos/video-items.spec.ts :: mergeFollowedPosts reads a boost as the booster sharing the boosted video
  reason: dead-code
  why: Same removal: no fediverse posts are merged into Subscriptions any more.

- test: src/app/reading/videos/video-items.spec.ts :: mergeFollowedPosts marks Shorts from the feed
  reason: renamed
  now: src/app/reading/videos/video-items.spec.ts :: feedVideos marks Shorts from the feed
  why: It tests feedVideos, not the merge; it moved to a describe named for what it tests.

## 2026-11-26: Inbox views

- test: src/app/feeds/notifications/notifications.spec.ts :: Notifications collapses every like and boost into one row, with +N since the inbox was last read
  reason: replaced
  now: src/app/feeds/notifications/notifications.spec.ts :: Notifications shows likes and boosts in Stats post by post, with faces and +N since last read
  why: The owner split the Inbox into Conversations | Stats | Who | Stream (2026-11-26); likes and boosts are their own always-open Stats view with faces instead of one collapsed row.

## 2026-11-26: legacy starter kits and /follow/ retired

- test: src/app/discovery/starter-collection.spec.ts :: STARTER_COLLECTION ships ten themed kits whose account ids came from their home instances
  reason: replaced
  now: src/app/discovery/starter-collection.spec.ts :: STARTER_COLLECTION ships the Universal kit as the only one outside the catalogue
  why: The owner retired the ten hand-picked legacy kits (2026-11-26); the catalogue from mawkingbird_starters replaces them.

- test: src/app/public-pages/features/follow-kits.spec.ts :: public starter-kit pages describes a kit as an ordered list of only the people its page shows
  reason: dead-code
  why: The public /follow/ starter-kit pages were retired with the legacy kits (owner, 2026-11-26); their addresses now redirect.

- test: src/app/public-pages/features/follow-kits.spec.ts :: public starter-kit pages keeps search descriptions within the snippet length
  reason: dead-code
  why: The public /follow/ starter-kit pages were retired with the legacy kits (owner, 2026-11-26); their addresses now redirect.

- test: src/app/public-pages/features/follow-kits.spec.ts :: public starter-kit pages leaves out an account that has not consented to search listing: { discoverable: false }
  reason: dead-code
  why: The public /follow/ starter-kit pages were retired with the legacy kits (owner, 2026-11-26); their addresses now redirect.

- test: src/app/public-pages/features/follow-kits.spec.ts :: public starter-kit pages leaves out an account that has not consented to search listing: { discoverable: null }
  reason: dead-code
  why: The public /follow/ starter-kit pages were retired with the legacy kits (owner, 2026-11-26); their addresses now redirect.

- test: src/app/public-pages/features/follow-kits.spec.ts :: public starter-kit pages leaves out an account that has not consented to search listing: { discoverable: undefined }
  reason: dead-code
  why: The public /follow/ starter-kit pages were retired with the legacy kits (owner, 2026-11-26); their addresses now redirect.

- test: src/app/public-pages/features/follow-kits.spec.ts :: public starter-kit pages leaves out an account that has not consented to search listing: { indexable: false }
  reason: dead-code
  why: The public /follow/ starter-kit pages were retired with the legacy kits (owner, 2026-11-26); their addresses now redirect.

- test: src/app/public-pages/features/follow-kits.spec.ts :: public starter-kit pages leaves out an account that has not consented to search listing: { noindex: true }
  reason: dead-code
  why: The public /follow/ starter-kit pages were retired with the legacy kits (owner, 2026-11-26); their addresses now redirect.

- test: src/app/public-pages/features/follow-kits.spec.ts :: public starter-kit pages lists an account that is discoverable and has not opted out of indexing
  reason: dead-code
  why: The public /follow/ starter-kit pages were retired with the legacy kits (owner, 2026-11-26); their addresses now redirect.

- test: src/app/public-pages/features/follow-kits.spec.ts :: public starter-kit pages omits opted-out people from a published kit
  reason: dead-code
  why: The public /follow/ starter-kit pages were retired with the legacy kits (owner, 2026-11-26); their addresses now redirect.

- test: src/app/public-pages/features/follow-kits.spec.ts :: public starter-kit pages publishes every bundled kit today, each with only consenting people
  reason: dead-code
  why: The public /follow/ starter-kit pages were retired with the legacy kits (owner, 2026-11-26); their addresses now redirect.

- test: src/app/public-pages/features/follow-kits.spec.ts :: public starter-kit pages publishes no page for a kit that consent filtering leaves too small
  reason: dead-code
  why: The public /follow/ starter-kit pages were retired with the legacy kits (owner, 2026-11-26); their addresses now redirect.

- test: src/app/public-pages/features/follow-kits.spec.ts :: public starter-kit pages turns profile HTML into a short plain-text bio
  reason: dead-code
  why: The public /follow/ starter-kit pages were retired with the legacy kits (owner, 2026-11-26); their addresses now redirect.

## 2026-11-26: Even more and a locked … menu

- test: src/app/shell/shell.spec.ts :: Shell account switching opens onboarding from the More menu and closes the menu
  reason: replaced
  now: src/app/shell/shell.spec.ts :: Shell account switching opens Even more from the … menu, closing the menu, and onboarding from there
  why: The owner moved Onboarding, Screen share and Observability out of the … menu into the Even more dialog (spec/sprint/explore-2026-11.md, Sprint 5); the test follows Onboarding there.

## 2026-11-25: podcast pages speak German

- test: src/app/public-pages/podcasts/podcast-pages.spec.ts :: Podcast pages routes the hub and every kit, each indexable
  reason: renamed
  now: src/app/public-pages/podcasts/podcast-pages.spec.ts :: Podcast pages routes every hub and topic, each indexable in its language
  why: There are two hubs now, and the test also checks each route's language and alternates.

- test: src/app/public-pages/podcasts/podcast-pages.spec.ts :: Podcast pages lists every kit on the hub, and every show on its kit, with room for search results
  reason: renamed
  now: src/app/public-pages/podcasts/podcast-pages.spec.ts :: Podcast pages lists every topic on its hub, and every show on its topic, with room for search results
  why: Same checks, run for each language instead of English alone.

- test: src/app/public-pages/podcasts/podcast-pages.spec.ts :: Podcast pages links every topic from the hub
  reason: renamed
  now: src/app/public-pages/podcasts/podcast-pages.spec.ts :: Podcast pages links every topic from the hub, and the YouTubers in its language
  why: The hub's footer link now depends on the language, so the test covers it too.

## Accepted before this check existed (2026-11-25)

Traced by hand when the manifest was refreshed: 23 tests removed by changes from
2026-11-21 to 2026-11-24. Listed in prose, because the manifest no longer has them.

- Renamed or rewritten with the behavior (8): the Watch queue entry, Watch's channel and
  creator links, share destinations, the repost and quote events of StatusCard, where a
  thread puts a new reply, the photo viewer's load-more arrow, and the diagnostics Back link.
- Chinese locales (7): `zh`, `zh-CN` and kin now select Simplified; `zh-Latn-TW` and
  nonsense fall back to English. The old tests said only "not Traditional".
- Profile archive paging (3): removed with the feature when Native profiles became live.
- Reply-guy thread walking (2): replaced by the owner's definition of 2026-11-21.
- Listen and Watch refusing another server's post (2): they open it now. Links with
  credentials, and non-https servers, are still refused.
- Search's media-only query (1): Mastodon refuses it, so Home is scanned instead.

## 2026-11-25: Mastodon content-warning guide

- test: src/app/moderation/mastodon-content-warnings/mastodon-content-warnings.spec.ts :: MastodonContentWarnings signed in, shows the switches instead of the pitch
  reason: replaced
  now: src/app/moderation/mastodon-content-warnings/mastodon-content-warnings.spec.ts :: MastodonContentWarnings signed in, keeps the Mastodon guide before the optional client switches
  why: The owner requested that sign-in keep the Mastodon website instructions first, with Mawkingbird controls explicitly optional below them.

- test: src/app/accounts/sign-in/login-bluesky/login-bluesky.spec.ts :: LoginBluesky sends an already signed-in visitor to Home
  reason: replaced
  now: src/app/accounts/sign-in/login-bluesky/login-bluesky.spec.ts :: LoginBluesky sends an already signed-in Bluesky visitor to Home
  why: Only a Bluesky identity satisfies an explicit Bluesky sign-in request. Mastodon and Anonymous visitors now get the form, with separate regression tests preserving their current identity until they choose to sign in.

## 2026-11-26: Native picture uploads

- test: src/app/platform/http/native-public-http.spec.ts :: says plainly that file uploads are not supported, and sends nothing
  reason: replaced
  now: src/app/platform/http/native-public-http.spec.ts :: explains unsupported video uploads and sends nothing
  why: Picture uploads are now supported. The refusal check remains for unsupported video; a new test verifies picture bytes and alt text use the dedicated authenticated command.

## 2026-11-26: reconcile previously committed Watch mode coverage

- test: src/app/platform/build/app-mode.spec.ts :: modeForUrl /watch keeps the current mode
  reason: replaced
  now: src/app/platform/build/app-mode.spec.ts :: modeForUrl puts Watch in Video, wherever it was opened from
  why: Commit 9a272b53f4 intentionally made Watch enter Video mode. The replacement tests both the plain and query-bearing URL; this records the prior change without deleting coverage.

- test: src/app/platform/build/app-mode.spec.ts :: modeForUrl /watch?youtube=abc keeps the current mode
  reason: replaced
  now: src/app/platform/build/app-mode.spec.ts :: modeForUrl puts Watch in Video, wherever it was opened from
  why: Same already-committed behavior change: the replacement explicitly asserts /watch?youtube=abc selects Video mode.
