# Low bandwidth S6–S7: Lite (/m/) and Native offline

Build: `main` after low-bandwidth Sprints 6–7 (2026-11-21). Roadmap:
[low-bandwidth-offline.md](../low-bandwidth-offline.md). Native half:
`mawkingbird_native/sprint/18-connectivity-offline.md`.

## What you need

- A signed-in Mastodon account; a phone; Mawkingbird Native on Windows for the
  last section.

## Lite basics (phone)

- [ ] Open `/m/` (or Settings → feed → **Open Lite**). A slim top bar
      ("Mawkingbird Lite", Full app) and Home, Notifications, Search, Write, More.
- [ ] Home shows 20 posts and a **Load more** button; nothing else loads while
      you read. Posts look and act like the full app (boost, favourite, reply on
      the card, content warnings).
- [ ] Notifications: one line per event ("Alice favourited your post") with the
      post underneath.
- [ ] Open a post's time: the Lite thread shows the conversation with the post
      highlighted. Reply on the card works.
- [ ] Tap a name: the Lite profile shows the person's posts with Load more.
- [ ] Search: people and hashtags link into Lite; posts show as cards. The
      query stays in the address (`/m/search?q=…`).
- [ ] More → Lists, a list, Bookmarks and Direct messages each load.
- [ ] Write: post something; you land back on Lite Home.
- [ ] More → Radio: your saved playlists, Play, Pause, Next and Stop work. No
      playlist builder.
- [ ] More → Videos: your watch queue; a YouTube item plays inline on Play; an
      item from a post opens that post in Lite.

## Lite stays Lite

- [ ] In Lite, tap a link in a post that points to another post or profile:
      it opens in `/m/…`, not the full app.
- [ ] Open a shared full-app link (e.g. `/statuses/…`) while Lite is on: it
      opens as `/m/statuses/…`.
- [ ] Open Settings from a link: the full app's Settings page opens (Lite has
      none) and Lite stays on for the next post link.
- [ ] **Full app**: you land on the matching full-app screen, and full-app
      links no longer redirect.
- [ ] Bluesky-only or Anonymous account at `/m/`: a note says Lite is for
      Mastodon for now.
- [ ] View source of a `/m/` page: `<meta name="robots" content="noindex, …">`.

## The offer

- [ ] Fault page profile **Slow 3G** (or real weak signal) for two or three
      minutes in the full app: the bottom banner offers **Switch to Lite**.
      **Switch to Lite** opens the Lite twin of where you were.
- [ ] Back in the full app: **Not now** hides it for the rest of this tab.

## Native (Windows)

- [ ] Wi-Fi off: the offline banner appears (not the fail whale). `/connection`
      → **Test now** reports no answer.
- [ ] Wi-Fi on, the home server blocked (hosts file or firewall rule): briefly
      "Checking your connection…", then the fail whale.
- [ ] Wi-Fi off, open a followed person's profile you haven't opened this
      session: archived posts appear; **Load more** pages further back.
- [ ] Wi-Fi off, write a post: it goes to the Outbox; close and reopen the app;
      it's still there and sends when Wi-Fi returns.

## Findings

_Date, device, browser or Native build, what matched and what didn't._
