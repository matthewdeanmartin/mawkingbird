# Mastodon post length and media limits

The usual answer to “How long can a Mastodon post be?” is **500 characters**, but it is a default, not a network-wide promise. Your account's server may allow a different length. The same is true of upload sizes: check the server you are posting from before preparing a large file.

## Text length depends on the server

Mastodon's [posting guide](https://docs.joinmastodon.org/user/posting/) gives 500 characters as the default. Links count as 23 characters regardless of their actual length. If you have several Mastodon accounts, their limits can differ. Mawkingbird reads the connected server's advertised text limit and updates the composer counter; if that information is unavailable, it uses the usual 500-character limit. When you choose **Both** to post to Mastodon and Bluesky, each copy must fit its destination's limit. Bluesky posts allow 300 grapheme clusters.

If a post is too long, shorten it or write a thread. Do not assume that a post which fits on one server will fit on another.

## Images, animation and video

Mastodon's documented defaults, checked on **12 November 2026**, are up to **four images** per post, **16 MB** per image, and **one video** up to **99 MB**. Supported image formats include PNG, JPG, HEIF, WebP and AVIF; video formats include MP4, M4V, MOV and WebM. Animated GIFs have their own 16 MB and dimension limits and are converted for playback. A server can set its own media configuration, so an upload can be rejected even if it meets these general figures. See the [Mastodon attachment guide](https://docs.joinmastodon.org/user/posting/#attachments) and the [server configuration fields](https://docs.joinmastodon.org/entities/Instance/#configuration).

For a post sent to **Both**, Bluesky's limits also apply to its copy. Mawkingbird currently allows up to four Bluesky images or one video, with a 300 MB and 10-minute video ceiling; it checks the chosen attachment and explains if the Bluesky copy cannot include it. Bluesky's [current app limits](https://github.com/bluesky-social/social-app/blob/main/src/lib/constants.ts) specify a 2 MB image size and those video ceilings. Client image processing can differ, so use the message in the composer as the final check for your specific file.

## Before you publish

1. Choose the account and destination in the composer.
2. Watch the character counter and any attachment warning.
3. Add a description to each image or video when it needs one.
4. Check the published post on its destination, especially when sending to two networks.

Next: [Add a photo or other media](media.md), [write useful descriptions](alt-text.md), or [choose where a post is published](destinations.md).
