# Sprint 6: Bluesky chat

Written for: Bluesky parity sprint 6 (2026-11-03). Status: not run.

## Setup

Two Bluesky accounts: **A** linked in Mawkingbird (approved link, then again
with an app password that allows direct messages), and **B** signed in on
bsky.app in another browser. A and B must not follow each other and must have
no chat between them. On bsky.app as A, set Settings → Chat → "Allow new
messages from" to **Everyone**, so B can send a request.

## Steps

### Message requests

- [ ] 1. As B on bsky.app, message A. In Mawkingbird as A, refresh Bluesky chats.
      B's chat is **not** in the chat list; a **Requests (1)** button appears.
- [ ] 2. Choose Requests (1): the list shows only B's request, marked
      "Request", and the Who/Kind filters are hidden. "← Chats" goes back.
- [ ] 3. Open the request: the transcript shows B's message and a bar says "B
      wants to chat" with **Accept** and **Decline**. Before opening it, the
      request stayed unread on bsky.app as A; opening it marks it read.
- [ ] 4. Accept: the bar goes, the Requests button goes, and B's chat is in the
      chat list. On bsky.app as A, the chat is under chats, not requests.
- [ ] 5. Repeat 1 with a fresh request (leave the chat on both sides first),
      then reply instead of accepting: the request becomes a chat.
- [ ] 6. Repeat 1, then Decline. A confirmation explains it comes back if B
      writes again. After confirming, the request is gone here and on bsky.app.

### Reactions

- [ ] 7. Hover (or tab to) one of B's messages: a ☺+ button and a ••• menu show.
      ☺+ opens the emoji picker; pick 👍. A "👍 1" chip appears under the
      message, pressed.
- [ ] 8. On bsky.app as B, the message shows A's 👍.
- [ ] 9. As B on bsky.app, react 🎉 to one of A's messages. Refresh Bluesky
      chats in Mawkingbird: "🎉 1" appears, not pressed.
- [ ] 10. Choose the pressed 👍 chip: it goes away here and on bsky.app.
- [ ] 11. Keep adding different reactions to one message until Bluesky refuses:
      a message says Bluesky allows only a few reactions from you on one
      message. Nothing else breaks.
- [ ] 12. Custom (Mastodon instance) emoji in the picker do nothing when picked
      (Bluesky takes standard emoji only).

### Mute and leave

- [ ] 13. In the chat with B, the header ••• menu has **Mute conversation**.
      Choose it: 🔕 shows on the row. bsky.app shows the chat muted. A message
      from B does not raise a Mawkingbird chat notification.
- [ ] 14. The menu now says **Unmute conversation**; choosing it clears 🔕 here
      and on bsky.app.
- [ ] 15. **Leave conversation** asks first; Cancel keeps it. Confirm: the chat
      leaves the list here and on bsky.app (as A). When B writes again it
      returns.

### Delete for me

- [ ] 16. A message's ••• menu has **Delete for me**. It asks first and says the
      other person keeps their copy. Confirm: the bubble reads "Message deleted"
      with no reactions or actions.
- [ ] 17. bsky.app as A no longer shows the message; bsky.app as B still does.
- [ ] 18. Reopen the chat in Mawkingbird: it still reads "Message deleted".

### Who can message you

- [ ] 19. Settings → Bluesky moderation has a fourth section, "Who can message
      you", showing the same choice as bsky.app (Everyone, from Setup).
- [ ] 20. Change it to **No one**: "Saved." shows. Reload bsky.app's chat
      settings as A: it says No one. B can no longer start a new chat with A.
- [ ] 21. Change it on bsky.app to People I follow; reload the Mawkingbird page:
      it shows People I follow.
- [ ] 22. On an account that never changed it (no declaration record), the page
      shows People I follow, Bluesky's default.

### Limits and edge cases

- [ ] 23. With an app password **without** DM access: Chat shows the relink
      hint; the "Who can message you" section either works or shows Bluesky's
      own error under the select (record which).
- [ ] 24. Anonymous mode: Chat has no Bluesky rows or Requests button.
- [ ] 25. Turn the network off mid-action (DevTools offline) and react, mute, or
      delete: "That didn't work on Bluesky. Try again." shows; nothing changes.
- [ ] 26. On a narrow screen, the request bar, chips, and picker fit without
      sideways scrolling.

## Findings

_None yet._
