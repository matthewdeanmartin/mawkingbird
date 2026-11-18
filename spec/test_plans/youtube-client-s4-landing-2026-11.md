# YouTube client S4: Subscriptions, SponsorBlock, PeerTube, Recently seen

Build: Mawkingbird Native and mawkingbird.com from the 2026-11-18 tree. Spec:
[YouTube client](../youtube-client.md), S4.

You need: a Mastodon account that follows someone who posts YouTube links; a
few subscribed channels (one that posts Shorts); a post linking a PeerTube video
(any instance, e.g. a `/w/…` link); a popular YouTube video with sponsor reads.

## Subscriptions landing (`/videos`)

- [ ] The video mode's first tab is **Subscriptions** and opens `/videos`.
- [ ] The header is one toolbar: All videos · Saved · Shorts · ↻ Refresh · Customize,
      with no row of pill buttons.
- [ ] Shorts are hidden until **Shorts** is pressed.
- [ ] A video someone you follow posted shows their avatar and "Shared by …";
      **Watch with their replies** opens Watch on that post's replies.
- [ ] A YouTube video a follow shared from a channel you don't subscribe to also
      appears (channel name from the link card, or "From people you follow").
- [ ] Web without Plus: the search area says to search YouTube from the app and
      links **Install Mawkingbird Native** (Settings → Install app). No Plus wording.

## Video search (`/videos/search`)

- [ ] The left rail has one **Search** button, and below it **Search elsewhere**
      with two plain links: "All posts, not only ones with video" and "YouTube, on Google ↗".

## Watch queue

- [ ] Empty queue reads "Nothing lined up / Add a video from any post, or from what
      you just saw below." No "queue, queue, queue".
- [ ] Scroll Home past a few video posts, then open the queue: **Recently seen** lists
      them (newest first, at most six) under the queue. **Add** moves one up into the
      queue; **Watch** opens it.
- [ ] Settings → History off: Recently seen disappears.

## SponsorBlock (Watch)

- [ ] On a video with sponsor reads, a thin coloured strip and "SponsorBlock: N parts
      to skip" appear under the player.
- [ ] Play into a sponsor segment: **Skip sponsor (m:ss)** appears; pressing it jumps
      past it. Nothing skips by itself.
- [ ] Settings → connections → SponsorBlock off: no strip, no request.

## Chapters now seek (S2/S3 follow-up)

- [ ] With the YouTube player loaded, a chapter jumps there without reloading the
      player; while playing, the highlighted chapter follows playback.
- [ ] Before the player is loaded, a chapter cues the video there (paused).

## PeerTube

- [ ] A post linking a PeerTube video shows the preview with "PeerTube video on
      <host>. Open Watch to play it here." and **Open Watch**.
- [ ] Watch plays it paused-until-Play (web: adaptive HLS; Native: MP4).
- [ ] **Follow** under the player follows the PeerTube channel from your server; its
      new videos arrive in Home.
- [ ] A video its instance marks NSFW waits behind **Show video**.
- [ ] A server that won't answer shows the error and an **Open it on <host>** link.
- [ ] Native: Help → Open logs shows `sponsorblock_read complete`; PeerTube streams play
      (note any instance that only offers HLS: Native may not play those).

## Findings

_Date, build, what went wrong._
