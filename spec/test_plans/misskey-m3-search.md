# Misskey M3 (part 1): search, hashtags, mentions

Written for: roadmap sprint M3, search first (2026-11-10). Status: not run.
Roadmap: `sprint/misskey-and-language-learning-roadmap-2026-11.md`.

## Setup

Signed in with your Misskey account (misskey.design). Optionally a second
Misskey server whose admins switched note search off, to see step 5.

## Steps

### Search page

- [ ] 1. Open Search from the menu: a "Search Misskey" page with Notes ·
      People · Hashtags, and "Trending on misskey.design" tags before you type.
- [ ] 2. Notes: search 猫 (or any word): matching notes from your server show
      as ordinary cards (react, reply, translate all work). **Load more** pages on.
- [ ] 3. Search `#art` (with the #): notes carrying the tag.
- [ ] 4. The URL holds the search (`/search?q=…&type=…`); reload and Back work.
- [ ] 5. On a server with note search off: a message says so and points at
      #hashtag search, People and Hashtags (which still work).
- [ ] 6. People: search a name; the list links to in-app profiles.
- [ ] 7. Search `@someone@misskey.io` (a real account on another server):
      "Open the profile of @someone@misskey.io" appears and opens it.
- [ ] 8. Hashtags: search 絵 — matching tags, each opening its hashtag page.

### Hashtag pages and mentions

- [ ] 9. Click a #hashtag inside a note: an in-app "#tag" page with notes,
      **Load more**, and "Search for it instead".
- [ ] 10. Click an @mention inside a note: the person's profile opens in-app
      (also for someone on another server).
- [ ] 11. Signed in with Mastodon or Anonymous instead, Search and #tag pages
      are the usual ones (Misskey pages only for Misskey accounts).

## Not in this part of M3

Antennas, channels, clips and live updates (next), and anonymous Misskey
browsing (sprint MA).
