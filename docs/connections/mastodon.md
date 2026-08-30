# Connect Mastodon

Use this connection when your main Mawkingbird identity is on Bluesky and you also want to read Mastodon. If you signed in to Mawkingbird with Mastodon, Mastodon is already your account and there is nothing to connect here.

## Read without a Mastodon account

1. Open **Settings → Connections → Mastodon**.
2. Choose **Read _server name_ without an account**.

This adds Explore, trending posts, and hashtag timelines from that server. It does not add followed Mastodon accounts to Home because anonymous reading has no Mastodon follow list.

Choose **Change server** if you want a different server. Different servers can show different public posts and trends.

## Sign in to Mastodon

1. On your Mastodon server, open **Preferences → Development → New application**.
2. Create an access token with the permissions shown in Mawkingbird.
3. In **Settings → Connections → Mastodon**, paste the token under **Sign in**.
4. Choose **Sign in**.

Posts from people you follow on Mastodon can now join your Home feed.

## Sign out or turn it off

Choose **Sign out** to remove the token but keep reading the same server anonymously.

Choose **Disconnect Mastodon** to forget the server and token and remove Mastodon items from the sidebar.

Changing servers also signs you out because a sign-in belongs to one server.

Related: [Connect Bluesky](bluesky.md) and [Understand your Home feed](../reading/home-feed.md).
