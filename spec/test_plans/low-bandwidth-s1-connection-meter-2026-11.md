# Low bandwidth S1: connection meter

Build: `main` after the connection meter (2026-11-21). Roadmap:
[low-bandwidth-offline.md](../low-bandwidth-offline.md).

## What you need

- A phone with Mawkingbird open in its browser, signed in to Mastodon.
- A walk through places with weak or no signal (a big shop, a car park, a lift),
  or Chrome DevTools on a laptop for the bench steps.

## Bench (laptop, DevTools)

- [ ] On a normal connection, browse Home for a minute. No chip appears in the header.
- [ ] Open `/connection` (also linked from Observability). It says "Working
      normally", the hour chart has grey bars, and the summary table has numbers.
- [ ] DevTools → Network → throttling "Slow 3G". Scroll Home for a minute. The
      header shows **Slow connection** and the page's verdict changes to "Slow, but
      getting through".
- [ ] Throttling "Offline". Within a few requests the chip says **Offline**.
      On the page, the reason says the device reports no connection.
- [ ] Back to "No throttling". The page logs a successful test shortly
      afterwards ("Last test: reached …") and the chip goes away after the next requests.
- [ ] Reload `/connection`. The bad minutes are still in the hour chart.
- [ ] **Copy report** pastes a plain-text report with no post content or URLs.
- [ ] **Clear history** empties the chart.

## Field (phone, real weak signal)

- [ ] Use the app normally while walking into a weak-signal area. Note when the
      chip first appears and what it says, compared with how the app feels.
- [ ] When the app stops loading, check that the chip says Offline or Unstable
      rather than staying hidden.
- [ ] Back in good signal, open `/connection` and the **Last 24 hours** view. The
      slide into bad signal is visible as amber/red columns before the offline
      stretch, not just a gap.
- [ ] Paste the report into Findings below.

## Findings

_Date, device, browser, what matched and what didn't. Paste reports here._
