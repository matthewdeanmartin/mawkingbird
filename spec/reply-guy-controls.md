# Reply-guy controls

Owner request, 2026-11-21. Mastodon ships many defences against quotes and
almost none against replies: anyone the reader never chose to hear from lands
in their notifications and sits beside friends under their posts. This feature
works on Mastodon, Bluesky and Misskey.

## Definition (owner decisions)

- A **reply guy** is someone the _recipient does not follow_. Following is the
  signal "I want to interact with this person". Whether they follow back does
  not matter: mutuality is a double signal and is not used here.
- The same rule runs both ways. It defends the reader against people _they_
  don't follow, and warns the reader before they reply to or quote someone who
  doesn't follow _them_.
- Content-warning **trust** (Settings → Trust: CW/Sensitive) is a different
  question ("I trust this person's CW judgement"). It never opens a reply-guy
  guard, and reply-guy settings never change trust.
- The default protection adds one click; it never hides anything. Removing
  people completely is opt-in, in Wellness, and is in no preset.
- Copy says "you don't follow" / "doesn't follow you", never "non-mutual". The
  tone is a heads-up, not an accusation, and says no more than that (the
  warnings dropped "They'll still be notified…", owner 2026-11-21).
- **Second-degree replies are the mosh pit** (owner, 2026-11-21). Joining
  someone else's busy thread, or adding a hashtag to your own post, invites
  strangers in; their replies show normally there. The guard, the pile-on fold
  and the Wellness hide switch apply only when a stranger _starts_ something:
  a reply in a conversation you began without a hashtag, or a fresh mention or
  quote that isn't part of anyone's thread (a quote of your own tagged post
  was invited). The chip still shows everywhere: it is information.
- No profile-level "you don't follow · they follow you" line: the profile's
  Follow/Mutuals button already says it (owner, 2026-11-21).

## What shipped

| Surface                                       | Behaviour                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thread, any reply                             | Muted dashed `MbBadge` chip "you don't follow" after the handle. Not on the thread root or the root author's own replies.                                                                                                                                                                                                                                             |
| Thread I started, untagged                    | Strangers' replies anywhere in it: chip, plus a **virtual content warning**: "Reply from someone you don't follow" + Show. The focused post is never guarded (the reader opened it). The thread-wide CW toggle and CW trust do not open it. Threads I joined, and my tagged ones, get chips only.                                                                     |
| Pile-on fold, same threads                    | Three or more stranger replies fold into one plain row at the end, "N replies from people you don't follow" + Show (an outline `MbButton`, not a tab or pill). Only whole stranger branches fold: one post by me, someone I follow, or someone not yet looked up keeps its branch in place. Show brings them back where they were, tagged but not guarded one by one. |
| Notifications (mention / reply / quote types) | Chip on every stranger. The excerpt waits behind "From someone you don't follow" + Show only when the stranger started something (see the mosh-pit rule); `ConversationOrigins` finds the conversation's root.                                                                                                                                                        |
| Quotes list of my own post                    | Chip; the excerpt waits behind "Quote from someone you don't follow" + Show, unless the quoted post has a hashtag.                                                                                                                                                                                                                                                    |
| Replying to someone who doesn't follow me     | `MbNotice` beside the translated-post warning: "Heads up: @handle doesn't follow you." Status-card inline reply, thread reply box, photo view (both reply boxes).                                                                                                                                                                                                     |
| Quoting someone who doesn't follow me         | The same notice. Quote dialog (Mastodon/Bluesky) and the Misskey inline quote.                                                                                                                                                                                                                                                                                        |
| Settings → Wellness                           | New section "Replies from people you don't follow" with the click-through switch (`ClientPrefs.replyGuyCw`, **on** by default). New protection `hideReplyGuys` ("Hide replies from people I don't follow"): removes their replies, mentions and quotes from notifications and keeps them from lighting the unread dot. In no preset.                                  |

## How it works

- `accounts/reply-guys-model.ts`: pure. `ReplyGuyMode` (`off`/`chip`/`guard`),
  `hasHashtags` (status tags, or rendered hashtag links for Bluesky),
  `isMyQuietConversation` (root is mine and untagged), `threadReplyGuyMode`,
  `collapsibleReplyGuys` (the pile-on fold), `isIncomingConversation`.
- `accounts/conversation-origins.ts`: for notifications, which carry only the
  reply. A fresh mention or quote answers at once. A Bluesky reply names its
  root's author, so someone else's thread costs nothing. Otherwise one lookup
  per stranger's reply: Mastodon `/statuses/:id/context`, Bluesky `getPosts`
  for my own root, Misskey `notes/conversation`. Until answered, or on failure,
  the reply counts as the mosh pit: shown, never guarded or hidden.
- `accounts/reply-guys.ts`: `ReplyGuys.iFollow` / `followsMe` return `null`
  when there is no answer: signed out, the reader's own account, a network
  without a session, or a lookup in flight or failed. Every surface acts only
  on a definite `false`, so a failure fails open. The worst case is one
  unguarded render, and friends never get a stray click in front of them.
  Lookups are coalesced per tick and asked once per account.
- Answers come from `FollowState`, so following someone anywhere lifts their
  guards at once. Bluesky authors carry `viewer.following/followedBy`, now
  adapted onto `Account.viewerFollows/followsViewer`, so they cost no request.
  Misskey gained `MisskeyApi.relations` (`users/relation` with an id array),
  batched by `FollowState`.
- Feed cards default to `off` and make no lookups. The warning's lookup runs
  only while a reply or quote composer is open.

## Fixes found on the way

- `FollowState` never reset on an account switch (nothing called `reset()`),
  so one account's "following" could leak into the next. Reads now answer
  "unknown" for another account's data, and the next fetch or write drops it.
  Reads never write signals, so this is safe inside a `computed`.

## Known limits

- Mastodon notification grouping only collapses engagement types, so grouped
  rows carry no chip. Mentions are never grouped.
- With `hideReplyGuys` on, a stranger's first streamed mention can still light
  the unread dot once, before their relationship is known. The server's unread
  marker is ignored under this switch, as it already is under Limited
  notifications.
- Anonymous readers get none of this: nobody can reply to them, and there is
  no "follows you" to ask.
- Misskey ids in Mastodon-backed views are never sent to Mastodon's
  `/relationships`; remote read-only Mastodon statuses are excluded.

## Evidence (2026-11-21, part 2: mosh-pit rule, fold, shorter warnings)

- Narrowed specs for accounts, thread, status card, notifications, shell and
  the quotes list: 168 files, 1,893 tests green. `make test-changed`: 69 files,
  1,184 tests green.
- `check:i18n`, `check:static`, `check:dead-code`, `design:inventory-check`
  green (inventory regenerated and reviewed; note in 06-consolidation.md).
- `build:mockingbird` green. Initial total 942.26 kB (+0.32 kB for the root
  lookup reaching the shell's unread dot); still over the 900 kB warning
  budget, as before this feature.
- Not run: full `make test`, `make design-verify`, SEO and integration suites.

## Evidence (2026-11-21, part 1)

- Narrowed specs for the changed areas: 37 files, 653 tests green.
  `make test-changed`: 886 files, 10,757 tests green.
- `npm run check:i18n`, `npm run check:static`, `npm run design:inventory-check`
  green (inventory regenerated and reviewed; note in
  design_system/audits/06-consolidation.md).
- `content-links` design browser file (renders Notifications): 4 passed.
- `npm run build:mockingbird`: green. Initial total 941.94 kB. That is over the
  900 kB _warning_ budget, but a probe build without the shell import measured
  the same 941.94 kB: this feature adds nothing to the initial bundle.
- Not run: full `make test`, `make design-verify`, SEO and integration suites
  (two-sprint cadence; owner pushes and GHA runs them).
- Manual plan: spec/test_plans/reply-guy-controls.md.
