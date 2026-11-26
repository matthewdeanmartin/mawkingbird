# Inbox views (November 2026)

Status: implemented · 2026-11-26, one sprint. Manual plan:
[test_plans/inbox-views-2026-11.md](../test_plans/inbox-views-2026-11.md).

## Why

The compact inbox (2026-11-22) made a raw event stream smaller, not more
useful. "Line goes up" (likes and boosts) still flooded out conversations and
new people, and the digest rows dropped the faces that let you spot familiar
mutuals.

## Owner decisions (2026-11-26)

- **Views, not filters:** `Conversations | Stats | Who | Stream`, an underline
  tab strip (`mbNavigation presentation="tabs"`, routed by `?tab=`). Each is its
  own page. The Inbox always opens on **Conversations**: the extra click is
  deliberate friction against reading the inbox as a flood.
- **The existing filters stay and apply to every view:** network, from
  (all / following / followers / mutuals / not following) and the type picker,
  which now lists only the kinds in the open view.
- **Conversations:** mentions, replies and quotes, plus what needs you: follow
  requests, polls that ended, edits, moderation and report notices, lost follows.
- **Stats:** likes and boosts, post by post, always open, with a row of faces
  (up to 12, then "and N more") and "+N" since last read.
- **Who:** follow requests, new followers with faces, and accounts new to you
  (the old "Accounts New to Me" view, now a section; Mastodon only, as before).
  Admin sign-ups land here too.
- **Stream:** everything, as it arrived, with the light per-post grouping the
  inbox had before the digest.
- **Inbox dot:** only Conversations and Who light it. Likes, boosts and
  subscribed-post alerts never do. The live stream is filtered by type; the
  server's marker only gives a count, so when it reports unread notifications
  one request asks for the newest Conversations-or-Who notification and lights
  the dot only if it is past the marker. If that request fails, the count is used
  as before. Each tab shows its own quiet "+N".
- Wellness "limited notifications" still removes likes, boosts and follows; the
  Stats tab is hidden then.

## As built

- `feeds/notifications/inbox-scenarios.ts`: which types belong to which view,
  which may light the dot, and the Mastodon `types[]` for the marker check.
- `notifications.ts/html`: the `tab` signal follows `?tab=`; the old
  `view` switch and the digest expand state are gone; the row list is one
  template shared by Conversations, Stream and Who's requests.
- `shell/menu-indicators.ts` and `feeds/home/read-markers.ts`: the dot rule.
- Native: the marker check is an ordinary signed-in `GET /api/v1/notifications`
  with `types[]`, which Native already passes through.
