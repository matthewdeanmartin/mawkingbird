# Low bandwidth S2–S3: offline banner, retries, data saver

Build: `main` after low-bandwidth Sprints 2–3 (2026-11-21). Roadmap:
[low-bandwidth-offline.md](../low-bandwidth-offline.md). Run
[S1](low-bandwidth-s1-connection-meter-2026-11.md) first or alongside.

## What you need

- A signed-in Mastodon account on a phone and on a laptop with DevTools.
- For bench steps against the mock server: the developer fault page
  (`/dev/faults`) and its **Network profiles** row.

## Menus

- [ ] After a minute of reading, the More (`…`) menu shows a reply time after
      **Observability** (e.g. "240 ms").
- [ ] Observability has a **Connection** card (verdict, typical reply, last hour)
      that opens `/connection`.

## Offline vs. server down (laptop)

- [ ] DevTools → Network → **Offline**, then scroll or open a thread. A banner
      at the bottom says you're offline; **no fail whale**. Posts already on
      screen stay readable and scrollable.
- [ ] **Try now** while still offline: the banner stays, `/connection` shows a
      failed test.
- [ ] Back online: the banner goes away on its own within a few seconds. If the
      app had marked the server down, it recovers without pressing anything.
- [ ] Server down while your connection works: point the app at a server that
      refuses connections (or block its host in DevTools → Request blocking).
      Briefly "Checking your connection…", then the **fail whale**, which is about
      the server.

## Retries (mock server, fault page)

- [ ] Add a rule: `GET /api/v1/timelines/home`, effect status 503, fire count 1.
      Reload Home: it loads (after about a second) instead of showing an error.
- [ ] Same with fire count 5: Home shows its usual error after three tries, not
      before.
- [ ] Profile **Flaky (30% dropped)**: Home and notifications mostly load,
      sometimes after a short pause; the header chip says Unstable.

## Data saver

- [ ] Profile **Slow 3G** (or real weak signal). New posts that appear show
      picture descriptions instead of pictures, with **"Slow connection: pictures
      held back. Show them"**. Tapping it loads that post's pictures.
- [ ] Posts whose pictures had already loaded before the slowdown keep them.
- [ ] Link previews in new posts show without their image while saving data.
- [ ] Settings → feed → **Pictures in new posts**: "Always wait for a tap" holds
      pictures back on a good connection; "Always load" never holds them back.
- [ ] Back to Normal: about three minutes later, new posts show pictures again.
- [ ] `/connection` shows "Pictures in new posts: Wait for a tap" while saving data.
- [ ] Chat open while the profile is **Offline**: no error flood from the
      background refresh.

## Findings

_Date, device, browser, what matched and what didn't._
