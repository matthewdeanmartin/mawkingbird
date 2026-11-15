# Sprint 3: author controls and quotes

Written for: Bluesky parity sprint 3 (2026-11-02). Status: not run.

## Setup

Signed in with **Mastodon M** plus a Bluesky connection to **Bluesky A**
(this also checks the ownership fix). **Bluesky B** on bsky.app in another
browser.

## Steps

### Reply and quote limits

- [ ] 1. Compose a new Bluesky post. Press 🛡️, choose "Only some people" →
      "My followers", quotes "Nobody", Apply. 🛡️ shows as pressed. Post.
- [ ] 2. On bsky.app the post shows replies limited to followers and quoting off.
- [ ] 3. As Bluesky B (not a follower), the post can't be replied to or quoted
      on bsky.app.
- [ ] 4. In Mawkingbird as Bluesky B (if you can sign in as B), Reply is
      disabled with "The author limits who can reply to this post", and Quote
      is missing from the 🔁 menu.
- [ ] 5. Reply to someone's post: 🛡️ is not offered (Bluesky only allows reply
      limits on a thread's first post).
- [ ] 6. On an older post of yours: ••• → **Reply and quote controls…**. The
      dialog shows the current settings. Set Everyone / Anyone and Apply. On
      bsky.app the limits are gone.
- [ ] 7. On bsky.app, limit a post's replies to a list. In Mawkingbird, open
      the controls: it mentions the list. Change quotes only; the list rule is
      still there on bsky.app.

### Ownership

- [ ] 8. Your own Bluesky posts (as Mastodon M with the connector) show Delete
      and 📌, and ••• has **Reply and quote controls…**.

### Hide replies

- [ ] 9. As Bluesky B, reply to one of your threads. In Mawkingbird, open that
      reply's ••• → **Hide this reply in my thread**. On bsky.app the reply is
      under "hidden replies".

### Pinned post

- [ ] 10. Press 📌 on one of your Bluesky posts. Your profile in Mawkingbird
      shows it first, marked pinned, and not twice. bsky.app shows it pinned.
- [ ] 11. Pin a different post: the first is no longer pinned (one pin).
- [ ] 12. Edit your profile bio on bsky.app, then pin from Mawkingbird: the
      bio is unchanged.

### Quotes

- [ ] 13. Quote one of your Bluesky posts as Bluesky B. Your post now shows
      "❝ 1"; tap it to see the quote.
- [ ] 14. Choose **Detach**. On bsky.app, B's quote shows your post as removed.
      **Reattach** restores it.
- [ ] 15. A Mastodon post quoted on a 4.5 server shows its quote count after ❝
      and lists the quoting posts.

## Findings

_None yet._
