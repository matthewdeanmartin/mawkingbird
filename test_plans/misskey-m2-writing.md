# Misskey M2: posting, reacting, following

Written for: roadmap sprint M2 (2026-11-09). Status: not run.
Roadmap: `sprint/misskey-and-language-learning-roadmap-2026-11.md`.

## Setup

- Your Misskey account (misskey.design), already signed in from M1 (that
  token is read-only; step 1 upgrades it).
- A second Misskey account (or a friend) to follow, mention and react with.
  Ideally one locked account (approves followers) for the request steps.

## Steps

### One more approval

- [ ] 1. Home shows "One more approval to post" naming misskey.design, and no
      composer. Press **Approve on Misskey**: Misskey asks for read **and
      write** permissions (notes, reactions, votes, following, mutes, blocks,
      favourites, Drive, reports; not account settings or admin).
- [ ] 2. Approve: you land back on Home, still the same account (not a second
      copy in the switcher), and Home now shows the Misskey composer.
- [ ] 3. Settings → Accounts still lists the account once.

### Posting

- [ ] 4. Post a plain note: it appears at the top of Home and on Misskey.
- [ ] 5. Post with a content warning: collapsed behind the CW here and on Misskey.
- [ ] 6. Post as **Home**, then **Followers only**: Misskey shows the matching
      visibility icon. Post **Only this server**: Misskey shows it local-only.
- [ ] 7. Attach two images with descriptions, one marked sensitive: on Misskey
      both have their alt text and the sensitive one is hidden. In your Drive
      on Misskey, the files are there (uploaded straight, not via a proxy).
- [ ] 8. The counter counts down from misskey.design's limit; over the limit,
      Note is disabled.
- [ ] 9. Ctrl+Enter (⌘+Enter) posts.

### Replies, quotes, renotes, delete

- [ ] 10. 💬 on someone's note: a compact Misskey composer opens; the reply
      shows in the thread here and on Misskey. Replying to a followers-only
      note offers no wider visibility than followers.
- [ ] 11. On a thread page, the reply box at the bottom is the Misskey composer.
- [ ] 12. Quote a note: it posts as a quote (Misskey shows the quoted note inside).
- [ ] 13. 🔁 renotes; pressing it again (same visit) removes the renote on Misskey.
- [ ] 14. On your own note, 🗑️ asks to confirm and deletes it here and on Misskey.
      There is no edit, pin or "delete and redraft" (Misskey has no edit).

### Reactions and likes

- [ ] 15. ❤ (the like button) adds a ❤ reaction; the chip appears outlined as
      yours, and the count goes up. Pressing ❤ again removes it.
- [ ] 16. Press another person's 👍 chip: your reaction becomes 👍 (a ❤ you
      had is replaced; Misskey allows one per person).
- [ ] 17. Press your own chip: your reaction is removed.
- [ ] 18. Press **+**: the emoji picker lists misskey.design's custom emoji;
      pick one and it appears as a chip with its image.
- [ ] 19. A chip for another server's custom emoji is not pressable.

### Polls

- [ ] 20. Vote on someone's poll: results show with your choice; Misskey agrees.

### People

- [ ] 21. A profile shows **Follow · Mute · Block** (not on your own profile),
      and "Follows you" when they do.
- [ ] 22. Follow: the button becomes Unfollow (or **Requested** for a locked
      account); press Requested to withdraw the request.
- [ ] 23. Mute, then Unmute; Block asks to confirm, then Unblock.
- [ ] 24. From the second account, request to follow your locked account (or
      vice versa): Notifications shows the request with **Approve / Deny**
      (no "Manage" link); Approve makes it a follower on Misskey.

## Known gaps (M2)

- Polls cannot be created yet; no drafts for Misskey notes.
- Renote state is only known for renotes made this visit (Misskey's API does
  not say whether you renoted something), so 🔁 may show unpressed for an
  older renote; pressing it renotes again.
- No report-abuse UI yet (the permission is asked for so M3 needs no re-approval).
