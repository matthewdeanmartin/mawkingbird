# RSS feeds for Mastodon and Bluesky accounts

You can read public posts from a Mastodon or Bluesky account in an RSS reader without signing in to that network. RSS is useful when you want a reading list alongside news sites and blogs. It is a read-only subscription: it does not follow the person on the social network, and it does not bring private posts, replies or every kind of interaction into your reader.

## Find a Mastodon account's feed

Take the account's public profile address and add `.rss` after the username. For example, the Mastodon project's profile at `https://mastodon.social/@Mastodon` has this feed:

```text
https://mastodon.social/@Mastodon.rss
```

Use the **account's home server** in the address. If a person has the handle `@name@server.example`, their usual profile address is `https://server.example/@name`, and the feed is `https://server.example/@name.rss`. Some servers run different software or restrict public feeds, so try the profile page itself if that address fails.

Mastodon also gives a public hashtag page an RSS feed on a particular server:

```text
https://mastodon.social/tags/mastodon.rss
```

That feed reflects posts the chosen server knows about; it is not a complete archive of every use of the tag across the fediverse. Try a different server when you want its view of the same tag.

## Find a Bluesky account's feed

Open a public Bluesky profile and add `/rss` to its address. For example:

```text
https://bsky.app/profile/bsky.app/rss
```

Replace `bsky.app` in the profile part with the person's handle. A custom-domain handle works the same way. Bluesky's profile page also advertises its RSS link to readers that can discover feeds automatically. RSS gives you public posts; if you want to reply, follow custom feeds or see the social context, use a Bluesky client.

## Add either feed to Mawkingbird

1. Copy the RSS address.
2. Open **RSS** in Mawkingbird and choose **Paste a link**.
3. Paste the address and review the feed Mawkingbird finds before adding it.

The subscription appears with your other RSS feeds. You can manage it like a blog feed, including moving it into a folder or removing it later. Reading the RSS feed does not follow the account on Mastodon or Bluesky. To follow or reply there, connect your account on that network.

The three example feed addresses above returned RSS documents when checked on **12 November 2026**. Feed availability and format are controlled by Mastodon servers and Bluesky, so check the public profile if an example changes. Mastodon's [network guide](https://docs.joinmastodon.org/user/network/) documents RSS on account and tag pages; the [Bluesky example feed](https://bsky.app/profile/bsky.app/rss) is published by Bluesky itself.

Next: [Find sites to read with RSS](../finding-people/rss-discovery.md) or [use Mastodon and Bluesky together](../new-to-mastodon/from-bluesky.md).
