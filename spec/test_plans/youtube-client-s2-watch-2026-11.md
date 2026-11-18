# YouTube client S2: the Watch page

Build: Mawkingbird Native and mawkingbird.com from the 2026-11-18 tree. Spec:
[YouTube client](../youtube-client.md), S2. Run [S1](youtube-client-s1-native-search-2026-11.md) first.

You need: Native on Windows; a Mastodon account signed in on both; a
post on your server that links a YouTube video and has a reply or two; a
hashtag in use for a show (for example #monsterdon on a Friday night). No
YouTube or Google account.

## Comment modes chosen by how Watch opened

- [ ] Open a YouTube post's **Watch**. The conversation opens on **Post replies**,
      and the toolbar shows Post replies · Hashtag · Replies + hashtag (plus YouTube on Native).
- [ ] Open a party from **Videos → Watch parties** (it has tags). The conversation
      opens on **Replies + hashtag**.
- [ ] Open a bare video (`/watch?youtube=<id>`). It opens on **Hashtag**, with an
      "Add hashtag" prompt.
- [ ] Choose Hashtag, then reload. The page goes back to the automatic choice, so
      nothing is remembered between visits.
- [ ] In Post replies, use a post's "add party tag". The view switches to Replies +
      hashtag so the tag's posts show up.

## YouTube comments (Native only)

- [ ] On Native, choose **YouTube**. Top comments load with author, age and likes, and
      the note says they're read-only.
- [ ] **More comments** loads another page. Nothing refreshes by itself while you watch.
- [ ] Add a Mastodon filter (Settings → Filters, context Threads) whose word appears in a
      comment: a *Hide* filter removes it, a *Warn* filter folds it with **Show**.
- [ ] **Quote in a post** opens the share sheet with “comment” — author, on YouTube, plus the link.
- [ ] On mawkingbird.com there is no YouTube mode.
- [ ] Help → Open logs: `youtube_read complete`, no `policy` failures.

## Under the player

- [ ] The source post's card sits under the player. Like, Boost, Quote and Bookmark
      work from it as on Home.
- [ ] **Subscribe to <channel>** (Native: from video details; web: from the post's
      link card) adds the channel to Videos' subscriptions. Pressing it again unsubscribes.
- [ ] **Share** opens the composer with the title, `youtu.be` link and, in a
      party, the hashtag. Posting it works; Cancel discards.
- [ ] Native: **About this video** shows the length, the description and, for a video
      with chapters, chapter times. A chapter link cues the player there and leaves it paused.
- [ ] Native: an age-restricted video says YouTube marks it not suitable for all ages.
- [ ] Bare video, signed in: **Find posts about this video** lists posts on your server
      that share it (or says none turned up). "Watch with its replies" opens one.
- [ ] Native: a failed YouTube search no longer says "Check your Plus account".

## Findings

_Date, build, what went wrong._
