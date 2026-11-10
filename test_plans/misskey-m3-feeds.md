# Misskey M3 (part 2): feeds and live updates

Written for: roadmap sprint M3, second half (2026-11-10). Status: not run.
Roadmap: `sprint/misskey-and-language-learning-roadmap-2026-11.md`.

## Setup

Your misskey.design account. On misskey.design itself, make one antenna, one
list and one clip (with a note in it) and follow a channel, so each section
has something to show. Optionally a Bluesky-only account (no Mastodon
connector) and the Misskey visitor.

## Steps

### Only feeds that can work

- [ ] 1. Signed in with Misskey, open Feeds: the categories are Timelines,
      Antennas, Misskey lists, Channels, Clips, then Other servers, RSS,
      Videos (and Twitter if switched on). No Mastodon lists, followed tags,
      server feeds, collections, endorsements or Bluesky sections.
- [ ] 2. "All feeds" shows the same set, and nothing on the page shows a
      Mastodon error.
- [ ] 3. Signed in with Bluesky only (no Mastodon connector): Feeds no longer
      offers the Mastodon sections. With the connector on, they come back.
- [ ] 4. Signed in with Mastodon or Anonymous: Feeds is as before (no
      Misskey sections).

### Misskey feeds

- [ ] 5. Timelines: Home, Social, Local, Global each open Home on that timeline.
- [ ] 6. Antennas, Misskey lists, Clips: yours are listed; each opens a page
      of its notes with **Load more**; "Manage on misskey.design" opens the
      server's own page for making and editing them.
- [ ] 7. Channels: "Channels you follow", favourites (if any), and "Featured
      on misskey.design". A channel page shows its description and notes.
- [ ] 8. On a channel page: the first time, **Allow following channels**
      (your sign-in is from before this was asked); approve on Misskey, come
      back, then **Follow channel** / **Unfollow channel** work.
- [ ] 9. As the Misskey visitor: Timelines and featured channels only;
      Antennas, lists and clips say they need an account.

### Live updates

- [ ] 10. Settings → Blue → Auto-refresh timeline on. Home on Local: new notes
      appear at the top as they are posted, without refreshing.
- [ ] 11. Switch Home to Global (or Home): the live updates follow the switch.
- [ ] 12. Visitor on Local: live updates work without an account (unless the
      server turned that off). Following has no live updates (by design).
- [ ] 13. Auto-refresh off: no more live notes.

## Not in M3

Posting into a channel, creating or editing antennas/lists/clips in-app
(the server does that), live updates on antenna/list/channel pages, and
Misskey feeds as Home favourite-feed sources.
