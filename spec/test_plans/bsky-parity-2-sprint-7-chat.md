# Bluesky parity 2, sprint 7: chat (and the end of app passwords)

Written for: spec/bsky_parity.md sprint 7 and app-password phase 2
(2026-11-21). Status: not run.

## Setup

**Bluesky A** in Mawkingbird (Bluesky-first); **Bluesky B** and **C** on
bsky.app (B can be a phone). Ideally a browser profile that still has an old
app-password link, to see the retirement.

## App passwords are gone

- [ ] 1. Sign-in page and Settings → Connections → Bluesky: no app-password
      field anywhere; Settings → Feature flags has no app-password flag.
- [ ] 2. A browser that had an app-password connector or identity: after this
      build loads, the account is still listed. Its Bluesky feed asks to sign
      in again; "Sign in to Bluesky again" / "Switch to Bluesky sign-in" opens
      Bluesky's page for **the same account** and, after approving, everything
      works. Nothing else was signed out.

## Live updates and paging

- [ ] 3. Open a chat with B. B sends a message on bsky.app: it appears here
      within about 5 seconds, without the thread flashing empty.
- [ ] 4. B messages A in a different chat: the list moves it up and marks it
      unread within seconds.
- [ ] 5. An account with more than 50 Bluesky chats: Load more pages in the
      older ones; a refresh does not drop them again.

## Groups

- [ ] 6. Chat → New Bluesky group: name "Test group", add B and C by handle.
      It opens titled "Test group"; bsky.app shows the same group.
- [ ] 7. B writes in the group: the message shows B's name.
- [ ] 8. Chat menu → Group settings (as owner): rename (bsky.app follows),
      remove C, add C back, lock (the composer is replaced by a "locked"
      note; bsky.app agrees), unlock.
- [ ] 9. The group's thread shows quiet lines for "joined", "left", "added",
      "renamed", "locked" rather than gaps.
- [ ] 10. Make a join link with approval on; copy it. On another account open
      `mawkingbird.com/bsky/chat/<code>`: it shows the group and "Ask to
      join". Ask; back as A, Group settings lists the request; Let in. The
      other account now has the group in Chat.
- [ ] 11. Turn the link off: the join page says the link doesn't lead to a
      group. Turn it back on.
- [ ] 12. As B (not owner), Group settings shows members and says only the
      owner can change things.
- [ ] 13. Paste a `https://bsky.app/chat/<code>` link into New Bluesky group →
      "Have a join link?": it opens the join page.

## Pass

All steps checked; note anything bsky.app shows differently.
