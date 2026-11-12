# Chat: 1:1 mentions and live-connection diagnostics (2026-11)

**Build:** local production build or `/test/` staging with this change.
**You need:** Mastodon account A, plus a second account B (any server) to
receive messages, and ideally a third account C. Open B's notifications in
another browser or the official app.

## 1. Private 1:1 chat

- [ ] Open a private chat with B. The box already starts with `@B `.
- [ ] Send "hello". B gets it and a notification. The box is `@B ` again.
- [ ] Delete `@B ` and send "second". No dialog appears; the message reaches B
      as `@B second` and notifies them.
- [ ] Type `@C hi` (C only) and send. Nothing is sent; one line under the box
      says it would go to @C, not @B. No dialog.
- [ ] Type `@B@<B's server> hi` (full handle). Sent as typed, once, to B.
- [ ] Write a message that only fits the limit without the mention, delete
      `@B `, then send. It is refused as too long, as any over-long text is.

## 2. Public 1:1 chat

- [ ] Open a public chat with B (from a public mention). Box starts with `@B `.
- [ ] Delete `@B ` and send. No dialog; the reply mentions B and notifies them.
- [ ] Type `have you met @C?` and send. Sent as `@B have you met @C?`, with no
      "Check the people you are mentioning" dialog.

## 3. Group chats (unchanged)

- [ ] In a private chat with B and C, delete the mentions and send. The old
      "Nobody is mentioned" dialog still appears (groups were left as they were).
- [ ] With at least one mention, it sends with no lookup dialog.

## 4. Reconnecting diagnostics

- [ ] Open Chat with the network connected. The header says Live.
- [ ] Turn the network off (DevTools → Network → Offline, or disconnect Wi-Fi).
      Within about a minute the header says Reconnecting…; it is plain text
      for the first 5 seconds.
- [ ] After 5 seconds it becomes clickable. Click it: a dialog shows how long it
      has been down, "Your browser says it is offline", and for each stream
      the live server, failed attempts, last error (code 1006 when the browser
      gives no reason) and the next try.
- [ ] Network Doctor opens the doctor page.
- [ ] Turn the network back on, click Reconnect now. The dialog closes, the
      header shows Connecting… and then Live without waiting for the backoff.

## Findings

(Record date, browser, servers, and anything unexpected.)
