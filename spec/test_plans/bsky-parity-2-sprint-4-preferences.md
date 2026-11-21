# Bluesky parity 2, sprint 4: preferences that follow the account

Written for: spec/bsky_parity.md sprint 4 (2026-11-20). Status: not run.

## Setup

**Bluesky A** in Mawkingbird and on bsky.app. A follows some people who reply
to strangers, repost and quote. **Bluesky B** with a starter pack that
includes A.

## Steps

### The page

- [ ] 1. Settings → Content → Bluesky preferences. Sections: Following feed,
      Thread replies, Who can reply and quote by default, Interests, Privacy.
      Desktop and phone, light and dark. Also reachable with a Bluesky
      connector under Anonymous.
- [ ] 2. Each change shows "Saved."; with the network off, the control goes
      back and the error shows.

### Following feed

- [ ] 3. On an account that never changed these on bsky.app: "Only show
      replies to people I follow" is on, and Home shows no replies to
      strangers (bsky.app's default). Turn it off: they appear after refresh.
- [ ] 4. Hide replies: only self-threads and your own replies remain. Hide
      reposts, hide quotes: each disappears from Home after refresh.
- [ ] 5. Like threshold 5: replies with fewer likes are hidden.
- [ ] 6. bsky.app → Settings → Following feed shows the same choices.

### Threads

- [ ] 7. Oldest first / newest first / most liked: a busy thread's replies
      reorder at every level. bsky.app's Thread preferences match.

### Default reply and quote controls

- [ ] 8. Change → "People I follow" and quotes off. Write a new post: the
      composer's Bluesky controls already say so; the post on bsky.app has
      them. Change them on one post: only that post differs.
- [ ] 9. bsky.app's default post settings show the same choice.

### Interests and privacy

- [ ] 10. Tick three interests: bsky.app → Settings → Content → Interests
      shows them.
- [ ] 11. "Ask apps not to recommend my posts" on: bsky.app shows the same
      setting. Off again.
- [ ] 12. "This account is automated" on: A's profile shows the bot marker in
      Mawkingbird and bsky.app; any other self-labels on the profile survive.
      Off again.

### Starter packs

- [ ] 13. Open B's pack that includes A: "Remove me from this pack" shows (not
      on your own packs, not on packs you aren't in). Use it: A leaves the
      list here, and B's pack on bsky.app no longer shows A.

## Pass

All steps checked; record any difference from bsky.app's own settings pages.
