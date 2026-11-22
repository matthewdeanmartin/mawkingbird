# Lite: load control, saved first, keep my place

Build: `main` after spec/lite-next-hour.md Sprints A and B (2026-11-21). Use a
modern phone (or a 393 px wide window) and one non-English interface language
for at least one pass. Firefox or Chrome DevTools throttling is fine for the
bench steps; the train or the big shop for the field steps.

## The journey

- [ ] Full app on Wi-Fi: read Home for a minute, open one thread.
- [ ] Throttle to the slowest setting (or walk into the dead zone), open Lite
      (Settings → Open Lite, or the offer).
- [ ] Lite Home shows posts **at once**, with no repeat request for Home if the
      full app saved it in the last 5 minutes (DevTools → Network).
- [ ] Open the thread you read in the full app: the post shows at once, the
      replies arrive separately (or immediately, if saved).
- [ ] Tap an author: their name and counts show at once; their posts follow.
- [ ] Back to Home: you land on the post you were reading, with no request.

## Load-control bar

- [ ] Fresh Lite Home: pictures show as descriptions with "Slow connection:
      pictures held back. Show them" — **no picture previews requested**
      (DevTools → Network → Img) until you tap.
- [ ] Pictures you already saw in the full app this session show at once.
- [ ] Pictures: Off → descriptions only, no Show button. On → everything loads,
      including posts already on screen.
- [ ] Avatars off → initials, no avatar requests.
- [ ] Video and audio off (default) → a Play button instead of each player;
      no request to YouTube or the media host until pressed.
- [ ] Reading → text size, line width and high contrast change at once and make
      no requests.
- [ ] Reload: the bar keeps your choices. The full app is unaffected.

## Updates and place

- [ ] Updates "When out of date": leave Lite Home for 6+ minutes, come back →
      one background check; nothing jumps.
- [ ] Updates "Refresh only": nothing is checked until Refresh.
- [ ] Load three pages, scroll down, press Refresh while new posts exist → you
      stay where you were and a "New posts: N ↑" pill appears; pressing it puts
      them on top and scrolls there.
- [ ] After a long gap (many new posts), the line "Some posts between here and
      below weren't loaded." appears below the newest block.

## Posting

- [ ] Quick composer on Lite Home: "Posted." appears and the post is on top.
- [ ] Offline: post → it goes to the Outbox; **Outbox (1)** appears in the Lite
      nav.
- [ ] Settings → Writing (or the Outbox page): "Wait for me to review them" →
      on reconnect nothing sends; the post waits with "Waiting for you to send
      it." Switch back to automatic → it sends.

## Findings

_Date, device, browser, language, connection, what matched and what didn't._
