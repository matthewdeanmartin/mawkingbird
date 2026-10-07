# Watch Parties: shared video with live hashtag conversation

Status: temporary Watch hashtags implemented; full room features remain proposed · 2026-10-07.

Owner update: Watch supports Add hashtag to party and add-from-post buttons.
Hashtag posts mix with comments, deduplicate across tags, and retain moderation
and warning gates. Tags last only for this Watch visit; changing video, leaving,
or switching accounts releases requests and streams. No follow/subscription or
durable room is created. Mastodon tag streaming is supplemented by bounded
refresh and explicit paging. A visit accepts up to eight tags and retains up to
200 posts per tag; older paging stops at that bound. Ignore Party is deferred
at the owner's request. The Ignore Party proposals below describe future scope.

Instead, a post's more menu offers Mute #tag, opening a reviewable Mastodon
account filter dialog with contexts, expiry, warn/hide, and whole-word choices.
Opening/canceling writes nothing; submitting explicitly creates a standard
[Mastodon keyword filter](https://docs.joinmastodon.org/methods/filters/).

Build after [video playback/Watch](video-player.md). Account browsing defaults
are specified in [focus modes](media-focus.md).

## Pitch and phases

Turn Watch into a shared place: a video, a named event, live conversation, and
topics appearing as people discuss them. Start with an ordinary shareable page
backed by Mastodon hashtags. That works without building a new chat service.

Owner decision: shared video and live conversation first. Call the first
version “Watch Party — independent playback.” Watching the same video does
not mean everyone is at the same second. Host-controlled playback is a
separate phase with an authoritative real-time service.

Owner decision: default to the broad event hashtag, such as
`#PresidentialDebate2028`, so people share the event conversation. Unique
session tags may be offered as an optional refinement, not the default.

## Mastodon visibility: the key constraint

Owner clarification: followers should be able to ignore the creator's Watch
Party without manually adding a mute word, while continuing to follow normal
posts. Recommend a one-click **Ignore this Watch Party** action in Mawkingbird.
This is a reader-controlled preference, not a new posting visibility. A
separate party account is an alternative, not the required product workflow.

There is no standard visibility that sends a post to a public hashtag party
while withholding it from the author's followers' Home feeds. Quiet
public/unlisted hides posts from public discovery but still delivers to
followers. Followers-only and direct mentions also cannot provide an open
hashtag room. Replies have special Home-feed rules, but are not a dependable
party-only audience setting, particularly with followed public hashtags.
[Mastodon posting and reply visibility](https://docs.joinmastodon.org/user/posting/).

Distinguish three requests:

| Request | Feasible approach | Limit |
| --- | --- | --- |
| Hide a party from my own Home | Account-scoped Mawkingbird exclusion for its exact party hashtag | Affects this client, not delivery to anyone else |
| Hide it from my Home in other clients too | Optional Mastodon Home-context keyword filter, created explicitly | Client/version semantics differ; Home context also covers lists; matching is keywords rather than our exact tag classifier |
| Keep my party commentary away from followers of my normal account | Use a separate party account, optionally with Video focus | People following the party account still receive its posts |

Mastodon filters support selectable contexts and warning/hiding behavior;
the server-filter option needs capability/scope checks and integration testing
before it is promised. Start with the predictable local exclusion.
[Mastodon filters API](https://docs.joinmastodon.org/methods/filters/),
[filter contexts](https://docs.joinmastodon.org/user/moderating/).

If “party posts must never reach followers' Home” is a hard requirement for
the same account, the hashtag MVP cannot meet it. That would require separate
room messages outside ordinary Mastodon statuses, with their own service,
access model, and moderation. Do not add a pretend `party` visibility option.

## Starting a party

1. Open Watch and select Start Watch Party.
2. Show a small setup form with title, primary hashtag, video source, and the
   account that will post. Suggest a tag; let the creator edit it.
3. Default to a broad event tag such as `#PresidentialDebate2028`. Optionally
   offer a unique session tag such as `#PresidentialDebate2028AliceA7K2`.
   Explain that a broad tag joins the public event conversation and can contain
   unrelated posts.
4. Create a shareable page/link. Merely creating or opening it does not publish,
   follow a hashtag, change visibility, or subscribe to external playback.
5. Offer a separate, editable invitation draft containing the video link,
   party link, and hashtag. The user publishes it through normal composition.

A hashtag is not registered or owned. The first public tagged post begins to
populate the conversation; there is no Mastodon “create hashtag room” endpoint.
A unique session tag reduces collisions but is still public, guessable, and
not an access-control mechanism. Broad event discussion and a specific host's
session must not be presented as identical membership.

## Party identity and sharing without a room backend

Proposed route: `/watch-party` with a versioned, validated descriptor identifying
the video, primary tag, title, and conversation server. Reuse the source rules
from Watch. A signed-in viewer reads/posts through their own home server; an
anonymous visitor can use the disclosed public conversation server where
supported. Display which server's known posts are being shown.

The share URL carries enough context to reopen on another device without a
browser-local room record. For uploaded video, identify its status and
attachment; resolve through normal access checks. Private attachments do not
become public through sharing a party link. YouTube sources use validated IDs.
Limit descriptor size and reject unsupported versions and malicious sources.
No credentials in the descriptor. URL titles and host names are untrusted
display data, not proof of ownership.

An invitation status permalink may anchor the creator's identity after normal
resolution. It is not a cryptographically controlled room. MVP descriptors
are immutable: changing source/tag creates a new link, not a silent update to
every participant. Mutable room metadata and verified host powers need the
later backend phase.

## Party screen and live conversation

Desktop: player and source context on one side; live posts and composer on the
other. Mobile: player above the conversation; optional compact sticky player
only after user playback. Keep player controls usable while scrolling.

Use the existing hashtag REST timeline for initial/history pages and existing
`Streaming` hashtag support for live updates. Deduplicate by provider/server
identity and status identity, handle edits and deletes, and backfill after
reconnect. If streaming is unavailable, offer rate-aware polling with a visible
status and pause it when the page is hidden. Polling interval and reconnect
limits are implementation tuning decisions.
[Mastodon streaming API](https://docs.joinmastodon.org/methods/streaming/).

Do not move the conversation under someone reading older posts. Show a new
posts counter; offer explicit Follow live. Keep the player position independent
of conversation scrolling. Explain that federated hashtag views contain posts
known to the selected server, with delays and incomplete remote coverage; do
not imply a global complete room or a live participant count.

The composer visibly includes the primary tag and accounts for its length.
Replies also include it if the user wants them in the party timeline. Additional
tags are optional. Display the active posting account and real visibility.
Public is required for open hashtag discovery, but never silently widen a
private/direct reply or override an account's more restrictive default. If the
selected visibility cannot appear in the open party, say so and let the user
decide. Leaving the party restores normal composer defaults. Anonymous users
may watch/read; posting requires a supported authenticated account.

## New hashtags as the event unfolds

Derive Related topics from tags in incoming, visible party posts, excluding
the primary tag. Initial proposal: count distinct visible authors in a rolling
ten-minute window and show at most eight tags, normally requiring two authors.
Tune these numbers with actual usage; they are not protocol requirements.
Ignore blocked/filtered posts and undo counts after relevant edits/deletions.

These are topics in the observed party conversation, not global trends, verified
events, transcript detection, or host endorsements. Selecting a topic opens
ordinary tag browsing or adds an explicit conversation filter while keeping the
video. It does not retag a draft or replace the primary party hashtag.

## Excluding a party from Home

Provide **Ignore this Watch Party** on the creator's invitation and party
commentary, with Undo and a reversible management list. Followers never have
to type a hashtag or visit keyword-filter settings. The normal follow remains
intact; ordinary posts from the creator remain visible.

For the creator-specific action, match the underlying author's canonical
identity plus the normalized party/session tag from status metadata. Resolve
the author through normal provider data, not a host name asserted in a share
URL. Include boosted copies of matching posts. If only a broad event tag is
available, describe the narrower action as **Ignore this person's posts about
#PresidentialDebate2028**; that hides their tagged event commentary, since we
cannot distinguish two of their sessions using the same tag.

Separately offer **Hide the whole party from Home** on the party page, matching
the exact session tag across all authors. With a broad event tag, this hides
all matching event posts, not just one host's session. Unique session tags
make both actions more precise without requiring the follower to manage tags.

These exclusions apply in Home only. They do not hide the dedicated party,
profile, tag timeline, or notifications. Respect existing moderation on every
surface; the dedicated party bypasses only these new Home-specific exclusions.

Scope exclusions to the active account, with expiry options such as Until tomorrow or
Until I restore it. Persist through the storage registry. Let a reader choose
one from a party page or tagged post without joining the party. Hosts cannot
apply it to other people's feeds. Every party comment must carry its primary
tag for reliable recognition; untagged ordinary statuses cannot be reliably
identified as party commentary.

Initial support is local to Mawkingbird. Mastodon, Elk, Phanpy, and other
clients do not automatically understand this preference. An optional future
cross-client shortcut could create a server keyword filter on the follower's
behalf, but that is still a keyword filter underneath and cannot exactly
express author-plus-session matching. Do not promise the same behavior across
clients or silently create that filter. A portable per-party ignore mechanism
without keyword filters would require server/protocol support or separately
stored room messages.

## Moderation and safety of the room model

Reuse existing block, mute, report, sensitive-media, content-warning, and
server-filter behavior. Give users conversation pause and local hide controls.
A public hashtag has no owner who can delete other people's posts or expel
them across servers. A creator's local hide is not room-wide moderation.
Present those limits plainly when choosing an open event tag; private rooms
and enforceable host moderation need a different service and access model.

## Later: synchronized playback

Keep room timing out of federated posts. Playback commands need an authoritative
room service with room ID, authorized host/controller, monotonic sequence,
source ID, play/pause state, media position, playback rate, and server timestamp.
Clients estimate the current position, correct material drift, reconnect, and
offer Return to live after temporarily seeking on their own. Host changes,
late joiners, unavailable media, buffering, and autoplay denial need explicit
behavior. Live streams have different DVR windows and cannot promise identical
latency across providers/viewers.

Native uploads and YouTube's documented IFrame API can be adapters for timing
control. An embed's supported rate/seek capabilities constrain synchronization;
do not promise frame-perfect playback or bypass provider restrictions. Backend
hosting, authentication, retention, room moderation, and cost remain open
architecture decisions. The independent-playback MVP needs none of that service.

## Implementation acceptance and open decisions

Verify share links on another browser/account, source authorization, invalid
descriptors, explicit invitation publishing, composer tag length and visibility,
account switching, moderation, Home-only exclusions, continued visibility of
the creator's ordinary posts, creator-specific versus whole-party matching,
boost handling, Undo/expiry, stream edits/deletes,
disconnect/backfill, missing streaming, rate limits, and rolling topic counts.
Manually exercise two accounts on different instances and an anonymous viewer;
test that a server's incomplete hashtag view is accurately described. Run the
contributor tests/build and bundle-size gates at implementation time.

Confirmed: independent playback with live conversation first, and personal
account browsing defaults. Owner requirement: followers can ignore a Watch
Party without manually adding mute words. Proposed implementation: a one-click
Mawkingbird preference, preserving the normal follow. Cross-client support
without keyword filters is unavailable with standard Mastodon APIs. Confirmed:
broad event hashtags are the default; unique-session tags are optional. With
that default, creator-specific ignoring means hiding that creator's posts
carrying the event tag, not identifying an isolated session. Public account
focus hints are outside scope.
No tests/build were run for this planning-only change.
