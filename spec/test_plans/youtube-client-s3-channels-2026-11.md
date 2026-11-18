# YouTube client S3: channel pages and creators on Mastodon

Build: Mawkingbird Native and mawkingbird.com from the 2026-11-18 tree. Spec:
[YouTube client](../youtube-client.md), S3.

You need: Native on Windows; a Mastodon account on both; a private/incognito
browser window with no account. Channels to try:

| Channel | ID | Expect |
| --- | --- | --- |
| Technology Connections | `UCy0tKL1T7wFoYcxCe0xjN6Q` | TechConnectify@mas.to, from the channel (Native) and Wikidata |
| Jeff Geerling | `UCR-DXc1voovS8nhAvccRZhg` | geerlingguy@mastodon.social, from Wikidata |
| CGP Grey | `UC2C_jShtL725hvbm1arSV9w` | No Mastodon account |

## Channel page

- [ ] Open `/videos/channel/UCy0tKL1T7wFoYcxCe0xjN6Q` signed in on the web. You see the
      title, uploads from the feed (dates), **Subscribe** and **Open on YouTube**.
- [ ] **Subscribe**, then go to Videos: the channel is in the subscriptions list, and
      **Channel** beside it returns here. **Subscribed** unsubscribes.
- [ ] **On Mastodon** shows TechConnectify with where the link came from. **Follow**
      follows them from your server, and **Open profile** opens the profile in the app.
- [ ] A creator whose profile doesn't link back shows "check it's really them".
- [ ] CGP Grey says no Mastodon account is linked yet.
- [ ] On Native the page also shows the @handle and subscriber count, the
      channel's Links, durations on thumbnails, and **Older videos** pages further back.
- [ ] Private window, no account: the same link opens the page (no front-page
      detour), uploads show, and Follow is hidden.
- [ ] `/videos/channel/nonsense` says it isn't a channel link.

## Ways in

- [ ] Videos and Search → YouTube channel/video results: the channel name opens its page.
- [ ] Watch, Native: **Channel** opens the video's channel. **Follow** appears when
      the creator is found; hover says whether their profile links back.
- [ ] Watch, web, a post with a YouTube card: after **Subscribe** resolves the channel,
      **Channel** and (when found) **Follow** appear.

## Chapters (S2 follow-up)

- [ ] Native, a Technology Connections video: **Chapters (N)** shows under the player
      without opening anything, marked "made automatically by YouTube".
- [ ] A video whose creator wrote chapters is marked "by the creator".
- [ ] A chapter cues the player there (paused) and is highlighted as current.

## Settings

- [ ] Settings → connections: turn **Wikidata** off. Jeff Geerling's page then finds no
      account; Technology Connections on Native still finds it through the channel.
- [ ] Native: Help → Open logs shows `wikidata_read complete`.

## Findings

_Date, build, what went wrong._
