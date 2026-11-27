# Video inventory: YouTube vs Fedi Video

Owner decision, 2026-11-27: the old Video mode is two apps in the switcher.

- **YouTube** (mode id `video`, kept so a tab's remembered mode still works): a
  YouTube client whose comments are Mastodon (watch parties).
- **Fedi Video** (mode id `fedivideo`): video posted on the fediverse. It is
  sometimes YouTube, but often PeerTube, attachments and other embeds. You find
  it through posts and comment on it from Mastodon.

The two overlap on purpose. Watch and Search serve both, and a page links across
where it helps. Videos and Watch parties are no longer rows in the … menu.

## Surfaces

| Surface               | Route                                | App           | What it is                                                                                                |
| --------------------- | ------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------- |
| Subscriptions         | `/videos`                            | YouTube       | Subscribed channels (RSS), plus videos people you follow shared                                           |
| Channel               | `/videos/channel/:id`                | YouTube       | One channel: subscribe, and its creator on Mastodon                                                       |
| Creator kits          | `/videos/starters`                   | YouTube       | YouTubers on Mastodon, double subscribe                                                                   |
| Queue                 | `/videos/queue`                      | YouTube       | Watch queue and history                                                                                   |
| Saved                 | `/bookmarks?view=video`              | YouTube (tab) | Bookmarks with video. `/bookmarks` keeps your current app                                                 |
| YouTubers card        | left rail, and `/videos`'s own panel | YouTube       | Moved out of the right rail, where it sat below the fold                                                  |
| Video posts           | `/videos/fedi`                       | Fedi Video    | Home's timeline in its Video view                                                                         |
| Watch parties         | `/videos/parties`                    | Fedi Video    | Hashtag finder for parties                                                                                |
| Search                | `/videos/search`                     | both          | Fediverse video posts, plus YouTube (Plus or Native)                                                      |
| Watch                 | `/watch`                             | both          | Keeps the video app you are in. From outside: `?post=` opens in Fedi Video, a bare `?youtube=` in YouTube |
| Lite videos           | `/m/videos`                          | Lite          | Unchanged                                                                                                 |
| Public YouTuber pages | `youtuberRoutes`                     | public        | SEO pages, unchanged                                                                                      |

`modeForUrl` in `ui/src/app/platform/build/app-mode.ts` is the source of truth
for which app a URL belongs to.

## Watch party without a post

A YouTube video from RSS or a subscription has no Mastodon post to gather
replies under. Before this change, chat fell back to a hashtag, and every message
was a public post with no context in followers' home feeds.

Now, signed in with Mastodon:

1. The first message goes out as a **public share post**: your text, the video
   link and the party's hashtag, if there is one.
2. That post becomes the party's root. Watch adds `post=` and `server=` to the
   address without reloading, so the video keeps playing and the URL is the
   party's link.
3. Every later message is an **unlisted reply** to the root, without the
   hashtag. This applies to every party with a post, not only new ones: replies
   stay out of public and hashtag timelines, and their context is the post they
   answer.

## Native

No new endpoint, host or method: the share post and replies use the existing
`POST /api/v1/statuses`, and replies are read with the existing `context` call.
