# Misskey MA: the Misskey visitor (anonymous Misskey)

Written for: roadmap sprint MA (2026-11-10). Status: not run.
Roadmap: `sprint/misskey-and-language-learning-roadmap-2026-11.md`.

The Misskey visitor is a virtual, account-less Misskey user: one per browser,
its own entry in the account switcher, separate from Anonymous (which stays
Mastodon + Bluesky). It reads one Misskey server at a time without a token.

## Setup

No Misskey account needed. Optionally keep your misskey.design account signed
in too, to check that switching between the two works.

## Steps

### Becoming the visitor

- [ ] 1. Open `/login/misskey`, type `misskey.io` (or pick from the list) and
      press **Look around without an account**. You land on Home.
- [ ] 2. Home shows "Visiting misskey.io" with **Visit another server** and
      **Sign in with Misskey**. No composer, no "approve to post" notice.
- [ ] 3. The account switcher shows "Misskey visitor" (visitor@misskey.io)
      beside your other accounts; switching to and from it works.
- [ ] 4. Try a server that hides notes from visitors, if you know one: the
      sign-in page says so and does not create the visitor.

### Reading

- [ ] 5. Home's timeline toolbar is Following · Local · Global, starting on
      Local. Local and Global fill (or, where the admin switched one off for
      visitors, a clear error shows).
- [ ] 6. Following, with nobody followed: a line explains how to follow.
- [ ] 7. Open a note's thread, a profile, a #hashtag, an @mention: all load.
- [ ] 8. Search: People and Hashtags work. Notes search either works or says
      the server switched it off (servers often keep note search from visitors).
- [ ] 9. No reaction, renote, reply or vote buttons act on notes; Notifications
      is not in the menu.

### Following

- [ ] 10. On a profile, **Follow** (tooltip: kept in this browser). It turns
      to **Unfollow** and stays so after reload.
- [ ] 11. Home → Following shows that person's recent notes, newest first.
- [ ] 12. **Visit another server** → `misskey.design`: Home now says "Visiting
      misskey.design"; Following still shows the people followed on misskey.io.

### Translation

- [ ] 13. 🌐 Translate on a Japanese note uses the free engines (or AI, if
      connected) — never the server's own translator, which needs an account.

### Removing

- [ ] 14. Settings → Accounts → remove the Misskey visitor: it leaves the
      switcher, and its follows are gone if you visit again.

## Not in MA

Browser-local bookmarks and mutes for the visitor beyond what Misskey accounts
already have; antennas, channels and clips (M3 part 2).
