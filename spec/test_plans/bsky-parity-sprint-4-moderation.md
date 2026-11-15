# Sprint 4: Bluesky moderation

Written for: Bluesky parity sprint 4 (2026-11-03). Status: not run.

## Setup

**Bluesky A** linked to Mawkingbird (try both ways in: as a Bluesky-first
account, and as Mastodon M with the Bluesky connector). bsky.app open as
Bluesky A in another tab, to compare settings. **Bluesky B** to post test
content.

## Steps

### The page

- [ ] 1. Settings sidebar, People group: **Bluesky moderation** sits under
      Muted & Blocked. It also appears for an Anonymous account with a Bluesky
      connector.
- [ ] 2. With no Bluesky linked, the page says so and links to the Bluesky
      connection.
- [ ] 3. It matches the other new settings pages: page header, sections,
      fields and buttons in the shared style, at desktop and phone width, in
      light and dark.

### Muted words

- [ ] 4. On bsky.app, mute a word. Reload Mawkingbird: the page lists it.
- [ ] 5. In Mawkingbird, mute "testword" (text and tags, until removed). On
      bsky.app → Settings → Moderation → Muted words, it is listed. Nothing
      else in bsky.app's settings changed (saved feeds, content filters).
- [ ] 6. As Bluesky B, post "this has testword in it". In Mawkingbird's Home,
      the post is collapsed with "Filtered: testword" and a way to show it.
- [ ] 7. Mute "#testtag" as tags only. B posts "testtag" (plain) and "#testtag":
      only the hashtag post is collapsed.
- [ ] 8. Mute a word "not from people I follow". A followed account's post
      with it stays visible; a stranger's is collapsed.
- [ ] 9. Mute for 24 hours: the entry says "until <date>".
- [ ] 10. Remove a word: the post it collapsed is visible again without a
      reload.
- [ ] 11. Your own post containing a muted word is never collapsed.

### Moderation lists

- [ ] 12. Find a public moderation list on bsky.app. Paste its address,
      choose "Mute everyone on it", Subscribe. It shows as a Mute list with
      its creator. bsky.app shows you subscribed.
- [ ] 13. Subscribe to another as "Block everyone on it". Someone on it is
      blocked on bsky.app.
- [ ] 14. Unsubscribe both. bsky.app agrees.
- [ ] 15. Paste a non-list address: a clear error in that section only.

### Moderation services

- [ ] 16. Add a moderation service by handle (a known labeler). It is listed
      by name. bsky.app shows the subscription.
- [ ] 17. A post that service labels as adult or graphic now shows covered in
      Mawkingbird (may need a reload).
- [ ] 18. Add an ordinary account's handle: refused, "not a Bluesky
      moderation service".
- [ ] 19. Remove the service; bsky.app agrees.

### Mute thread

- [ ] 20. On a busy thread's post, ••• → **Mute notifications from this
      thread**. The menu then offers Unmute. Replies in that thread stop
      notifying you (check bsky.app's notifications too).

## Findings

_None yet._
