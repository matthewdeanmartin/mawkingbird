# Bluesky parity: Mawkingbird vs. the official Bluesky app

Status: gap analysis and proposed sprints, 2026-11-20. No code written.
Reference: `../REFERENCE/social-app` at `47e6acedf` (2026-11-20, "Keep
find-in-page working in the virtualized web List").

The question this answers: **for someone whose Bluesky account is their
primary identity in Mawkingbird, is the experience as complete as bsky.app?**
The Mastodon-first experience, where Bluesky is a second feed, is not the bar
here. Some Bluesky features cannot fit into a Mastodon-shaped account ("two
pegs, one hole"). Where a sprint below behaves differently for a Bluesky
connector under a Mastodon or Anonymous account, that is noted. It is not
scored.

This supersedes, but does not repeat, the evidence in
[sprint/november_2026_bsky_parity.md](sprint/november_2026_bsky_parity.md)
(sprints 1–6: video, who engaged, reply/quote controls, moderation, discovery,
chat), and in `history/bluesky-*.md`.

## Method

Earlier audits were built from web search plus the Mawkingbird source. This one
compares the two codebases directly:

1. **Route inventory.** Every route in `social-app/src/routes.ts` (about 90
   screens) was mapped to a Mawkingbird route or component.
2. **API inventory.** Every XRPC NSID that social-app references
   (`app.bsky.*`, `chat.bsky.*`, `com.atproto.*`, `tools.ozone.*`) was diffed
   against the NSIDs and `@atproto/api` agent methods that `ui/src` uses.
   Type-only names (`*.defs.*`) were dropped by hand. To regenerate:

   ```sh
   grep -rhoE "\b(app\.bsky|chat\.bsky|com\.atproto|tools\.ozone)(\.[a-zA-Z]+){2,3}\b" \
     ../REFERENCE/social-app/src --include=*.ts --include=*.tsx | sort -u > sa.txt
   grep -rhoE "\b(app\.bsky|chat\.bsky|com\.atproto|tools\.ozone)(\.[a-zA-Z]+){2,3}\b" \
     ui/src --include=*.ts --include=*.html | sort -u > mb.txt
   comm -23 sa.txt mb.txt   # in the official app, absent here
   ```

3. **One live check.** `https://bsky.social/.well-known/oauth-authorization-server`
   returns `prompt_values_supported: ["none","login","consent","select_account","create"]`
   (fetched 2026-11-20). See [Sign-up](#account-and-sign-up).

A source match means the capability is reachable in code. It does not mean it
was tested live. **The six November sprints are still "code complete, awaiting
live trials"**. Rows marked ✅ that rest on them inherit that caveat.

## Scope

In: everything a Bluesky-first account does in bsky.app (web), plus account
creation and onboarding, moderation services (labelers, label preferences, the
moderation inbox), and the newer extras (trending, Live Now, video feed, GIFs,
find contacts, profile links, Atmosphere).

Out, by owner decision (2026-11-20):

- **Account lifecycle**: change handle, email or password, app passwords,
  deactivate, delete, repo export. Link out to bsky.app.

Out, by house rule (see memory and earlier specs):

- Push registration (`registerPush`), **activity subscriptions**
  (`putActivitySubscription`, the "notify me when this person posts" bell),
  server notification-preference policies, and chat notification
  preferences. Mawkingbird is deliberately weak on notifications.
- Anything that helps someone quit, delete, move or mass-unfollow.

The bar is **the feature exists and works** for a Bluesky-first account. UX
friction appears only as notes.

Legend: ✅ parity · 🟡 partial · ❌ missing · ⛔ out of scope by rule/decision ·
❓ needs an owner call or a live check.

## Inventory

### Account and sign-up

| bsky.app | social-app | Mawkingbird | Notes |
| --- | --- | --- | --- |
| Sign in (OAuth, app password) | `screens/Login` | ✅ | `accounts/sign-in/login-bluesky`, OAuth first |
| Multiple accounts, switching | session state | ✅ | DID identities, reload on switch |
| **Create account** | `screens/Signup` (`createAccount`, captcha, `checkHandleAvailability`, `checkSignupQueue`) | ❌ | See below. No Bluesky path on any sign-up surface |
| Onboarding: profile, interests, suggested accounts, suggested starter packs, find contacts | `screens/Onboarding/Step*` | ❌ | The Mastodon account-setup wizard (`accounts/setup/steps/`, [new-account-setup.md](new-account-setup.md)) is the natural host |
| Age assurance | `ageAssurance/`, `app.bsky.ageassurance.*` | ❓ | Bluesky enforces this server-side in some regions. Owner question 4 |
| Account lifecycle | `AccountSettings`, `AppPasswords` | ⛔ | Out of scope, link out |

**Sign-up with return to Mawkingbird: possible today.** bsky.social's
authorization server advertises `prompt=create`, and the
`@atproto/oauth-types` in our lockfile already types `prompt: 'create'`. An
OAuth authorize with `prompt: 'create'` shows Bluesky's own sign-up form
(handle, email, password, captcha, and the signup queue if it is on), then
completes authorization and redirects to our callback signed in. This is the
same shape Mastodon 5 gives us (`Login.startOAuth(create = true)`). We do not
host the form, handle captcha or touch passwords. Unverified: whether a
brand-new account that lands in the **signup queue** completes the redirect
or parks. That needs a live trial (owner to-do).

### Home and feeds

| bsky.app | Mawkingbird | Notes |
| --- | --- | --- |
| Following timeline | ✅ | `getTimeline` |
| Open any custom feed / list feed | ✅ | `feeds/bluesky/:ref`, `getFeed`, `getListFeed` |
| Feed tabs from saved/pinned feeds | 🟡 | Reads `savedFeedsPrefV2`. **Read-only by design** (`bluesky-feeds.ts:53`) |
| **Save / unsave / pin / reorder feeds** | ❌ | No `putPreferences` write for feeds. The biggest everyday gap: a Bluesky-first user cannot curate Home here |
| Popular / suggested feeds | 🟡 | `getPopularFeedGenerators` ✅. `getSuggestedFeeds` ❌ |
| Feed page: about, like feed, creator | ❓ | Like-a-feed and "liked by" (`CustomFeedLikedBy`) not found |
| Show more / show less like this | ✅ | Sprint 5, `sendInteractions` |
| Following feed prefs: hide replies, reposts, quotes, replies-by-followed-only | ❌ | `feedViewPref` neither read nor written |
| Video feed (vertical swipe, `contentModeVideo`) | ❌ | Low priority. Owner question 5 |
| "Following v2" home | ❓ | `features/followingV2` is gated/experimental upstream. Watch it, don't build |

### Post card and embeds (reading)

| bsky.app | Mawkingbird | Notes |
| --- | --- | --- |
| Text, facets, links, mentions, tags | ✅ | `bluesky-facets.ts`, `renderRichText` |
| Images (up to 4), alt text | ✅ | |
| **Gallery embed** (`app.bsky.embed.gallery`, up to 10 images) | ❌ | **Content-loss risk:** the adapter doesn't know this embed, so another user's gallery post probably renders with no media. Verify first |
| External card | ✅ | |
| **Article card** (`embed.external#viewArticle`, publication, theme) and **livestream** view | ❓ | New view variants. Check that they fall back to a plain card and don't vanish |
| Video playback | ✅ | Sprint 1 |
| Quote, quote-with-media, detached/blocked/not-found quotes | ✅ | Sprint 3 handles detached |
| Labels on posts (blur/warn/hide) | 🟡 | Hard-coded `SENSITIVE_LABELS` mapped to `sensitive` (`bluesky-adapter.ts:266`). Ignores the reader's label prefs, labeler-defined labels, `!hide`/`!warn`, and account-level labels |
| **Verification badges** (`VerificationView`, trusted verifiers) | ❌ | `verified-badge` is not Bluesky-aware |
| **Live Now** ring/badge (`app.bsky.actor.status`) | ❌ | Display only. Going live is out |
| Pinned post on profile | ✅ | `reasonPin`, `setPinnedPost` |
| Translation | ✅ | AI translation path (not Bluesky's, which has none server-side) |

### Threads

| bsky.app | Mawkingbird | Notes |
| --- | --- | --- |
| Thread view | ✅ | `getPostThread` (v1) |
| Thread v2 (`getPostThreadV2` / `OtherV2`): server-ranked replies, "show more" of hidden/low-quality branches | ❌ | Upstream moved to v2 |
| Thread prefs: sort (hot/oldest/newest/most-liked), prioritize followed | ❌ | `threadViewPref` unused |
| Hide a reply on my thread | ✅ | Sprint 3, `hiddenReplies` |
| Mute thread | ✅ | |
| Who liked / reposted / quoted | ✅ | Sprint 2 |

### Composer

| bsky.app | Mawkingbird | Notes |
| --- | --- | --- |
| Post, reply, quote, thread | ✅ | |
| Languages, self-labels, alt text | ✅ | |
| Reply/quote controls (threadgate/postgate) | ✅ | Sprint 3 |
| **Default** reply/quote controls (`postInteractionSettingsPref`) | ❌ | bsky.app remembers them. We ask each time or use our default |
| Video, one per post | ✅ | Simple upload only |
| Large video (multipart `startUpload`/`uploadPart`/`finishUpload`), captions (WebVTT) | ❌ | Deferred in Sprint 1 |
| **Gallery** (more than 4 images, up to 10) | ❌ | Pairs with the reading gap |
| **Server drafts** (`app.bsky.draft.*`) | ❌ | Ours are local. bsky.app drafts sync across its apps; ours don't appear there and vice versa |
| GIF picker | ❌ | Upstream uses `gifs.bsky.app/klipy/v2/*`. CORS and terms unverified |
| Edit post | (beyond parity) | Bluesky has no edit. We offer an atomic replace (`bluesky-replace-post.ts`). Keep, but note the bsky.app reader sees a new post |

### Profile

| bsky.app | Mawkingbird | Notes |
| --- | --- | --- |
| Header, bio, avatar, banner, counts | ✅ | |
| Edit profile | ✅ | `putProfile` |
| **Pronouns, website** fields | ❌ | Neither shown nor editable |
| **Profile links** (`app.bsky.actor.link`, link pills) | ❌ | New upstream. Moderated link list. Show, then edit |
| Tabs: posts, replies, media, likes (own) | ✅ | `posts_*` filters |
| Tabs: videos, feeds, lists, starter packs | 🟡 | Starter packs ✅ (Sprint 5). Feeds (`getActorFeeds`) ❌. Videos ❓ |
| Known followers ("followed by X and Y you know") | ❌ | `getKnownFollowers` unused |
| Search within profile | ❓ | `ProfileSearch`. Probably reachable via search `from:` |
| Similar accounts after follow | ✅ | Sprint 5 |

### Graph, lists and starter packs

| bsky.app | Mawkingbird | Notes |
| --- | --- | --- |
| Follow, block, mute | ✅ | `bluesky-graph.ts` |
| **My blocked accounts / my muted accounts pages** | ❌ | `getBlocks`/`getMutes` unused. You can block, but you can't see or undo the list |
| Subscribe to mute/block lists | ✅ | Sprint 4 |
| **Create / edit curated and moderation lists; "Add to list" from a profile** | ❌ | `listitem` is only written for starter packs. `getListsWithMembership` unused |
| Starter packs: view, follow all, create | ✅ | Sprint 5 |
| Starter packs: edit/delete, search (`searchStarterPacks`), members by search | ❌ | Deferred in Sprint 5 |
| **Opt out of being added to lists/packs** (`referencelistoptout`) | ❌ | New privacy control |

### Search and discovery

| bsky.app | Mawkingbird | Notes |
| --- | --- | --- |
| Post search (top/latest, operators) | ✅ | `bluesky-search-panel`, query serializer |
| People search, typeahead | ✅ | `searchActors` (typeahead endpoint not needed) |
| Feed search | ❓ | |
| Hashtag page, Topic page | 🟡 | Hashtags route to search. Topic pages ❓ |
| Trending topics | ✅ | `getTrendingTopics`, `getTrends` |
| Explore suggestions (`getSuggestedUsersFor*`, `getSuggestedStarterPacks`) | 🟡 | `getSuggestions` and `getSuggestedFollowsByActor` only |
| Interests (`interestsPref`), which steer suggestions | ❌ | |
| Atmosphere (directory of other atproto apps) | ❌ | Owner question 5 |

### Notifications

| bsky.app | Mawkingbird | Notes |
| --- | --- | --- |
| List, unread count, mark seen | ✅ | |
| Reasons like, repost, follow, mention, reply, quote, via-repost | ✅ | |
| Reasons `starterpack-joined`, `verified`/`unverified`, `subscribed-post`, `contact-match` | ❓ | Check that unknown reasons are dropped cleanly, not shown as broken rows |
| Grouped notifications (`getGroupedNotifications`) | ❓ | Upstream groups server-side. Check whether we group client-side |
| Notification settings, activity subscriptions, push | ⛔ | House rule |

### Chat

| bsky.app | Mawkingbird | Notes |
| --- | --- | --- |
| 1:1 chats, requests, accept/decline, mute, leave, reactions, delete-for-me, who can message me | ✅ | Sprint 6 |
| Live updates (`getLog`), paging past 50, nav request badge, `getUnreadCounts` | ❌ | Deferred in Sprint 6 |
| **Group chats** (`chat.bsky.group.*`: create, add/remove, join links, join requests, lock) | ❌ | New upstream, a large surface |
| Share a post via chat | ❓ | |
| Message replies (`ReplyRef`) | ❓ | |

### Moderation and safety

| bsky.app | Mawkingbird | Notes |
| --- | --- | --- |
| Muted words (with expiry, exclude-following, tags) | ✅ | Sprint 4 |
| Subscribe/unsubscribe labelers | ✅ | By handle, on the settings page |
| **Labeler profile page** (description, its labels, subscribe from there, liked by) | ❌ | |
| **Per-label preferences** (show/warn/hide, per labeler), **adult content toggle** | ❌ | No `contentLabelPref`/`adultContentPref`. With the post-label gap above, this is the core of "moderation services" |
| Report post/account | 🟡 | Three reasons. Upstream uses the full `tools.ozone.report` taxonomy (~40) and lets you pick which labeler receives the report |
| **Moderation inbox** (`tools.ozone.inbox.*`: my reports, actions on my account, appeals) | ❌ | New upstream |
| Hide from algorithmic recommendations (`contentVisibilityDeclaration`) | ❌ | New privacy control |
| Mark my account as a bot (self-label) | ❌ | `AutomationLabelSettings`. Small |
| Verification settings (hide badges) | ❌ | Only matters once badges render |
| Logged-out visibility (`!no-unauthenticated`) | ❓ | Respect it on public/SEO pages |

### Settings with no equivalent needed

Appearance, accessibility, app icon, app language and external-media
preferences already exist in Mawkingbird's own settings, and they are not
account-synced on Bluesky. Not scored.

## Ranked gaps

1. **Reading correctness.** Gallery posts, article cards, labels and
   verification. Today a Bluesky-first reader can miss media and moderation
   that bsky.app shows. This is cheap and touches every timeline.
2. **Sign up with Bluesky.** `prompt=create` works today. Without it,
   Mawkingbird can't be someone's first Bluesky app.
3. **Curating your own Bluesky.** Saving and pinning feeds, lists, add-to-list,
   and the blocked/muted pages. These are the actions a daily user takes weekly
   and must currently do in bsky.app.
4. **Synced preferences.** Following-feed and thread prefs, the default
   interaction settings, interests and the new privacy opt-outs. They make
   Mawkingbird behave like the account's settings say.
5. **Moderation services.** Label prefs, labeler pages, the full report
   taxonomy and the moderation inbox.
6. **Composer catch-up.** Server drafts, gallery posting, large video and
   captions, GIFs, and profile links/pronouns/website editing.
7. **Chat 2.** Live updates and paging, then group chats.
8. Extras: video feed, Atmosphere, find contacts. Owner calls.

## Proposed sprints

Each sprint follows the November ground rules: it works for Bluesky-first and
connector identities, via `BlueskyApi`; media bytes never go through the Plus
proxy; copy is English only with `// i18n` and `i18n:extract`; AGENTS.md
gates; a manual test plan in `test_plans/`.

**`putPreferences` rule for sprints 3–5:** `app.bsky.actor.putPreferences`
replaces the whole preferences array. Always read-modify-write the full array,
preserve unknown `$type`s byte for byte, and change only the entry you own.
This is the risk `bluesky-feeds.ts` was avoiding. One shared, tested
`BlueskyPreferences` service should own it, not each feature.

### Sprint 1: read everything bsky.app shows

- `app.bsky.embed.gallery` (+ `recordWithMedia` gallery) in the adapter and
  the media grid. First reproduce the current failure with a fixture.
- `external#viewArticle` and livestream variants: render, or degrade to a
  plain card.
- Label engine: read `contentLabelPref`, `adultContentPref`, labeler
  definitions (`getServices` with `detailed`), and honor
  `!hide`/`!warn`/account labels. Prefer `@atproto/api`'s
  `moderatePost`/`moderateProfile` over hand mapping. Check the bundle cost
  and keep it off the root import.
- Verification badges from `VerificationView`.
- Profile pronouns, website and profile links (display), plus the Live Now
  badge (display).
- Unknown notification reasons handled cleanly.

Acceptance: a fixture set of upstream post shapes renders with no dropped
media. A post labeled by a subscribed labeler blurs, warns or hides as the
reader's Bluesky settings say.

### Sprint 2: sign up with Bluesky

- "Create a Bluesky account" calls OAuth authorize with `prompt: 'create'`
  against bsky.social (other PDSes: only if their metadata lists `create`;
  otherwise hide the button).
- A Bluesky branch of the account-setup wizard: profile (avatar, bio),
  interests, suggested accounts/starter packs (`getSuggestedOnboardingUsers`,
  `getOnboardingSuggestedStarterPacks`), and a first post. Reuse the
  Mastodon wizard's steps where they're network-neutral.
- Optional, owner call: a `/create-bluesky-account/` public page, mirroring
  the Mastodon one (SEO, client-first copy).

Connector note: under a Mastodon-first account, the same button can create a
Bluesky account and attach it as a connector. Skip the wizard and show a
short "now in your Home" confirmation.

### Sprint 3: your feeds, your lists

- The `BlueskyPreferences` service (see the rule above), with specs that
  round-trip unknown prefs.
- Save, unsave, pin, unpin and reorder feeds and lists. Like a feed.
- Lists: create/edit/delete curated and moderation lists, add/remove members,
  and "Add to list" on profiles (`getListsWithMembership`).
- Blocked accounts and muted accounts pages (`getBlocks`, `getMutes`) with
  unblock/unmute.
- Profile Feeds tab (`getActorFeeds`), known followers, starter-pack
  search/edit/delete.

### Sprint 4: preferences that follow the account

- Following-feed prefs (`feedViewPref`), applied to `getTimeline` results.
- Move threads to `getPostThreadV2`, with thread prefs (sort, prioritize
  followed) and "show more replies".
- Default reply/quote controls from `postInteractionSettingsPref`, read and
  written by the composer dialog.
- Interests (`interestsPref`).
- Privacy: hide from algorithmic recommendations; opt out of lists/packs;
  mark the account as a bot.

### Sprint 5: moderation services

- Label preferences UI per labeler, plus the adult content toggle.
- Labeler profile pages (subscribe from there).
- Full report reason taxonomy, with a choice of which labeler receives the report.
- Moderation inbox (`tools.ozone.inbox.*`): my reports, actions on me,
  appeals. Confirm the endpoint is reachable from a browser OAuth session
  before committing.

### Sprint 6: composer catch-up

- Server drafts (`app.bsky.draft.*`) for Bluesky-only posts. Decide how they
  coexist with local drafts (owner question 3).
- Gallery posting (up to 10 images).
- Large video via multipart; captions.
- GIF picker, if `gifs.bsky.app` permits browser CORS and Klipy's terms allow
  a third-party client. Otherwise ❌ with a reason.
- Edit profile links, pronouns and website.

### Sprint 7: chat 2

- `getLog` polling, paging past 50, request badge, `getUnreadCounts`.
- Group chats: create, add/remove members, join links and join requests,
  lock/unlock, system messages. Large; may split.

## Owner questions

1. **Sign-up landing page:** do you want a public `/create-bluesky-account/`
   page alongside the Mastodon one, or only a button on the login page?
2. **Feed preferences:** the earlier "read-only on purpose" decision guarded
   against corrupting the list bsky.app depends on. Is the shared
   read-modify-write service (Sprint 3) enough to lift it?
3. **Drafts:** sync Bluesky drafts to the account (visible in bsky.app), keep
   them local, or both with a choice?
4. **Age assurance:** do nothing (Bluesky enforces server-side), or surface
   the state and the "verify your age" link-out like bsky.app?
5. **Extras:** video feed, Atmosphere and find-contacts (phone-number
   matching). Build, link out, or explicitly drop?

## Owner to-dos

- Run the live trials for November sprints 1–6 (`test_plans/bsky-parity-sprint-*`).
  Several ✅ rows here depend on them.
- Live check: a brand-new bsky.social account through `prompt=create`. Does it
  return signed in, including when the signup queue is on?
- Live check: open a gallery post and an article-card post from bsky.app in
  Mawkingbird, and note what renders.

## What's next

Sprint 1 (read everything bsky.app shows) is the next sprint: low risk, no
preference writes, and it fixes visible content loss. Sprint 2 (sign-up) can
run in parallel if owner question 1 is answered.
