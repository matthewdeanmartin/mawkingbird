# Misskey M1: sign in and read

Written for: Misskey roadmap sprints M0 and M1 (2026-11-09). Status: not run.
Roadmap: `sprint/misskey-and-language-learning-roadmap-2026-11.md`.

## Setup

- A Misskey account on a real Misskey server (misskey.io is fine) that follows
  a few accounts, including at least one on another server, and whose
  timeline has notes with custom emoji, reactions, a CW, an image, a poll, a
  renote and a quote. `$[ruby 漢字 かんじ]` in one of your own notes helps.
- Optionally a Mastodon account and a Bluesky account already saved in
  Mawkingbird, to check that switching never loses them.
- The `misskey` flag is `canary`. On a production build, turn it on
  in Settings → Feature flags first.

## Steps

### Sign in

- [ ] 1. Signed out, open `/login`. A third door, **Misskey**, is shown. With
      the flag off it is not shown, and `/login/misskey` sends you to Home.
- [ ] 2. On `/login/misskey`, enter `mastodon.social`. The page says that
      server runs mastodon, not Misskey, and does not leave the page.
- [ ] 3. Enter a Sharkey server (for example `sharkey.team`, or any server
      whose NodeInfo says `sharkey`). The page says it is based on Misskey but
      only Misskey is supported for now.
- [ ] 4. Enter `misskey.io` (also try `@you@misskey.io`). You go to misskey.io,
      which shows the app name, its icon and **read-only** permissions.
- [ ] 5. Approve. You come back to `/login/misskey?session=…`, see
      "Finishing sign-in…", and land on Home signed in as your Misskey
      account. The rail card says **Misskey** with Ⓜ️.
- [ ] 6. Repeat 4, but press **Deny** on Misskey. Back in Mawkingbird, an
      error explains that Misskey did not confirm the sign-in. Reloading the
      page does not retry.

### Home

- [ ] 7. Home shows your Misskey home timeline, and a toolbar
      **Home · Social · Local · Global**. Each one reloads Home with that
      timeline. The choice survives a reload.
- [ ] 8. There is no Write / Quick post on Home (posting is M2), and no
      "My server" link in the menu.
- [ ] 9. Notes look right: custom emoji in text and names; bold, small,
      quotes and code; `$[ruby]` shows a reading above the kanji; animated
      `$[x2 …]` text shows as plain text; mentions and hashtags open on your
      Misskey server in a new tab.
- [ ] 10. A note with a CW is collapsed behind it; a sensitive image is
      hidden; a poll shows results only (no voting yet).
- [ ] 11. A renote shows as a boost of the original; a quote shows the quoted
      note inside.
- [ ] 12. Reactions show under each note as chips with counts, custom emoji as
      images; your own reaction's chip is outlined.
- [ ] 13. Reply, renote and reaction counts show; the buttons do nothing yet
      (read-only); "↗ Open original" opens the note on your server.
- [ ] 14. Scroll to the end: older notes keep loading until the timeline ends.
- [ ] 15. 🌐 Translate on a Japanese note translates it with the free engines
      (browser, MyMemory or Apertium, whichever are on); it never asks your
      Misskey server or a Mastodon server.

### Thread

- [ ] 16. Click a reply: the thread page shows its parents (oldest first),
      the reply, and its direct replies.
- [ ] 17. Open `/statuses/mk:doesnotexist`: an error ("Could not load this post", or "Status not found" for a real id that was deleted), not an endless spinner.

### Accounts

- [ ] 18. Account menu → **+ Add Misskey account**, sign in as a second
      Misskey account (or the same server, different user). Both are in the
      switcher; switching changes Home to the other account's timeline.
- [ ] 19. Switch to a saved Mastodon account and back to Misskey: neither is
      lost, and the Mastodon account's Home is its own.
- [ ] 20. Open two tabs as Misskey account A. In tab 2 switch to account B.
      Back in tab 1 (without reloading), open a thread: it still reads as A.
- [ ] 21. Settings → Accounts lists the Misskey accounts with their storage
      size. Removing a non-active one keeps you signed in.
- [ ] 22. Settings → Profile says your profile lives on Misskey and links to
      its profile settings; there is no Mastodon profile form.
- [ ] 23. Likes shows an empty list (no error). Bookmarking a Misskey note
      keeps it in this browser and it appears under Bookmarks.
- [ ] 24. Log out (account menu): the Misskey account is forgotten; other
      saved accounts are still there and none of them becomes active.
- [ ] 25. On misskey.io, Settings → API / Apps: Mawkingbird's token is listed
      with read permissions only. Revoke it, reload Mawkingbird: Home shows
      "Misskey could not load this timeline" with **Sign in to Misskey again**.

## Known gaps (not bugs in M1)

- No posting, reacting, voting, following or muting (M2).
- No Misskey profile page or notifications page yet; author names are not
  links (M1 follow-up).
- Bookmarks are browser-local, not Misskey favourites or clips (M3).
