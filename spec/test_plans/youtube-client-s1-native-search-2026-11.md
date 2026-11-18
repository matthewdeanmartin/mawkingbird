# YouTube client S1: search and video details on Native

Build: Mawkingbird Native from the 2026-11-18 tree (with `youtube_innertube`), plus
mawkingbird.com for the web comparison. Spec: [YouTube client](../youtube-client.md), S1.

You need: Windows Native build; a browser on mawkingbird.com, once **without**
Plus and once **with** Plus. No YouTube or Google account is needed, and none
should be signed in anywhere in the app.

## Native, not a Plus supporter

- [ ] Open **Videos**. The search box is shown, and there is no "YouTube search is
      included with Mawkingbird Plus" notice.
- [ ] Search videos for `technology connections`. Results appear, each with a Watch link.
- [ ] Switch the type to channels and search again. Technology Connections is listed;
      **Subscribe** adds it to the left-hand subscriptions.
- [ ] Open **Videos → Search** (`/videos/search?q=retro+computing`). The YouTube
      column shows results (not the Plus notice), and the start hint before searching
      reads "…across the fediverse and on YouTube."
- [ ] Settings → connections: turn **RSS / video feeds** off. Search shows the failure
      message and makes no request (Help → Open logs: no new `youtube_read` line).
      Turn it back on.
- [ ] Help → Open logs: `youtube_read complete` lines appear. There are no `policy` failures.

## Web, for comparison

- [ ] mawkingbird.com without Plus: the Plus notice is shown and no YouTube search happens.
- [ ] mawkingbird.com with Plus: search still works through the proxy, the same as before.

## Not testable by hand in S1

Video details (`player`: duration, chapters, family-safe) have no screen until S2.
Unit tests cover the mapping, and Rust tests prove stream URLs are stripped.

## Findings

_Date, build, what went wrong._
