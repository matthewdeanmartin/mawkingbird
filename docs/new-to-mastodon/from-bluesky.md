# Use Bluesky and Mastodon together

Bluesky and Mastodon are separate networks. Your Bluesky account cannot follow a Mastodon account directly, and the reverse is also true. Mawkingbird lets you keep one account on each and read and post to both from one place.

## Start from the account you already have

**If you use Bluesky,** sign in to Mawkingbird with Bluesky. See [Sign in with Bluesky](../start/sign-in-bluesky.md). Your Bluesky timeline becomes Home.

**If you use Mastodon,** sign in with Mastodon, then add Bluesky under **Settings → Connections → Bluesky**. See [Connect Bluesky](../connections/bluesky.md).

## Try Mastodon without an account

A Bluesky user can read Mastodon before joining it.

1. Open **Settings → Connections → Mastodon**.
2. Choose **Read _server name_ without an account**.

This adds that server's Explore page, trending posts and hashtag timelines. It does not add anyone to Home, because reading without an account has no follow list. When you want Mastodon people in Home, [create a Mastodon account](create-an-account.md) and sign in to it under the same connection page. See [Connect Mastodon](../connections/mastodon.md).

## What Home shows

With both accounts connected, Home combines your Bluesky timeline with your Mastodon Home timeline, newest first. Bluesky posts carry a **🦋 Bluesky** badge. Reply, like and repost act on the network the post came from.

**Notifications** starts on **Both**, mixing the two networks. Choose either network to narrow the list.

## Post to both at once

When both accounts are connected, the writing box offers three destinations: **Fedi** (Mastodon), **Bluesky**, and **Both**. **Both** sends the same post to each network, with some limits:

- The text must fit the shorter of the two limits.
- Images go to both; video and audio may go only to Mastodon.
- Polls and content warnings appear only on the Mastodon copy.
- The Bluesky copy is always public. Do not use **Both** for a followers-only or direct post.
- Scheduling is not available for **Both**.

One copy can succeed while the other fails. Check both profiles before retrying. See [Choose where a post is published](../posting/destinations.md).

## Things that work differently

| Bluesky | Mastodon |
| --- | --- |
| Handle like `name.bsky.social` or your own domain | Handle like `@name@server.example` |
| Custom feeds built by other people | Hashtags you follow, lists and server timelines |
| Posts are public | Posts can be public, unlisted, followers-only or direct |
| Labelers and moderation lists | Your server's moderators, plus your own mutes, blocks and filters |

Both networks have likes, reposts, quotes, replies and image descriptions.

## Bridges

Some people use a bridge service that copies a Bluesky account onto the fediverse, or a Mastodon account onto Bluesky. Bridged accounts look and behave like other accounts, with some delay and missing features. Mawkingbird does not run a bridge; it connects your two real accounts instead.

Next: [Find people to follow](../finding-people/find-people.md).
