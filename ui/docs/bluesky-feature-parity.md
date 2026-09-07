# Mawkingbird: Mastodon-to-Bluesky user-feature parity

Status: product/code audit, 2026-08-24

## Purpose

Mawkingbird began with a Mastodon-shaped application model and later added Bluesky as both a connector and a primary identity. The identity work is now real: a person can start with Bluesky, add Bluesky alts, switch among them, and attach Mastodon to a Bluesky-primary account. The next problem is no longer login. It is making a Bluesky-primary account feel like a first-class account throughout the product.

This document asks two related questions:

1. Where Mawkingbird already gives a Mastodon user a feature but does not give a Bluesky user the Bluesky equivalent?
2. What useful Bluesky-native features have no Mawkingbird surface yet, even where Mastodon has no direct equivalent?

The comparison is about user outcomes, not endpoint counts. A protocol can express the same outcome differently: a Mastodon boost is a Bluesky repost record; a Mastodon list timeline is a Bluesky curate-list feed; a Mastodon content warning maps only partially to Bluesky self-labels.

## Executive summary

Mawkingbird already has a credible Bluesky reading and interaction core:

- OAuth and legacy app-password sessions;
- Bluesky-primary identities and multiple Bluesky alts;
- account switching and per-DID storage scopes;
- home timeline paging and mixed-network aggregation;
- profiles, author feeds, followers, and following;
- account and post search;
- saved custom feeds, curate lists, and popular-feed discovery;
- trends;
- notifications and unread counts;
- existing DM conversations, message reading/sending, and read state;
- follow/unfollow, mute/unmute, and block/unblock;
- threads and replies;
- likes and reposts, including undo;
- text, facets, threads, up to four images, image compression, aspect ratios, and alt text;
- reading images, external cards, quotes, and record-with-media embeds.

That is substantial. The central weakness is that the rest of the Angular application still often treats `is authenticated` as `can call Mastodon APIs`. A Bluesky-primary identity can reach pages and controls whose implementation is unconditionally Mastodon-backed. Some merely fail; others present the wrong mental model.

The highest-value work is therefore:

1. introduce feature capabilities selected by the active identity/network;
2. make the existing profile, post, bookmark, moderation, and messaging surfaces route to Bluesky implementations;
3. only then add Bluesky-native breadth such as starter packs, custom-feed management, verification, and group chat.

## Architectural finding: authentication is not a protocol capability

Several shared components correctly route by provider already. `StatusActions` sends likes and reposts to `BlueskyApi`, `BlueskyReply` handles replies, the profile page uses `BlueskyGraph`, and the inbox can select a Bluesky notification source.

Other components still use predicates such as `!auth.isAnonymous` or `auth.isAuthenticated` as permission to call `Api`, which is the Mastodon API service. That is not valid for a Bluesky-primary account without a Mastodon connector.

The product needs an explicit capability layer along these lines:

```ts
interface IdentityCapabilities {
  protocol: 'mastodon' | 'bluesky' | 'anonymous';
  canEditProfile: boolean;
  canUseNativeBookmarks: boolean;
  canListNativeLikes: boolean;
  canManageServerLists: boolean;
  canManageModeration: boolean;
  canReport: boolean;
  canStartChat: boolean;
  canConfigureNotifications: boolean;
}
```

The exact shape can be split by domain. The important rule is that a page should ask what the active identity can do and which adapter implements it, not infer Mastodon from the existence of any authenticated identity. A linked Mastodon connector is a content source; it must not silently become the account-management backend for the active Bluesky persona.

Known protocol-unaware surfaces include:

- `pages/settings/profile`: reads and writes Mastodon credentials;
- `pages/settings/privacy`, `writing`, and the server-backed part of `i18n`;
- `pages/favourites` and `pages/bookmarks`;
- `pages/settings/account-list`, `follows`, `filters`, and `bulk-actions`;
- parts of import/export and friend discovery;
- the left-rail suggestions, relationship checks, follow action, and Mastodon hashtag trends;
- post controls that are hidden wholesale for a foreign provider rather than replaced with Bluesky equivalents.

## Parity matrix

Legend:

- **Yes** — usable Bluesky implementation is surfaced.
- **Partial** — some of the outcome works, but important behavior is missing or local-only.
- **No** — Bluesky supports the outcome but Mawkingbird does not surface it.
- **N/A** — the Mastodon feature has no Bluesky-native equivalent and should not be copied literally.

### Accounts and identity

| User outcome | Mastodon in Mawkingbird | Bluesky in Mawkingbird | Parity | Recommended action |
| --- | --- | --- | --- | --- |
| Sign in with standards-based OAuth | Yes | Yes, OAuth with PKCE/PAR/DPoP | Yes | Keep app-password login only as explicit legacy/diagnostic support. |
| Add and switch alts | Yes | Yes, identities keyed by DID | Yes | Add account labels and session-health indicators if switching becomes crowded. |
| Use the network as the primary identity | Yes | Yes | Yes | Continue auditing every route for assumptions about the primary protocol. |
| Attach the other network as a source | Bluesky connector | Mastodon connector | Yes | Keep source data scoped to the active primary identity. |
| Edit display name, bio, avatar, and banner | Yes | Profile can be read but the settings editor calls Mastodon | **No** | Implement `app.bsky.actor.profile` read/write, blob uploads, facet generation, and cache refresh. Hide Mastodon metadata-field UI for Bluesky. |
| Change handle | Instance/account UI only | Not surfaced | **No** | Add a Bluesky account-settings handoff first; later support handle update safely with identity-resolution warnings. |
| Change email/password and email 2FA | Not generally available through Mastodon's public client API | Not surfaced | **No** | Link to the PDS account manager initially. Native support is lower priority than profile editing. |
| Deactivate/delete/export account data | Limited in client | Not surfaced | **No** | Provide clear PDS-owned handoffs; consider native account export/deactivation only after destructive-flow design. |
| Manage app passwords and authorized apps | Mastodon authorized-app page exists only for mock/server tooling | Not surfaced | **No** | Show OAuth grants/session details where the provider permits it; link to PDS account management otherwise. |
| Display identity verification | Mastodon `rel=me` fields/badge are surfaced | Domain handles render, but Bluesky verification/trusted-verifier data is not modelled | **Partial** | Extend `BskyProfile` and the shared badge UI for Bluesky verification views and verifier details. |

### Reading, feeds, and discovery

| User outcome | Mastodon in Mawkingbird | Bluesky in Mawkingbird | Parity | Recommended action |
| --- | --- | --- | --- | --- |
| Read following/home timeline | Yes | Yes | Yes | Preserve independent cursors and source failure reporting. |
| Read a profile feed | Yes | Yes, including reply/media filters | Yes | Add remaining Bluesky profile tabs below. |
| Read public/local/federated feeds | Yes where the instance permits | Bluesky has no equivalent instance-local public timeline | N/A | Do not invent a fake local feed. Use Discover, custom feeds, trends, and starter packs. |
| Read custom algorithmic feeds | No direct Mastodon equivalent | Saved and popular feeds are readable | Yes | This is a Bluesky strength already surfaced. |
| Read curate-list feeds | Mastodon lists | Saved Bluesky curate lists are readable | Yes | Management parity is still missing. |
| Save, remove, pin, unpin, and reorder feeds | Mastodon lists/tags are manageable | Bluesky preferences are read-only in Mawkingbird | **No** | Implement `putPreferences` for saved feeds with careful merge semantics; add feed detail and save/pin controls. |
| Discover feeds | Server feeds and bundled sources | A bounded popular-feed list | Partial | Add feed search, suggested feeds, actor-created feeds, feed detail, and like counts. |
| Trending topics/posts/videos | Mastodon tags/posts/links | Bluesky trends appear, but link out to bsky.app | Partial | Open trend feeds in Mawkingbird where a feed URI is available; add trending posts/video only if they fit product navigation. |
| Personalize discovery/interests | Mastodon discovery is mostly server-controlled | Bluesky interest and content-visibility preferences are not surfaced | **No** | Add protocol-specific Discover preferences and explain whether each choice changes recommendations or public discoverability. |
| Suggested accounts | Synthetic Mastodon suggestions | Mixed timeline candidates can appear, but relationship checks and Follow use the Mastodon API | **No / misrouted** | Add a provider-aware suggestion model using Bluesky suggestions/known followers and route Follow through `BlueskyGraph`. |
| Directory/contact discovery | Mastodon directory plus local discovery tools | Actor search exists; Bluesky contact matching is not surfaced | Partial | Treat contact import as opt-in and privacy-sensitive; starter packs are a better earlier discovery investment. |
| Resume feed positions | Client behavior | No Bluesky-specific server marker | Partial | Keep browser-local positions per identity; do not block parity on a nonexistent common server marker. |

### Search

| User outcome | Mastodon in Mawkingbird | Bluesky in Mawkingbird | Parity | Recommended action |
| --- | --- | --- | --- | --- |
| Search accounts | Yes | Yes, including anonymous-capable actor search | Yes | Add typeahead only if it improves the existing helper. |
| Search posts | Yes when server search permits | Yes with Bluesky operators and paging | Yes | Track `searchPostsV2` rather than freezing around the older schema. |
| Search hashtags/topics | Mastodon hashtag results and tag timelines | Operators work, but there is no native Bluesky hashtag object/timeline management | Partial | Keep hashtag searches as post searches; do not present them as followable Mastodon tags. |
| Search feeds | No single cross-instance marketplace | Not surfaced | **No** | Add feed discovery/search alongside Popular on Bluesky. |
| Search starter packs | N/A | Bluesky supports starter-pack search/discovery | **No** | Add once starter-pack rendering exists. |
| Search within a profile | Mawkingbird offers rich profile analytics/search on Mastodon | Bluesky author feed filters only | Partial | Add profile-scoped Bluesky post search if it remains useful beside global `from:` search. |

### Profiles and social graph

| User outcome | Mastodon in Mawkingbird | Bluesky in Mawkingbird | Parity | Recommended action |
| --- | --- | --- | --- | --- |
| View profile, bio, avatar/banner, and counts | Yes | Yes | Yes | Add labels and verification rather than flattening them out. |
| View followers/following | Yes | Yes | Yes | Preserve cursor paging and provider-aware follow actions. |
| Follow/unfollow | Yes | Yes on Bluesky profiles/cards that use `BlueskyGraph` | Partial | Route every shared Follow button, especially suggestions and find-friends results, by provider. |
| Show follows-you/mutual context | Yes | Viewer state contains it and profile adapts some relationship state | Partial | Surface known followers and mutual context consistently in cards and profile headers. |
| Remove a follower | Yes | Not surfaced; Bluesky's product behavior differs | N/A/Partial | Do not reuse the Mastodon button blindly. Model the Bluesky-supported relationship operation, if any, explicitly. |
| View the account's likes | Favourites library exists for self | Self Likes are available in the provider-routed `/favourites` library; no profile Likes tab | Partial | Decide whether other actors' likes should be shown according to current visibility rules. |
| View the account's feeds/lists | Mastodon lists/collections | Saved feeds exist globally, but actor-created feeds/lists are not profile tabs | **No** | Add Feeds, Lists, and Starter Packs sections to Bluesky profiles. |
| View known followers | No close Mastodon equivalent | Bluesky supports known-followers views | **No** | High-value social-context feature for hover cards/profile pages. |
| Endorse/recommend accounts | Mastodon endorsements and collections are surfaced | Starter packs are not | **No** | Use Bluesky starter packs rather than forcing Mastodon endorsements onto Bluesky. |

### Composing and publishing

| User outcome | Mastodon in Mawkingbird | Bluesky in Mawkingbird | Parity | Recommended action |
| --- | --- | --- | --- | --- |
| Text post with mentions, links, and hashtags | Yes | Yes, facets are detected and handles resolved | Yes | Include `langs` as described below. |
| Reply | Yes | Yes | Yes | Keep replies provider-locked. |
| Thread | Yes | Yes, sequential reply chain | Yes | Improve partial-failure recovery with links to posts already published. |
| Images and alt text | Yes | Yes, four images, compression, aspect ratios, alt text | Yes | Keep the accessibility gate. |
| Video | Yes | The adapter does not model the video view and publishing accepts images only | **No** | Implement video rendering plus the Bluesky upload job flow, progress, failure recovery, captions/subtitles, and limits. |
| Animated GIF | Depends on server/media | Not surfaced in Bluesky composer | **No** | Follow Bluesky's current GIF/video representation rather than treating it as an image. |
| Link preview card | Mastodon server generates cards | Existing Bluesky external cards render, but composer creates no external embed | **No** | Resolve metadata and write `app.bsky.embed.external`; offer a remove/refresh preview control. |
| Native quote post | Mastodon quote compose is surfaced | Read-side quotes render, but Bluesky compose does not write a record embed | **No / correctness risk** | Do not show “Quote” as successful Bluesky behavior until `app.bsky.embed.record` or `recordWithMedia` is written. This is P0 because silent text-only publication violates intent. |
| Post language | Mastodon language picker is sent to the server | Picker exists, but Bluesky post records omit `langs` | **No** | Send the selected BCP-47 language array on every Bluesky post/thread segment. |
| Sensitive-content marking | Mastodon sensitive flag and CW UI | Cross-post UI says CWs are Fedi-only; Bluesky self-labels are not written | Partial | Map the supported adult/graphic media choices to self-labels. Do not pretend spoiler text has a direct Bluesky equivalent. |
| Reply controls | Mastodon interaction policy is surfaced | Bluesky thread gates are not written or managed | **No** | Add who-can-reply controls using `threadgate`; preserve existing gates when editing adjacent records. |
| Quote controls | Mastodon quote approval policy is surfaced | Bluesky post gates/detach-quote controls are absent | **No** | Add quote permissions and detach-quote controls for the post owner. |
| Delete own post | Yes | `deleteRecord` exists internally but own Bluesky posts do not get a delete action | **No** | Route delete by provider and confirm the exact AT URI. |
| Edit post/history | Yes on capable Mastodon servers | Bluesky has no equivalent mutable-post/edit-history feature | N/A | Do not promise parity; delete-and-redraft can be offered explicitly. |
| Drafts | Browser-local Mawkingbird drafts | Browser-local drafts work, but Bluesky's native draft service is not used | Partial | Decide whether cross-device Bluesky drafts are worth integrating; keep local drafts as a universal fallback. |
| Schedule post | Mastodon scheduled statuses | Bluesky has no native scheduled-post record/API | N/A | A Mawkingbird service could schedule later, but that is a hosted product feature, not protocol parity. |
| Poll | Yes | No Bluesky poll record/API | N/A | Current refusal is correct. |
| Non-public post visibility | Public/unlisted/followers/direct | Bluesky feed posts are public; private communication is chat | N/A | Hide or explain Mastodon visibility controls for a Bluesky-only target. |

### Post reading and actions

| User outcome | Mastodon in Mawkingbird | Bluesky in Mawkingbird | Parity | Recommended action |
| --- | --- | --- | --- | --- |
| Render text/facets/images/external cards/quotes | Yes | Yes for the common Bluesky embed shapes | Yes | Add video/gallery/blocked/not-found polish. |
| Open full thread | Yes | Yes, ancestors and replies | Yes | Consider newer thread endpoints/ranking without losing deterministic conversation view. |
| Like/unlike | Yes | Yes | Yes | Add the self Likes library. |
| Repost/undo | Yes | Yes | Yes | Add reposted-by list. |
| View who liked/reposted | Yes | Counts render, actor lists do not | **No** | Route count dialogs to `getLikes` and `getRepostedBy`. |
| View quotes | Mastodon quote APIs are represented | Count/link is not surfaced through `getQuotes` | **No** | Add quotes list and native quote navigation. |
| Bookmark privately and sync | Yes. Mastodon bookmarks are private server-side records and `/bookmarks` is implemented | Yes. Cards and reader mode write native private bookmarks, and `/bookmarks` pages them by active identity | Yes | Keep Raindrop as an explicit alternative rather than replacing native storage. |
| Pin own post | Yes | Not surfaced | **No** | Confirm current Bluesky profile-pinning representation before implementing; do not call Mastodon pin with a `bsky:` ID. |
| Mute thread | Yes | Bluesky API supports it, not surfaced | **No** | Route the bell/mute-thread action to `muteThread`/`unmuteThread`. |
| Hide a reply | Mastodon moderation differs | Bluesky post owners can hide replies; not surfaced | **No** | Add owner-only reply controls in thread menus. |
| Detach a quote | Mastodon can revoke a quote | Bluesky supports detach-quote behavior; not surfaced | **No** | This is a clean cross-protocol user outcome for the shared menu. |
| Report post/account | Yes | Explicitly omitted because labeler/report routing is not implemented | **No** | Implement report-service discovery and a provider-aware report dialog. Do not send Bluesky IDs to Mastodon reports. |
| Translate | Mastodon server translation plus optional AI | Signed-in Bluesky cards are excluded from both normal foreign-card tools and Mastodon translation | **No** | Offer AI translation for Bluesky text; never route it to a Mastodon status endpoint. |
| Subscribe to an account's new-post activity | Mastodon notification model differs | Bluesky activity subscriptions exist, not surfaced | **No** | Add a profile bell and activity-notification preferences. |

### Notifications

| User outcome | Mastodon in Mawkingbird | Bluesky in Mawkingbird | Parity | Recommended action |
| --- | --- | --- | --- | --- |
| List/page notifications | Yes | Yes | Yes | Keep independent cursors per network. |
| Unread count and mark seen | Yes | Yes | Yes | Current polling is acceptable for a static SPA. |
| Likes, reposts, follows, mentions, replies, quotes | Yes | Yes, adapted to shared rows | Yes | Preserve the original Bluesky reason so UI can distinguish reply from quote if desired. |
| Starter-pack joins | N/A | Flattened to a follow; pack context is lost | Partial | Link the relevant starter pack once packs are supported. |
| Verification changes | N/A | Unknown reasons render generically | **No** | Give verified/unverified events specific copy and verifier context. |
| Activity-subscription posts | N/A | Not mapped specifically | **No** | Render `subscribed-post` distinctly and link notification settings. |
| Per-type/source notification preferences | Mastodon settings are partly surfaced | Bluesky preference APIs are not surfaced | **No** | Add provider-specific notification settings rather than reusing Mastodon switches. |
| Push notifications | Not a central static-web feature today | Not implemented | Deferred | A PWA/push project should address both protocols together. |

### Direct messages and chat

| User outcome | Mastodon in Mawkingbird | Bluesky in Mawkingbird | Parity | Recommended action |
| --- | --- | --- | --- | --- |
| List existing conversations | Yes | Yes | Yes | Keep the network badge and unified inbox. |
| Read/send messages and mark read | Yes | Yes for existing Bluesky conversations | Yes | Preserve service proxying through the account's real PDS. |
| Start a new DM | Mastodon compose/direct flow | No Bluesky `getConvoForMembers`/initiation surface | **No** | Add Message on Bluesky profiles and a new-chat actor picker. |
| Conversation requests | Mastodon behavior differs | Bluesky requests/acceptance are not surfaced | **No** | Add Requests inbox, accept, and reject/leave flows. |
| Mute/leave conversation | Mastodon participant actions exist | Bluesky chat APIs exist but are not used | **No** | Add provider-routed conversation actions. |
| Delete a message for self | Not surfaced consistently | Bluesky supports it, not surfaced | **No** | Add to the message context menu. |
| Message reactions/replies/embeds | Limited | Bluesky supports richer chat, Mawkingbird sends plain text/facets | **No** | Add reactions and reply context before less common embeds. |
| Group chats, members, join links, and requests | No close Mastodon equivalent | Current Bluesky chat lexicons and first-party UI support them; Mawkingbird does not | **No** | Valuable Bluesky-native Phase 3 work after one-to-one chat completion. |
| Report conversation/message | Mastodon report dialog exists | Shared chat moderation does not route to Bluesky reporting | **No** | Implement chat/report service routing separately from actor block/mute. |
| Chat notification/privacy preferences | Mastodon settings differ | Not surfaced | **No** | Add Bluesky chat preferences to protocol-specific settings. |

### Lists, starter packs, and communities

| User outcome | Mastodon in Mawkingbird | Bluesky in Mawkingbird | Parity | Recommended action |
| --- | --- | --- | --- | --- |
| Create/edit/delete a reading list | Yes | Saved curate lists can be read but not managed | **No** | Implement list record/list-item CRUD and avatar/description editing. |
| Add/remove accounts from a list | Yes | Not surfaced | **No** | Reuse shared account-picker UX with a Bluesky list adapter. |
| Moderation lists | Domain/account moderation exists | Bluesky modlists/list mute/list block are not surfaced | **No** | Add subscriptions and list-level mute/block controls under Moderation. |
| Create/view/share starter packs | Mastodon Collections and bundled starter collections | No Bluesky starter-pack UI | **No** | Implement pack cards, member/feed preview, follow/add actions, QR/share, and creator management. |
| Search/discover starter packs | Mastodon collections are browsable | Not surfaced | **No** | Add after basic pack rendering. |
| Show packs on profiles | Collections/endorsements appear on Mastodon profiles | Missing | **No** | Add a profile Starter Packs tab. |

### Moderation, safety, and trust

| User outcome | Mastodon in Mawkingbird | Bluesky in Mawkingbird | Parity | Recommended action |
| --- | --- | --- | --- | --- |
| Mute/block an actor | Yes | Yes from Bluesky profile paths | Yes | Route the same actions correctly from every shared card/menu. |
| Review muted/blocked accounts | Yes | Settings list is Mastodon-backed | **No** | Add Bluesky `getMutes`/`getBlocks` pages or a provider switch in the shared page. |
| Muted words/tags | Mastodon filters are surfaced | Bluesky muted-word preferences are not | **No** | Add a Bluesky-specific muted words/tags editor. |
| Content filters | Mastodon filter CRUD | Bluesky uses preferences, labels, and moderation services instead | **No** | Build a common “Content controls” shell with protocol-specific implementations. |
| Label preferences and custom labelers | No direct Mastodon equivalent | Not surfaced; labels are mostly flattened away | **No** | Model labels in adapters, render moderation decisions, and manage labeler subscriptions/preferences. |
| Self-label posts/profile | Mastodon sensitivity/CW controls | Not surfaced | **No** | Add composer and profile self-label controls with plain-language explanations. |
| Report/appeal moderation | Reports exist | Not surfaced | **No** | Reporting is P0; appeals and “labels on me” can follow. |
| Thread safety controls | Mute thread and quote policies | Bluesky mute thread, thread gates, post gates, hidden replies, detach quote are absent | **No** | Provide a provider-neutral menu whose implementation differs by protocol. |
| Domain blocking | Yes for Mastodon | No Bluesky domain-server analogue | N/A | Do not translate domains into handles or PDS hosts. Use actors, lists, labels, and muted words. |

## Bluesky-native features Mawkingbird does not currently surface

These are not just Mastodon parity work. They are reasons a Bluesky user may prefer a Bluesky-aware client.

1. **Algorithmic feed control** — search/discover feeds; save, pin, reorder, remove, and inspect them; show feeds created by a profile.
2. **Starter packs** — view, join, create, edit, share, search, and display on profiles.
3. **Known followers and richer social context** — show which familiar people follow an account and improve suggestions.
4. **Verification** — badges, trusted verifiers, verification detail, and verification notifications.
5. **Composable moderation** — labeler services, label preferences, labels on the user's own content, modlists, muted words, and appeals.
6. **Thread governance** — who can reply/quote, hidden replies, detached quotes, and thread mute.
7. **Activity subscriptions** — profile bell and per-account new-post notifications.
8. **Native bookmarks** — private, cross-device saved posts rather than browser-local copies.
9. **Richer publishing** — video/GIF, external link cards, native quotes, post languages, self-labels, and gallery embeds.
10. **Modern chat** — new conversations, requests, group chats, reactions, replies, join links, and conversation settings.
11. **Contact matching** — opt-in phone/contact discovery. This deserves a separate privacy review rather than automatic parity work.
12. **Cross-device drafts** — the current Bluesky draft API can complement Mawkingbird's universal local drafts.
13. **Video discovery** — dedicated video feeds and trending videos, if Mawkingbird wants that product posture.
14. **Discovery/privacy declarations and interests** — controls over recommendation inputs and whether an account appears in discovery surfaces.
15. **Live-content status** — Bluesky has an account-status declaration for advertising live content; useful only if Mawkingbird wants creator/streaming workflows.

## Priority plan

### Implementation progress (2026-08-27)

- Completed: Bluesky profile editing, provider-routed own-post deletion, native account/post reporting, and provider-aware shared Follow controls.
- Completed by safe suppression: Bluesky quote actions do not appear unless a native quote embed can be written.
- Completed ahead of the original ordering: native private Bluesky bookmarks and the shared `/bookmarks` library.
- Completed from P1: the shared Likes library now reads and pages the Bluesky-primary account's native self Likes.
- Completed trust follow-up: reader-mode actions and shared Follow failures name the target network, and reader bookmarks no longer route Bluesky post IDs through Mastodon.
- Still cross-cutting: finish the capability/adaptor boundary audit, replace remaining Mastodon-only routes, and make every error identify its target network and operation.

### P0: correctness and trust

These should precede feature expansion because the current UI can imply an operation works against Bluesky when it is Mastodon-backed or incomplete.

1. Add protocol capability/adaptor boundaries for account, post, graph, moderation, library, and chat operations.
2. Audit/hide/replace every Mastodon-only route for a Bluesky-primary identity with no Mastodon connector.
3. Implement Bluesky public-profile editing.
4. Implement provider-routed own-post delete.
5. Either implement native Bluesky quotes or suppress the quote action for a Bluesky destination; never silently publish a non-quote.
6. Implement Bluesky reporting for accounts and posts.
7. Fix shared Follow actions and left-rail suggestions so they never send `bsky:` IDs to Mastodon.
8. Make errors name the target network and operation rather than suggesting a generic expired connector.

### P1: daily-client parity

1. Native Bluesky bookmarks plus the `/bookmarks` library.
2. Liked-by, reposted-by, and quotes lists (self Likes are complete).
3. Start a DM; add conversation requests, mute, leave, and provider-aware moderation.
4. Video/GIF upload, external link cards, native quote embeds, `langs`, and self-labels.
5. Thread mute, reply/quote controls, hide reply, and detach quote.
6. Bluesky muted/blocked lists, muted words, and content-label preferences.
7. Create/edit/member-manage Bluesky lists and save/pin/reorder custom feeds.
8. Provider-aware notification preferences and activity subscriptions.
9. Complete Bluesky profile tabs: Likes, Feeds, Lists, Starter Packs, known followers, and verification.

### P2: Bluesky advantage

1. Starter-pack creation/discovery/join/share flows.
2. Custom labeler discovery, labels-on-me, and appeals.
3. Group chat, reactions, replies, join links, and group administration.
4. Cross-device drafts.
5. Contact matching after a privacy and consent design.
6. Video-first discovery and gallery embeds if supported by Mawkingbird's product direction.
7. Native account administration where it is safer than handing off to the PDS.

## Suggested implementation sequence

The capability work should not become one giant protocol-neutral interface. Split it around user workflows:

1. `ProfileService`: read/edit own profile and read another profile.
2. `PostActions`: like, repost, bookmark, delete, thread mute, quote controls, report.
3. `LibraryService`: likes, bookmarks, lists, saved feeds.
4. `ModerationService`: actor lists, words, labels, reports.
5. `ConversationService`: list/start/read/send/manage.
6. `AccountSettingsService`: provider-owned handoffs and the small subset safe to perform in-app.

Each shared page can select an adapter from the active identity. A content card can select from the post's provider. Those are deliberately different decisions: the active identity determines where a new post/bookmark/report is written, while the displayed post determines how its native interaction is addressed.

## Things that are not parity gaps

Do not spend time making Bluesky pretend to be Mastodon where the product model differs:

- Bluesky has no native poll record.
- Bluesky has no native scheduled-post API; scheduling would be a Mawkingbird hosted service.
- Bluesky feed posts do not have Mastodon's public/unlisted/followers/direct visibility ladder.
- Bluesky has no Mastodon-style local/federated instance timeline.
- Bluesky does not have Mastodon domain blocks in the same sense.
- Bluesky does not currently offer Mastodon-style mutable post editing and public edit history.
- Mastodon profile metadata fields and `rel=me` verification should not be copied as fake Bluesky fields; use Bluesky's profile and verification models.

## Evidence and source map

Mawkingbird implementation areas reviewed:

- `src/app/providers/bluesky/bluesky-api.ts`
- `src/app/providers/bluesky/bluesky-session.ts`
- `src/app/providers/bluesky/bluesky-feeds.ts`
- `src/app/providers/bluesky/bluesky-graph.ts`
- `src/app/providers/bluesky/bluesky-chat-api.ts`
- `src/app/providers/bluesky/bluesky-notifications.ts`
- `src/app/providers/bluesky/bluesky-adapter.ts`
- `src/app/compose/compose.ts`
- `src/app/status-card/status-card.ts`
- `src/app/pages/profile/profile.ts`
- `src/app/pages/lists/lists.ts`
- `src/app/pages/notifications/notifications.ts`
- `src/app/pages/conversations/conversations.ts`
- `src/app/pages/settings/`
- `src/app/app.routes.ts`

Current upstream capability references:

- [AT Protocol `app.bsky` lexicons](https://github.com/bluesky-social/atproto/tree/main/lexicons/app/bsky)
- [AT Protocol Bluesky chat lexicons](https://github.com/bluesky-social/atproto/tree/main/lexicons/chat/bsky)
- [Bluesky first-party application source](https://github.com/bluesky-social/social-app/tree/main/src)
- [Bluesky custom feeds](https://bsky.social/about/blog/7-27-2023-custom-feeds)
- [Bluesky starter packs](https://bsky.social/about/blog/06-26-2024-starter-packs)
- [Mastodon bookmarks API](https://docs.joinmastodon.org/methods/bookmarks/)
- [Mastodon status interactions API](https://docs.joinmastodon.org/methods/statuses/)

The AT Protocol and first-party client are moving quickly. The lexicons are the source of truth for callable capabilities; the social-app source is useful evidence that a capability has an actual user-facing design rather than being only a schema on `main`.
