# Functional parity with the Mastodon web UI

Audit date: 2026-11-10.

This report lists what Mastodon's own web interface lets a signed-in person do that mawkingbird cannot. It is a one-way backlog, like [phanpy_parity.md](phanpy_parity.md). It does not compare appearance, and it does not list mawkingbird-only features.

The findings are in three parts:

1. **[Part 1: API-supportable gaps](#part-1--api-supportable-gaps).** Mastodon exposes a REST endpoint for the feature, so mawkingbird can build it.
2. **[Part 2: Notification features](#part-2--notification-features-out-of-scope-by-owner-preference).** These are out of scope because the owner wants mawkingbird to be quieter than most apps. They are listed only so they are not rediscovered as gaps later.
3. **[Part 3: Features with no API](#part-3--not-supportable-no-api-browser-automation-only).** These exist only as server-rendered Rails pages or admin screens. A third-party client could reach them only by automating a browser session, or by linking out to the server.

## Scope and evidence

- **Mastodon:** `REFERENCE/mastodon`, commit `cc76f85b9afc02b1265e68e6ee6c24ab266771b4` (2026-11-10), version 5.0.0-beta.1. "The UI" means both the React web client (`app/javascript/mastodon`) and the server-rendered settings, account and admin pages (`app/views`). Mastodon users experience both as one product.
- **Mawkingbird:** the maintained Angular client in `mawkingbird/ui`, commit `cb3eec9b9b07815336014438fff82af487aff935` (2026-11-10).
- **Method:** this is a source audit. I compared Mastodon's web routes, React features, Rails settings views and `config/routes/api.rb` with mawkingbird's routes, its `Api`/`AdminApi` request code and its settings pages. I counted only real application code. Generated API documentation (`observability/api-docs.generated.ts`), specs and `_mock` endpoints are not evidence of a feature. Neither application was exercised against a live account.
- **"Missing"** means I found no corresponding user workflow. **"Partial"** means related functionality exists but the specific operation does not.
- **Already covered elsewhere:** Phanpy-parity items that are also Mastodon web features are not repeated here, for example multi-column feeds (Phanpy #2) and Phanpy's notification items. Familiar followers, account notes, featuring accounts, profile-image descriptions, list reply policy, report rules and forwarding, collections, and annual reports were completed in that pass.
- **Already at parity:** source review found working equivalents for these Mastodon web features, so they are not backlog items: home, local and federated timelines; lists, including exclusivity; hashtag follow/feature and multi-tag `any`; bookmarks and favourites; Explore trends for posts, tags and links; the profile directory; search; profiles with replies and media tabs; endorsed accounts; hover cards; follow requests; blocks, mutes (with duration) and domain blocks; filters v2 with keywords; edit history; translation; delete & redraft; pinning; muting a conversation; quote posts and quote approval policy; boosters/favouriters/quotes lists; announcements with reactions; conversations; scheduled posts; reports; keyboard shortcuts; server rules and terms of service; onboarding; and the admin screens for accounts, reports, domain blocks/allows, email/IP/canonical blocks, trends and metrics.

Source links are relative to this report. Mastodon links require the sibling reference checkout.

## Owner exclusions applied

- **Notifications:** mawkingbird is deliberately quieter than other apps. Notification features are listed in Part 2 and marked out of scope. They are not backlog items. Do not re-propose them.
- **No exit tools:** do not build tools for quitting, deleting accounts, moving servers or mass-unfollowing. This rule (2026-10-30) also covers account aliases, account migration, account deletion and bulk unfollow. Part 3 notes these where they would otherwise appear, so they are not mistaken for oversights.

## Summary

There are **17 API-supportable backlog items**. Item 17 is a correctness issue in existing code, not a parity gap. These suggested delivery bands are planning recommendations, not effort estimates:

| Band | Items |
| --- | --- |
| A: small, self-contained API additions | 2, 3, 4, 9, 11, 13, 14, 15 |
| B: composer and post-editing work | 6, 7 |
| C: reading and discovery | 1, 5, 8, 10, 12 |
| D: admin completion and the admin announcements fix | 16, 17 |

**••• menu budget (2026-11-11):** post and profile ••• menus may show at most 10 options (`ui/src/app/menu-budget.ts`). `menu-budget.spec.ts` files render the busiest realistic menus, print a size table in `make test` (or `npm run menu:sizes`), and fail the build when one goes over. Less-used entries live in a "More tools…" (posts) or "More options…" (profiles) dialog. New items here must fit that budget.

---

# Part 1: API-supportable gaps

## Reading and discovery

### 1. Posts about a link (link timeline): done 2026-11-10

**Mastodon:** Explore → News stories, and link-preview cards, open `/links/:url`. That page is a timeline of posts sharing the link, built from `GET /api/v1/timelines/link?url=` (4.3+, trending links only).

**Mawkingbird:** Explore lists trending links, but nothing opens the posts that discuss a link. The endpoint appears only in generated API documentation.

**Completion criterion:** From a trending link, and from a link card where the server supports it, open a paged timeline of the posts sharing that URL. Show a clear empty or unsupported state for links the server is not tracking.

**Implemented:** `/link?url=…` (`LinkTimeline`, `Api.linkTimeline`) pages the posts sharing a link. On your own server's News feed, each story has a "Posts about this →" text link (not offered for other servers' News). A 404 is explained as "not trending on your server" or, when the server lacks the endpoint, "needs Mastodon 4.3"; only http(s) links are requested. Not done: the same entry from link cards inside posts.

Sources: [Mastodon link timeline](../../REFERENCE/mastodon/app/javascript/mastodon/features/link_timeline), [explore story](../../REFERENCE/mastodon/app/javascript/mastodon/features/explore/components/story.jsx), [`expandLinkTimeline`](../../REFERENCE/mastodon/app/javascript/mastodon/actions/timelines.js); [mawkingbird Explore](../ui/src/app/pages/explore/explore.ts), [API](../ui/src/app/api.ts).

### 2. Federated timeline: "remote only" and "media only": changed by owner, done 2026-11-10 as a Home filter

**Mastodon:** The live feeds page (`/public`, `/public/local`, `/public/remote`) includes a remote-only feed (`remote=true`) and an "only media" toggle (`only_media=true`). It also respects the server's local and remote live-feed access settings.

**Mawkingbird:** `Api.publicTimeline(local, maxId)` supports only local versus federated. It cannot request remote-only or media-only results.

**Completion criterion:** Offer remote-only and media-only views of the public timeline, and keep them working with pagination and streaming. When the server restricts live-feed access, show its refusal plainly.

**Owner decision (2026-11-10):** do this as a local/remote choice on the **Home** feed instead. Note that Mastodon itself has no Home equivalent: its local/remote choice is server-side (`local=true` / `remote=true`) and only on the Live feeds page. The Home filter is a mawkingbird idea; the Live-feeds version remains possible later.

**Implemented:** Home's filter row has a compact 🌐 select (All servers / This server / Other servers) beside 📅, for signed-in Mastodon only. It filters loaded Home posts on the client (Mastodon's home timeline has no such parameter), judging a boost by the boosted post's author; other networks never count as "this server". It is session state, reset per account, and the end-of-feed "show hidden" offers include it. **Also done 2026-11-11:** the server-side version Mastodon itself has. On your own server's Fediverse feed, an MbToolbar offers "🌍 Other servers only" (`remote=true`) and "🖼 Media only" (`only_media=true`); the Local feed gets Media only. Some servers (mastodon.social among them) now restrict the federated timeline, which the feed already reports as a notice.

Sources: [Mastodon firehose](../../REFERENCE/mastodon/app/javascript/mastodon/features/firehose/index.jsx); [mawkingbird `Api.publicTimeline`](../ui/src/app/api.ts), [public timeline page](../ui/src/app/pages/public-timeline).

### 3. Hashtag timeline: "all of", "none of" and local only: done 2026-11-10

**Mastodon:** Hashtag column settings combine extra tags as **any** (`any[]`), **all** (`all[]`) or **none** (`none[]`), and can limit the timeline to the local server (`local=true`).

**Mawkingbird:** `Api.tagTimeline` sends `any[]` and `only_media`. It cannot require all tags, exclude tags, or restrict to the local server. Tag bundles and the client-side feed tools may approximate this, but they do not use the server's filters.

**Completion criterion:** On a hashtag page, add required and excluded tags and toggle local-only, with paging that respects those server-side filters. The settings should persist with the page or saved feed.

**Implemented:** the hashtag Feed tab has a folded "Refine" disclosure (MbDisclosure) with compact fields for any / all / none tags (up to four each, `#` and the page's own tag dropped) and a "Only posts from this server" checkbox. Apply writes `?any=&all=&none=&local=1` into the URL, so a refined view can be shared; the label shows how many refinements are on. Signed-in Mastodon only; the Media tab and Bluesky/anonymous paths are not refined.

Sources: [Mastodon hashtag column settings](../../REFERENCE/mastodon/app/javascript/mastodon/features/hashtag_timeline/components/column_settings.jsx); [mawkingbird `Api.tagTimeline`](../ui/src/app/api.ts), [tag page](../ui/src/app/pages/tag).

### 4. Another account's featured hashtags and the "tagged" filter: done 2026-11-10

**Mastodon:** A profile's Featured tab shows that account's featured hashtags, from `GET /api/v1/accounts/:id/featured_tags`. Each one opens `/@acct/tagged/:tag`, which is that person's posts with that tag (`GET /accounts/:id/statuses?tagged=`).

**Mawkingbird:** It manages the viewer's *own* featured tags (`Api.featuredTags`, `featureTag`/`unfeatureTag`) and shows endorsed accounts on profiles. It does not read another account's featured hashtags or filter a profile by tag. Profile search is client-side text matching, not this.

**Completion criterion:** Show a profile's featured hashtags, with post counts where they are supplied, and open a profile timeline filtered to one tag, with paging.

**Implemented:** Mastodon profiles show "Featured hashtags:" as a line of text links under the header (`Api.accountFeaturedTags`; the post count is in the tooltip). Each sets `?tagged=`, which reloads the Posts tab from the server with `tagged=` (also on anonymous public profiles), hides pinned posts, and shows "Showing only posts tagged #x. Show all posts". The four-button filter row is unchanged.

Sources: [Mastodon account featured](../../REFERENCE/mastodon/app/javascript/mastodon/features/account_featured), [routes](../../REFERENCE/mastodon/app/javascript/mastodon/features/ui/index.jsx); [mawkingbird profile](../ui/src/app/pages/profile/profile.ts), [API](../ui/src/app/api.ts).

### 5. Keep playing video and audio while scrolling (picture-in-picture): declined 2026-11-11

**Declined by the owner:** video deserves full attention in the `/watch` experience, not a corner window. Do not implement or re-propose.

**Mastodon:** When a playing video or audio attachment scrolls out of view, it moves into a docked mini-player. The player has the post's actions, and its original slot shows a placeholder.

**Mawkingbird:** Inline media stops being visible once it scrolls away. No mini-player or `requestPictureInPicture` use was found. Radio and Watch are separate destinations, not this feature.

**Completion criterion:** Media that is playing keeps playing in a persistent player while the reader moves around the timeline or to other routes. The player can return to the post or close. Per the no-media-proxy rule, media bytes must never go through the Mawkingbird Plus proxy.

Sources: [Mastodon picture-in-picture](../../REFERENCE/mastodon/app/javascript/mastodon/features/picture_in_picture), [placeholder](../../REFERENCE/mastodon/app/javascript/mastodon/components/status/picture_in_picture_placeholder.tsx); [mawkingbird status card](../ui/src/app/status-card/status-card.ts).

## Composing and editing

### 6. Full post editing: done 2026-11-11

**Mastodon:** Editing reopens the whole composer, using `GET /statuses/:id/source` and `PUT /statuses/:id`. The author can change the text, content warning, sensitive flag and language; add, remove or reorder media; change media descriptions and focal points (`media_attributes[]`); and change the poll. Changing the poll resets its votes, and the UI warns about this.

**Mawkingbird:** The status-card inline editor sends only the new text, plus the existing media IDs so attachments are not lost (`Api.editStatus`). There is no way to change the content warning, sensitive flag, language, poll or media set, and existing attachments' descriptions cannot be edited.

**Completion criterion:** Edit every field Mastodon accepts, starting from the source text. Show the vote-reset warning before changing a poll. Media descriptions should change through `media_attributes` without re-uploading. Bluesky editing stays as it is.

**Implemented:** Edit on your own Mastodon post opens `StatusEditDialog` (MbDialog): content warning, text, language, attachments (add with upload-and-wait-for-processing, remove, edit descriptions sent as `media_attributes`), "Mark media as sensitive", and the poll (edit, add or remove choices up to 4, multiple choice, add or remove the poll; attachments and a poll are mutually exclusive). Saves through `Api.updateStatus`. Warnings: changing choices clears votes; keeping a closed poll reopens it for 5 minutes. **This also fixes a data-loss bug:** the old inline editor never re-sent the poll, and Mastodon deletes a poll that an edit leaves out (`UpdateStatusService#update_poll!`). An open poll is now re-sent with its remaining time. Bluesky keeps its inline replace. Not done: focal points (item 7).

Sources: [Mastodon compose actions (`media_attributes`)](../../REFERENCE/mastodon/app/javascript/mastodon/actions/compose.js); [mawkingbird `saveEdit`](../ui/src/app/status-card/status-card.ts), [`Api.editStatus`](../ui/src/app/api.ts).

### 7. Media focal point: done 2026-11-11

**Mastodon:** The media description dialog includes a focal-point picker. The chosen point is saved with `focus=x,y` on `PUT /api/v1/media/:id`, or through `media_attributes` when editing, and timelines crop thumbnails around it.

**Mawkingbird:** `Api.updateMedia` sends only `description`. There is no focal-point picker. Received posts may not crop around another author's focal point either; check this while doing the item.

**Completion criterion:** Set and change a focal point before posting and while editing. Crop timeline thumbnails around `meta.focus` when it is present.


**Implemented:** a shared `FocalPointDialog` (click the uncropped picture or use arrow keys; wide and square crop previews) behind a 🎯 button per Mastodon image in the composer and the edit dialog. The composer sends `focus` with the description before posting (`Api.updateMedia`); edits send it in `media_attributes` only when it moved. Post thumbnails, the composer's own previews, the edit dialog and the profile media grid crop around `meta.focus` with `object-position`.

Sources: [Mastodon alt-text modal](../../REFERENCE/mastodon/app/javascript/mastodon/features/alt_text_modal/index.tsx); [mawkingbird `Api.updateMedia`](../ui/src/app/api.ts), [composer](../ui/src/app/compose/compose.ts).

### 8. Refresh poll results: done 2026-11-11

**Mastodon:** An open poll has a Refresh link, which calls `GET /api/v1/polls/:id`.

**Mawkingbird:** Polls can be viewed and voted on, but results update only when the whole post is reloaded.

**Completion criterion:** Refresh the vote counts of a single poll in place, and show when it expires.

**Implemented:** open Mastodon polls show a link-style "Refresh" in the poll footer (`Api.getPoll`), updating the counts in place. It is hidden on closed polls and other networks.

Sources: [Mastodon poll](../../REFERENCE/mastodon/app/javascript/mastodon/components/poll.tsx); [mawkingbird status card template](../ui/src/app/status-card/status-card.html), [poll results](../ui/src/app/poll-results/poll-results.ts).

## Accounts, relationships and safety

### 9. Choose which languages to see from a followed account: done 2026-11-11

**Mastodon:** The account menu has "Change subscribed languages". It re-follows with `languages[]`, so the home timeline includes only that person's posts in those languages. The current choice comes from the relationship's `languages`.

**Mawkingbird:** `Api.follow` sends only `reblogs`. Feed language pickers filter on the client and apply to whole feeds, not to one followed account on the server.

**Completion criterion:** On a followed profile, choose a set of post languages (or all languages), save it on the server, and show it from the relationship.


**Implemented:** profile ••• → More options… → For this account → "Languages you see from them…" opens `FollowLanguagesDialog`: a checkbox per language (the reader's known languages plus any already chosen). Saving re-follows with `languages[]`, keeping the current boosts setting; ticking none sends `null` (every language).

Sources: [Mastodon subscribed-languages modal](../../REFERENCE/mastodon/app/javascript/mastodon/features/subscribed_languages_modal/index.jsx); [mawkingbird `Api.follow`](../ui/src/app/api.ts), [profile](../ui/src/app/pages/profile/profile.ts).

### 10. Server follow suggestions, with dismiss: done 2026-11-11

**Mastodon:** Onboarding and Explore → "For you" show `GET /api/v2/suggestions` with their source (for example "Popular on this server" or "Similar to profiles you recently followed"). A suggestion can be dismissed permanently with `DELETE /api/v1/suggestions/:id`.

**Mawkingbird:** It has a lot of discovery: directory, starter kits, offsite directories and find-friends. None of it uses the server's own suggestions, and no dismiss call was found.

**Completion criterion:** Show the server's suggestions and their reasons, let the person follow or dismiss each one, and keep dismissed suggestions away. Under the client-first positioning, place this as a secondary discovery route.


**Implemented:** Find friends → Basic shows "Suggested by your server" for signed-in Mastodon users, below the curated ways. Rows reuse the search account card (follow/unfollow) with the server's reason in Mastodon's wording (popular on the server, similar to people you recently followed, and so on); "Not interested" calls `DELETE /api/v1/suggestions/:id`.

Sources: [Mastodon suggestions API](../../REFERENCE/mastodon/app/javascript/mastodon/api/suggestions.ts), [onboarding](../../REFERENCE/mastodon/app/javascript/mastodon/features/onboarding); [mawkingbird directory](../ui/src/app/pages/directory), [find friends](../ui/src/app/pages/find-friends).

### 11. Block a domain from an account or post, with an impact preview: done 2026-11-11 (accounts only)

**Mastodon:** The account menu has "Block domain *x*". Its confirmation fetches `GET /api/v1/domain_blocks/preview?domain=` and tells the person how many of their followers and follows they will lose.

**Mawkingbird:** `Api.blockDomain` exists, but you can reach it only by typing the domain in Settings → blocks. There is no menu entry on accounts or posts, and no preview.

**Completion criterion:** From a remote account (and optionally a remote post), block its domain after a confirmation that shows the server's follower and follow counts. If the preview endpoint is missing on an older server, fall back to a plain confirmation.

**Implemented:** profile ••• → More options… → Safety → "Block everyone on <domain>" for remote Mastodon accounts. The confirmation states the server's preview counts (`Api.domainBlockPreview`, Mastodon 4.4+), "you will lose N people you follow and M followers there"; older servers get a plain warning without numbers. The block uses the existing `Api.blockDomain`, and the dialog confirms with an undo pointer to Settings → Blocks. **Never offered from posts (owner, 2026-11-11):** nobody should defederate a whole server over one post, and the app should not invite a decision that gives people a worse experience.

Sources: [Mastodon domain-block modal](../../REFERENCE/mastodon/app/javascript/mastodon/features/ui/components/domain_block_modal.tsx), [preview controller](../../REFERENCE/mastodon/app/controllers/api/v1/domain_blocks/previews_controller.rb); [mawkingbird `Api.blockDomain`](../ui/src/app/api.ts), [account list settings](../ui/src/app/pages/settings/account-list/settings-account-list.ts).

### 12. Filter one specific post: done 2026-11-11

**Mastodon:** The post menu has "Filter this post". It adds that post to a new or existing filter (`POST /api/v2/filters/:id/statuses`), and the filter's page lists the filtered posts so they can be removed (`GET /api/v2/filters/:id/statuses`, `DELETE /api/v2/filters/statuses/:id`).

**Mawkingbird:** Filters v2 and their keywords are fully implemented. The status-based half of filters is not used.

**Completion criterion:** Add a post to a filter from the post menu, list a filter's posts in its editor, and remove them. The filter's context and action (warn, hide, blur) apply to that post the same way they apply to keyword matches.

**Implemented:** "Filter this post…" in the ••• menu of other people's Mastodon posts opens `FilterPostDialog`: pick an existing v2 filter or name a new one (hide action; Home, public, threads, profiles), then `POST /api/v2/filters/:id/statuses`. The card applies the result straight away. Settings → Filters → a filter now lists its "Filtered posts" with View post and Remove (`DELETE /api/v2/filters/statuses/:id`).

Sources: [Mastodon filter modal](../../REFERENCE/mastodon/app/javascript/mastodon/features/ui/components/filter_modal.jsx), [filter actions](../../REFERENCE/mastodon/app/javascript/mastodon/actions/filters.js); [mawkingbird filter settings](../ui/src/app/pages/settings), [API](../ui/src/app/api.ts).

### 13. Remove or mark unread a private conversation: done 2026-11-11

**Mastodon:** The conversations column can remove a conversation (`DELETE /api/v1/conversations/:id`) and mark one as unread (`POST /api/v1/conversations/:id/unread`).

**Mawkingbird:** It lists conversations and marks them read (`Api.markConversationRead`), and that is all.

**Completion criterion:** Remove a conversation from the list (the posts are not deleted, and the UI should say so) and mark one unread. Both should survive a reload.

**Implemented:** the open Mastodon private chat's ••• menu has "Mark as unread" (`POST /conversations/:id/unread`, then the chat closes so reading it does not mark it read again) and "Remove from this list" (`DELETE /conversations/:id`, after a confirmation that says the messages are not deleted). Both cover every server conversation merged into the chat.

Sources: [Mastodon conversation actions](../../REFERENCE/mastodon/app/javascript/mastodon/actions/conversations.js); [mawkingbird conversations](../ui/src/app/pages/conversations/conversations.ts).

## Settings that the API can write

### 14. Account and privacy settings missing from the editors: done 2026-11-11

`PATCH /api/v1/accounts/update_credentials` and, on 4.6+, `PATCH /api/v1/profile` accept these settings. Mawkingbird's privacy and profile settings currently send only `bot`, `discoverable`, `locked`, display name, bio, fields, images and their descriptions, and `source[privacy|sensitive|language]`.

| Setting | API field | Mastodon web location |
| --- | --- | --- |
| Hide follows and followers lists | `hide_collections` | Privacy and reach |
| Allow public posts in search results | `indexable` | Privacy and reach |
| Default quote policy for new posts | `source[quote_policy]` | Posting defaults |
| Open the content-warning field by default | `source[spoiler_field]` | Posting defaults |
| Author attribution domains (who may credit you on link previews) | `attribution_domains[]` | Profile → Verification |
| Show Media, Media replies and Featured profile tabs (4.6) | `show_media`, `show_media_replies`, `show_featured` | Profile editor |

**Completion criterion:** Read each value from `verify_credentials` (or the profile endpoint) and save it without resetting the others. Hide fields the server does not return. Where the composer has its own per-post quote policy, the server default should be the starting value.


**Implemented:** Default visibility and the default quote policy are no longer a single public/unlisted/private dropdown. Settings → Privacy and Settings → Writing show a sentence ("New posts: everyone can read them, kept out of public timelines, followers can quote them.") and "Change…", which opens the post permissions dialog in a defaults mode (no "mentioned people only", no per-post notifications) and saves `source[privacy]` and `source[quote_policy]` together. Settings → Privacy adds checkboxes for `hide_collections`, `indexable` and `source[spoiler_field]`, each shown only when the server reports it. Settings → Profile adds the 4.6 profile-tab switches and author attribution domains via `PATCH /api/v1/profile`.

Sources: [Mastodon credentials controller](../../REFERENCE/mastodon/app/controllers/api/v1/accounts/credentials_controller.rb), [profiles controller](../../REFERENCE/mastodon/app/controllers/api/v1/profiles_controller.rb), [privacy view](../../REFERENCE/mastodon/app/views/settings/privacy/show.html.haml), [posting defaults view](../../REFERENCE/mastodon/app/views/settings/preferences/posting_defaults/show.html.haml); [mawkingbird privacy settings](../ui/src/app/pages/settings/privacy/settings-privacy.ts), [profile settings](../ui/src/app/pages/settings/profile/settings-profile.ts).

### 15. Server privacy policy and moderated servers: done 2026-11-11

**Mastodon:** The About page shows the server's privacy policy (`GET /api/v1/instance/privacy_policy`, also at `/privacy-policy`) and its list of moderated servers with severity and reason (`GET /api/v1/instance/domain_blocks`, when the admin makes it public).

**Mawkingbird:** It shows the server description, rules, terms of service and extended description, but not these two.

**Completion criterion:** Show the privacy policy (with its last-updated date) and the moderated-servers list next to the existing server information. Handle a private list (403) or a missing endpoint with a plain message.

**Implemented:** on the This server page (`/server`, `ServerAnnouncements`), two folded sections load on first open: Privacy policy (HTML with its last-updated date) and Moderated servers (domain, Limited/Suspended, reason). A 401/403 says the list is kept private; a 404 says the server does not share one.

Sources: [Mastodon about](../../REFERENCE/mastodon/app/javascript/mastodon/features/about), [privacy policy](../../REFERENCE/mastodon/app/javascript/mastodon/features/privacy_policy); [mawkingbird server page](../ui/src/app/pages/about), [API](../ui/src/app/api.ts).

## Administration

### 16. Admin features the API supports but mawkingbird lacks: done 2026-11-11

The admin area covers the core moderation API. These operations are also supported by the API but not implemented:

| Sub-item | Endpoint | Gap |
| --- | --- | --- |
| 16a. Change a report's category or rules | `PUT /api/v1/admin/reports/:id` | No editor. Reports can be assigned to self, resolved and reopened only. |
| 16b. Unassign a report | `POST /api/v1/admin/reports/:id/unassign` | Missing. |
| 16c. Review trending links and publishers | `GET /api/v1/admin/trends/links`, `.../links/publishers`, approve/reject | Only tags and statuses are reviewed. |
| 16d. Hashtag review (usable, trendable, listable) | `GET/PUT /api/v1/admin/tags/:id` | Missing. |
| 16e. Dashboard dimensions and retention | `POST /api/v1/admin/dimensions`, `/retention` | Metrics use `measures` only. |
| 16f. Delete a suspended account's data | `DELETE /api/v1/admin/accounts/:id` | Missing. Mastodon allows this only for already-suspended accounts. It is a moderator action, not a self-exit tool, but it is irreversible, so it needs a typed confirmation. |

**Completion criterion:** Each sub-item works for a role with the matching permission and shows the server's 403 otherwise.


**Implemented:** 16a: open reports have a compact category select (`PUT /admin/reports/:id`; a violation keeps its existing rules). 16b: assigned open reports offer Unassign. 16c: Admin → Trends adds Links and Publishers with approve/reject. **Correction:** 16f was already implemented (`AdminApi.deleteAccount`, used on the accounts page); this audit missed it. 16d (done 2026-11-11): Admin → Hashtags lists the server's tags with instant usable / trendable / listable switches (`GET/PUT /api/v1/admin/tags`), flags ones needing review, and reverts a refused switch. 16e (done 2026-11-11): Admin → Metrics adds breakdowns (languages, sign-up sources, servers, software, storage; `POST /admin/dimensions`) and a daily retention table (`POST /admin/retention`); either hides itself if the role or server refuses it.

Sources: [Mastodon API routes](../../REFERENCE/mastodon/config/routes/api.rb); [mawkingbird admin API](../ui/src/app/admin/admin-api.ts), [admin shell](../ui/src/app/admin/admin-shell/admin-shell.html).

### 17. Admin announcements call an endpoint Mastodon does not have: fixed 2026-11-11

**Finding:** `AdminApi.announcements`, `createAnnouncement`, `deleteAnnouncement`, `publishAnnouncement` and `unpublishAnnouncement` call `/api/v1/admin/announcements*`, and the admin shell routes to that page. Mastodon has no such REST API. Announcements are managed only through the server-rendered `/admin/announcements` pages ([admin routes](../../REFERENCE/mastodon/config/routes/admin.rb)). The page therefore works against the mock server only and will fail against a real server.

**Completion criterion:** Either gate the page to the mock or developer build, or replace it with a link to the server's `/admin/announcements` page. Reading and reacting to announcements (`/api/v1/announcements`) is real and is unaffected.


**Implemented:** against the local mock the page works as before; against a real server it calls nothing and shows a note linking to the server's own `/admin/announcements` page.

Sources: [mawkingbird admin API](../ui/src/app/admin/admin-api.ts), [routes](../ui/src/app/app.routes.ts).

---

# Part 2: Notification features (out of scope by owner preference)

These are recorded for completeness. **Do not implement or re-propose them.** Mawkingbird already has the notifications timeline, grouping and streaming. These items go beyond that.

| Mastodon feature | API | Notes |
| --- | --- | --- |
| Browser push notifications | `/api/v1/push/subscription` | Same as Phanpy #4 (declined). |
| Notification policy and filtered "requests" inbox | `/api/v2/notifications/policy`, `/api/v1/notifications/requests` | Same as Phanpy #5 (declined). |
| Notify me about this account's new posts | `follow` with `notify` | Same as Phanpy #6 (declined). |
| Mute with "hide notifications from this user" | `mute` with `notifications` | Mawkingbird mutes with an optional duration and does not send this flag. |
| Sync the notification read position across devices | `/api/v1/markers` (notifications) | Mastodon web saves only the notifications marker, not the home marker. |
| Email subscription to an account's posts (4.6, logged out) | `POST /api/v1/accounts/:id/email_subscriptions` | A new-post alert by email. |
| Email notification preferences | none (Rails form only) | Also in Part 3. |
| Render `moderation_warning` and `severed_relationships` notifications | `/api/v1/notifications` | Mawkingbird's notification views do not recognize these types. **Possible owner review:** these are rare account-safety notices (a moderator acted on your account, or a server block cut your follows), not engagement pings. Showing them would not make the app noisier, but the actions they lead to (appeal, CSV download) are browser-only (Part 3). |

---

# Part 3: Not supportable: no API, browser automation only

These Mastodon features exist only as server-rendered Rails pages or admin screens with no REST endpoint. A third-party client cannot provide them without driving a browser session that is signed in to the server's web UI. That means handling the person's password, 2FA and cookies, which mawkingbird should not do. **The practical approach is a deep link that opens the person's own server page in a new tab.** "Deep link" below means that.

## Account security and sign-in

| Feature | Server page | Recommendation |
| --- | --- | --- |
| Change password and email, confirm email | `/auth/edit` | Deep link. (`POST /api/v1/emails/confirmations`, to resend a confirmation, *is* API-supported and already used.) |
| Two-factor authentication: TOTP, security keys, recovery codes | `/settings/two_factor_authentication_methods` | Deep link. Never automate it. |
| Active sessions and authorized apps, with revoke | `/auth/edit`, `/oauth/authorized_applications` | Deep link. Mawkingbird can revoke only its own token. |
| Login history | `/settings/login_activities` | Deep link. |
| Developer applications and access tokens | `/settings/applications` | Deep link. `POST /api/v1/apps` registers an app but cannot list or manage them. |

## Preferences without a write API

`GET /api/v1/preferences` can **read** posting defaults and `reading:expand:media` / `reading:expand:spoilers`, but cannot change them. These other settings are web-only:

| Setting | Effect | Mawkingbird position |
| --- | --- | --- |
| `chosen_languages` (filter languages in public timelines) | Applied by the server to public and hashtag timelines | Mawkingbird's client-side language filters do the same job for mawkingbird. The server setting can only be deep-linked. |
| `aggregate_reblogs` (group boosts in home) | Server-side home timeline shaping | Deep link. Client-side boost controls already exist. |
| `show_application` (show which app you posted from) | Visible on your posts | Deep link. |
| Show your own posts and boosts in home (`display_own_posts`, `display_own_boosts`) | Server-side home timeline shaping | Deep link. |
| Interface locale and time zone (also used for emails) | Server-side | Not applicable. Mawkingbird has its own UI locale. |
| Email notifications and "always send emails" | Emails | Deep link. Out of scope anyway (Part 2). |
| `web.*` appearance and behaviour (theme, autoplay, blurhash, reduce motion, confirmations, hover cards and so on) | Mastodon's own web UI only | Not applicable. Mawkingbird has its own appearance settings. |

## Data, history and lifecycle

| Feature | Server page | Notes |
| --- | --- | --- |
| Request a full archive; download follows, lists, blocks, mutes, bookmarks and domain-block CSVs | `/settings/export` | No API. Mawkingbird's import/export page already rebuilds some of these on the client from API data. **The full archive is an account-moving step, so it is excluded by the no-exit-tools rule.** |
| Server-side CSV import (follows, blocks, mutes, bookmarks, lists, domain blocks) with a progress page | `/settings/imports` | No API. Mawkingbird can emulate it on the client with follow, block and mute calls (rate-limited, and only while open). |
| Automated post deletion by age, with exceptions | `/statuses_cleanup` | No API. **Mawkingbird has an unrouted, mock-only `SettingsDeletion` page** ([settings-deletion.ts](../ui/src/app/pages/settings/deletion/settings-deletion.ts)) that cannot work against a real server. Either remove it or turn it into a deep link. Deleting posts on the client while the app is open is possible but would not match the server's behaviour. That is an owner decision. |
| Severed relationships (follows lost to a block), with CSV download | `/severed_relationships` | No API, apart from the notification event. Deep link from the notification if Part 2's review allows it. |
| Moderation strikes and appeals | `/disputes/strikes` | No API. Deep link. |
| Profile verification instructions (`rel="me"` snippet) | `/settings/verifications` | The content is static. Mawkingbird can explain it itself, and the profile fields that carry links are API-supported. Not a real gap. |
| Invite links (create, expire, limit uses) | `/invites` | No user API. **Mawkingbird's Invites page manages server invites only through `_mock/invites`** ([mock-api.ts](../ui/src/app/mock-api.ts)), so that part works only against the mock. Its "invite from elsewhere" composer is unaffected. |
| Account aliases, move to another account, delete account | `/settings/aliases`, `/settings/migration`, `/settings/delete` | No API. **Excluded by the no-exit-tools rule.** |
| Follows and followers manager (bulk unfollow, remove followers, filter dormant or mutual) | `/relationships` | No API for the page itself, though its single actions are API calls. **Mass unfollow is excluded by the no-exit-tools rule.** Mawkingbird's existing reversible bulk actions stay as they are. |

## Administration without an API

There are no REST endpoints for any of these, so admins must use the server's `/admin/...` pages. The mawkingbird admin area should deep-link to them instead of trying to rebuild them.

- **Announcements:** create, edit, schedule, publish (see item 17).
- **Custom emojis:** upload, categorize, enable, copy from remote.
- **Server rules and terms of service** (the public API can only read them), privacy policy text, and the about and branding pages.
- **Server settings:** registrations, discovery, content retention, appearance, crawlers, external links.
- **Roles and permissions,** and changing a user's role or email.
- **Invites:** server-wide management.
- **Relays, webhooks, warning presets, username blocks.**
- **Federation overview** of known instances, with per-instance moderation history. Domain blocks themselves are API-supported and implemented.
- **Audit log** (action logs).
- **Reported-post browser** (`/admin/accounts/:id/statuses`) beyond what a report returns.
- **Follow recommendations** management, moderation subscriptions and suggestions (5.0), and the collections admin.
- **Server checks and software update notices.**

## Logged-out and Mastodon-specific features

These are not applicable to mawkingbird:

- **Remote interaction modal.** A logged-out visitor on a Mastodon server picks their home server to follow or reply. Mawkingbird resolves remote accounts through the signed-in server instead.
- **Donation campaign banner** (`/api/v1/donation_campaigns`). This is Mastodon gGmbH's own fundraising, which mawkingbird should not show. Mawkingbird has its own Funding page.
- **The custom homepage** (`/overview`): the server's landing page for logged-out visitors.

---

## Boundaries of this backlog

- Purely visual differences are excluded: themes, density, the "quiet public" label for unlisted posts, the quick-boost and stats-in-feed display options, and emoji rendering style.
- Different placement of an operation that already exists is not a gap.
- Before closing an item, verify the user-visible workflow against a real Mastodon server of a suitable version, including how it handles older servers that lack the endpoint. Record the server version you tested. A mock response is not proof of server support. Item 17 is an example of what goes wrong otherwise.
