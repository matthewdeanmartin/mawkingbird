# Can you follow Bluesky from Mastodon?

Yes, if the person has enabled a bridge. Mastodon and Bluesky use different protocols, so a normal follow on one network does not reach an account on the other. [Bridgy Fed](https://fed.brid.gy/docs) makes a public account visible across that boundary when its owner opts in.

## What a bridged account looks like

A Bluesky user who enables Bridgy Fed appears to Mastodon as a fediverse account ending in `@bsky.brid.gy`. For example, Bridgy Fed shows the Bluesky handle `@snarfed.bsky.social` as `@snarfed.bsky.social@bsky.brid.gy`. Search for that address from Mastodon and follow the result as you would another fediverse account.

In the other direction, a bridged Mastodon account appears on Bluesky with a handle ending in `.ap.brid.gy`. The visible address is a bridge representation of the person's original account, not a new account they separately maintain there.

## Who has to opt in?

Each person chooses whether Bridgy Fed represents **their own** account on the other network. On Mastodon, following `@bsky.brid.gy@bsky.brid.gy` enables the bridge for your account. On Bluesky, you can enable it at Bridgy Fed or follow `@ap.brid.gy`. You can follow an already bridged person without enabling a representation of your own account, but they may not see your posts or interactions across the bridge. For a two-way conversation, both people generally need to opt in.

If the person you seek has not enabled the bridge, you cannot make their profile appear on your network yourself. Bridgy Fed offers a way to ask them through its bot, leaving the decision with them. Your server may also block the bridge, in which case the bridged address may not appear in search.

## What crosses the bridge?

Bridgy Fed carries fully public posts and supported interactions. It does not copy followers-only posts, private mentions or direct messages. Some formats and controls do not translate cleanly between networks; longer Mastodon posts may be shortened on Bluesky, and a bridge can take time to update. Follow the original post link when its presentation matters.

This describes [Bridgy Fed's documentation](https://fed.brid.gy/docs) as checked on **12 November 2026**. Bridgy Fed is independent of Mawkingbird. If you have an account on each network, [Mawkingbird can read both directly](from-bluesky.md) without representing either account through a bridge.

Next: [Mastodon vs Bluesky](https://mawkingbird.com/compare/mastodon-vs-bluesky/) or [understand handles](../finding-people/profiles-handles.md).
