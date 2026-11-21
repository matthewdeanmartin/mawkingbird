# Bluesky parity 2, sprint 3: your feeds, your lists

Written for: spec/bsky_parity.md sprint 3 (2026-11-20). Status: not run.

## Setup

**Bluesky A** in Mawkingbird (Bluesky-first; repeat ★ steps as a connector
under Mastodon), and bsky.app open as A to compare. **Bluesky B** to put on
lists. Before starting, note A's pinned feeds on bsky.app (Home tabs) and a
muted word, so you can confirm they survive.

## Steps

### Feeds

- [ ] 1. ★ Feeds → Popular on Bluesky → open a feed you haven't saved. Save,
      Pin to Home and Like feed buttons show with its like count.
- [ ] 2. Save it. Reload bsky.app → Feeds: it is saved there. Remove it here:
      gone there too.
- [ ] 3. Pin to Home on an unsaved feed: it is saved and pinned; bsky.app's
      Home tabs show it at the end.
- [ ] 4. Feeds page → Pinned on Bluesky: ↑/↓ reorder; bsky.app's tab order
      follows after a reload. ↑ is disabled on the first row, ↓ on the last.
- [ ] 5. Like a feed: the count goes up; bsky.app shows it liked. Unlike.
- [ ] 6. After all of the above, the muted word and every other bsky.app
      setting are still there (nothing else in preferences was lost).

### Lists

- [ ] 7. ★ B's profile → ••• → Lists: "Lists for @B" lists A's curated and
      moderation lists (moderation ones badged) and says lists are public.
- [ ] 8. Create "Test list" (people to read) with B added. bsky.app → Lists
      shows it with B. Untick, retick: bsky.app follows each time.
- [ ] 9. Create a moderation list from the same dialog: it is badged.
- [ ] 10. Open Test list (save it from its page if needed): Delete list asks
      first; confirming removes it on bsky.app, and its members are gone with
      it (no orphaned entries).
- [ ] 11. Signed in to Mastodon only (no Bluesky linked), a Bluesky profile's
      Lists entry still opens the old Mawkingbird lists dialog.

### Blocked and muted accounts

- [ ] 12. Block and mute someone on bsky.app. Settings → Bluesky moderation
      lists them under Blocked accounts / Muted accounts.
- [ ] 13. Unblock and Unmute here: bsky.app agrees after a reload.
- [ ] 14. With more than 50 of either, Show more loads the rest.

## Pass

All steps checked, or failures noted with what bsky.app showed.
