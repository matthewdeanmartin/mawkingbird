# Reply-guy controls

Owner request, 2026-11-21. Mastodon ships many defences against quotes and
almost none against replies: anyone the reader never chose to hear from lands
in their notifications and sits beside friends under their posts. This feature
works on Mastodon, Bluesky and Misskey.

## Definition (owner decisions)

- A **reply guy** is someone the *recipient does not follow*. Following is the
  signal "I want to interact with this person". Whether they follow back does
  not matter: mutuality is a double signal and is not used here.
- The same rule runs both ways. It defends the reader against people *they*
  don't follow, and warns the reader before they reply to or quote someone who
  doesn't follow *them*.
- Content-warning **trust** (Settings → Trust: CW/Sensitive) is a different
  question ("I trust this person's CW judgement"). It never opens a reply-guy
  guard, and reply-guy settings never change trust.
- The default protection adds one click; it never hides anything. Removing
  people completely is opt-in, in Wellness, and is in no preset.
- Copy says "you don't follow" / "doesn't follow you", never "non-mutual". The
  tone is a heads-up, not an accusation.

## What shipped

| Surface | Behaviour |
| --- | --- |
| Thread, any reply | Muted dashed `MbBadge` chip "you don't follow" after the handle. Not on the thread root or the root author's own replies. |
| Thread, replies below one of my posts | Chip, plus a **virtual content warning**: "Reply from someone you don't follow" + Show. The focused post is never guarded (the reader opened it). The thread-wide CW toggle and CW trust do not open it. |
| Notifications (mention / reply / quote types) | Chip; the excerpt waits behind "From someone you don't follow" + Show. |
| Quotes list of my own post | Chip; the excerpt waits behind "Quote from someone you don't follow" + Show. |
| Replying to someone who doesn't follow me | `MbNotice` beside the translated-post warning: "Heads up: @handle doesn't follow you. They'll still be notified of your reply." Status-card inline reply, thread reply box, photo view (both reply boxes). |
| Quoting someone who doesn't follow me | The same notice with "…of your quote." Quote dialog (Mastodon/Bluesky) and the Misskey inline quote. |
| Settings → Wellness | New section "Replies from people you don't follow" with the click-through switch (`ClientPrefs.replyGuyCw`, **on** by default). New protection `hideReplyGuys` ("Hide replies from people I don't follow"): removes their replies, mentions and quotes from notifications and keeps them from lighting the unread dot. In no preset. |

## How it works

- `accounts/reply-guys-model.ts`: pure. `ReplyGuyMode` (`off`/`chip`/`guard`),
  `belowMine` (walks `in_reply_to_id` to find replies under the reader's
  posts), `threadReplyGuyMode`, `isIncomingConversation`.
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

## Evidence (2026-11-21)

- Narrowed specs for the changed areas: 37 files, 653 tests green.
  `make test-changed`: 886 files, 10,757 tests green.
- `npm run check:i18n`, `npm run check:static`, `npm run design:inventory-check`
  green (inventory regenerated and reviewed; note in
  design_system/audits/06-consolidation.md).
- `content-links` design browser file (renders Notifications): 4 passed.
- `npm run build:mockingbird`: green. Initial total 941.94 kB. That is over the
  900 kB *warning* budget, but a probe build without the shell import measured
  the same 941.94 kB: this feature adds nothing to the initial bundle.
- Not run: full `make test`, `make design-verify`, SEO and integration suites
  (two-sprint cadence; owner pushes and GHA runs them).
- Manual plan: spec/test_plans/reply-guy-controls.md.
