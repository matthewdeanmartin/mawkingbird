# Bluesky parity reassessment — 2026-09-12

Bluesky has a substantial reading and interaction implementation, but it is not
yet a coequal primary identity throughout the application. The highest priority
is making account ownership, network credentials, and request destinations agree.
More feed and composer features should follow that work.

## Scope and confidence

This is a source audit of the maintained `ui/` client, compared with the
[August audit](bluesky-feature-parity.md) and its August 27 progress notes.
It includes the preceding local Home/Notifications fixes, which have passed the
full test gate but have not been deployed. This assessment adds documentation;
it does not implement the remaining issues below. Subsequent implementation of
the selected switching, Conversations, and capability fixes is tracked in
[the two-sprint follow-up](bluesky-parity-sprints.md). The findings below record
the pre-fix behavior; privacy/account-setting ownership and moderation remain deferred.

Findings trace route guards, templates, services, request interceptors, and
existing tests. No authenticated production requests or account-setting writes
were performed. Wrong-account/wrong-host findings describe reachable code paths,
not evidence that a particular user's credentials or settings were affected.
The old empty-feed logs cannot identify the original failed network operation.

## What the old document understates

| Workflow | Current implementation | Evidence |
| --- | --- | --- |
| Primary login and alts | OAuth and app passwords; saved DID identities; account switching reloads the application | `auth.ts:599`, `shell/shell.ts:578`, `providers/bluesky/bluesky-session.ts` |
| Home | Bluesky timeline and mixed-network aggregation exist. Local changes add visible failures, useful page diagnostics, and primary-network hidden-filter recovery | `providers/feed-aggregator.ts`, `providers/bluesky/bluesky-provider.ts`, `providers/bluesky/bluesky-home-feed.spec.ts` |
| Notifications | Local changes offer configured networks only, default to Both when appropriate, merge by date, keep independent cursors, and isolate failures | `pages/notifications/notifications.ts`, colocated specs |
| Profile editing | Bluesky-specific load/save paths, including profile record updates and image upload | `pages/settings/profile/settings-profile.ts:72`, `:145` |
| Delete/report | Own-post delete routes through `deleteRecord`; account/post reports have a Bluesky path | `status-card/status-card.ts:923`, `report-dialog/report-dialog.ts:61` |
| Bookmarks and self Likes | Native provider-routed libraries exist | `pages/bookmarks/bookmarks.ts:286`, `pages/favourites/favourites.ts:33` |
| Shared Follow and suggestions | FollowState separates Bluesky IDs and routes them through BlueskyGraph; the left rail uses that service | `follow-state.ts:105`, `:181`, `shell/left-rail/left-rail.ts:129` |
| AI translation | Bluesky cards are admitted by the template and receive the foreign-post AI translation path; this is not Mastodon server translation | `status-card/status-card.html:828`, `:876`, `status-card/status-card.ts:2019` |
| Thread retry | Both composer implementations retain completed records and stable record identities for retry | `compose/compose.ts:2670`, `pages/write/bluesky-publication.ts` |

These are implemented paths, not a claim that all protocol features or every
production failure mode have end-to-end coverage. Native quote publication is
still missing; suppressing the inappropriate quote control fixes correctness,
not feature parity.

## Priority findings

### P0 — Restore a connector's server together with its credentials

`Auth.switchTo()` updates the global Mastodon server when selecting a Mastodon
identity. `Auth.enterBluesky()` restores the selected DID's Mastodon connector
token but does not restore its server. `Server` loads the global
`mastodon_mock_server`; connector profiles separately store their own server.
The connection settings page updates both when initially configuring a connector,
but switching identities does not follow that same path.

Reproduction to automate: configure Bluesky identity A with a Mastodon connector
on server X; switch to a Mastodon identity on server Y; switch back to A.
The traced path combines A's connector token with the global server Y.
`serverInterceptor` selects that host and `authInterceptor` accepts it as the
selected instance. Consequently a connector token can be addressed to the wrong
server. This warrants immediate isolated reproduction and correction, including
switches between two Bluesky identities with different connector servers.

Evidence: `auth.ts:543`, `:599`, `server.ts:28`,
`providers/mastodon/mastodon-connector.ts:89`,
`pages/settings/connections/mastodon/connection-mastodon.ts:106`,
`server.interceptor.ts`, `auth.interceptor.ts`.

### P0 — Account settings can target the connector instead of the active identity

The generic auth guard permits Bluesky. `anonymousUnavailableGuard` only excludes
Anonymous. Privacy settings unconditionally call Mastodon `verifyCredentials`
and `updateCredentials`; Writing and posting-language settings only exclude
Anonymous. Their controls are not labelled as management of a separate Mastodon
connector account.

With no connector, the calls lack a usable Mastodon identity. With a connector
and the correct server, saving can change that Mastodon account's settings while
the application persona is Bluesky. Adding a token-presence check alone would
not solve that ownership problem. Route primary-account settings by identity;
put connector-account administration behind an explicit network/account label.

Evidence: `providers/anonymous/anonymous-route.guard.ts:7`,
`pages/settings/privacy/settings-privacy.ts:90`, `:120`,
`pages/settings/writing/settings-writing.ts:95`, `:126`,
`pages/settings/i18n/settings-i18n.ts:196`, `:282`,
and their templates and `app.routes.ts`.

### P1 — Conversations still makes unconditional Mastodon requests

`Conversations.load()` always calls Mastodon conversations and notifications,
and adds Bluesky as a third request when linked. Initialization also opens two
Mastodon streams without checking for a Mastodon credential. Streaming does not
itself refuse tokenless authenticated streams. Mastodon errors merely decrement
the loading counter; the Bluesky error path only exposes a chat-scope flag.
Other Bluesky errors can therefore look like an empty inbox.

Select configured networks before loading or opening streams; give each network
an error and retry state. The existing Bluesky chat adapter lists conversations,
reads/sends messages, updates read state, and gets logs. Starting a new Bluesky
conversation, request handling, and conversation management remain absent from
that adapter.

Evidence: `pages/conversations/conversations.ts:661`, `:700`,
`streaming.ts:57`, `providers/bluesky/bluesky-chat-api.ts`.

### P1 — Capability helpers give contradictory answers

`AnonymousCapabilities.canUseServerActions` returns true for every non-anonymous
identity, including Bluesky without a Mastodon token. Conversely,
`Auth.lacksMastodonToken` returns true for every Bluesky identity, including one
with a signed-in Mastodon connector. `MenuIndicators.syncStreams()` uses the
latter, excluding those readers from Mastodon indicator streams even though
Home and the locally updated Notifications can consume that connector.

Separate three decisions: which identity owns an account setting; which network
has usable credentials; and which provider owns a displayed post. Prefer small
domain adapters over one universal protocol interface.

Evidence: `providers/anonymous/anonymous-capabilities.ts:33`, `:71`,
`auth.ts:370`, `menu-indicators.ts:246`.

### P1 — Moderation settings still manage Mastodon

Bluesky profile mute/block actions exist, but the central muted/blocked-account
page, filter CRUD, follow-request page, and bulk actions remain Mastodon-backed.
Their anonymous-only guards do not supply Bluesky implementations. Users cannot
reliably review their Bluesky moderation state through those settings pages.

Add Bluesky mute/block list management first. Then introduce protocol-specific
content preferences and label controls. Do not map Mastodon domain blocks or
follow-approval settings to unrelated Bluesky concepts.

Evidence: `pages/settings/account-list/settings-account-list.ts:428`, `:649`,
`pages/settings/filters/settings-filters.ts:32`,
`pages/settings/follows/settings-follows.ts:40`,
`pages/settings/bulk-actions/settings-bulk-actions.ts:67`.

## Remaining feature work

| Area | Gap confirmed in current client | Suggested order |
| --- | --- | --- |
| Publishing | `BlueskyApi.post()` and both publishing paths omit `langs`; generated embeds are image-only. Native quote/external embeds, video publishing, and self-labels are not implemented there | Languages first, then native quote/link cards and media |
| Post actions | No Bluesky liked-by/reposted-by/quotes list methods, thread mute, or thread/post gate implementations in the provider layer | Actor lists and thread safety |
| Feeds/lists | Saved custom feeds, popular feeds, and curate lists are readable; `BlueskyFeeds` explicitly remains read-only. Saving/pinning/reordering and list/member CRUD are missing | Management before more discovery |
| Notifications | Combined reading is locally fixed; provider-native preferences and activity subscriptions remain missing; replies/quotes are flattened into mention rows | Preferences and clearer event types |
| Profiles/discovery | Core profiles/graph work; actor-created feeds/lists, native starter packs, known-followers views, and verification handling remain open | After correctness and daily-use workflows |

Do not count the mock-only email-notification settings component as production
Mastodon notification-preference parity. Do not assume every endpoint described
in the August document is currently available in every upstream deployment.

Upstream checks supporting the immediate implementation options:

- [Post lexicon](https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/app/bsky/feed/post.json): declares languages, self-labels, and the native embed variants. The client currently writes a narrower record.
- [Conversation initiation](https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/chat/bsky/convo/getConvoForMembers.json): declares a get-or-create one-to-one conversation operation.
- [Muted accounts](https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/app/bsky/graph/getMutes.json): declares authenticated enumeration of fully muted accounts.
- [Private preference writes](https://raw.githubusercontent.com/bluesky-social/atproto/main/lexicons/app/bsky/actor/putPreferences.json): declares preference updates. Any implementation must preserve unrelated preference entries.

These were checked on 2026-09-12 against the upstream repository. Lexicons show
schema support; production availability and OAuth permissions still need checking
when implementing each feature.

## Recommended next work and acceptance criteria

1. Fix and test connector host/token restoration, then account-setting ownership.
2. Apply configured-network loading, failure reporting, and capability checks to
   Conversations, indicator streams, and moderation routes.
3. Complete daily workflows: new DMs, moderation lists, languages, native quotes
   and link cards, and feed/list management.
4. Add Bluesky-native discovery, starter packs, verification, and richer chat.

For each domain, cover Mastodon-only; Mastodon plus Bluesky; Bluesky-only;
Bluesky with an anonymous Mastodon connector; and Bluesky with a signed-in
Mastodon connector. Include account switches across different servers/DIDs,
expired credentials, one failed network, and a late response after switching.

Assert the destination host, credential owner, and exact target record/account
on requests. A request succeeding is insufficient if it succeeds against the
wrong persona. Assert that a source failure is distinguishable from empty data,
and that unavailable protocol features are either explicitly explained or routed
to an appropriate provider-owned surface.
