# Connect Bluesky

A Bluesky connection merges posts from your Bluesky timeline into Home. You can reply, like, and repost Bluesky posts without leaving Mawkingbird.

## Link the account

1. Open **Settings → Connections → Bluesky**.
2. Choose **Continue with Bluesky**.
3. Sign in on Bluesky's own page with your usual Bluesky login, then approve access.

Bluesky sends you back to the connection page, now linked. Mawkingbird never sees your password, and the link includes your Bluesky direct messages in Chat.

If your account is on a server other than Bluesky's own, open **Use a specific handle or another PDS**, enter your handle, and choose **Continue**.

This also works while browsing anonymously. In that mode you can read and respond to Bluesky posts, but Chat is not available.

## If approval does not work: use an app password

Some self-hosted servers cannot do the approval step yet. Only then, use an app password. Never use your regular Bluesky password.

1. On Bluesky, open **Settings → Privacy and security → App Passwords** and create one.
2. If you want Bluesky direct messages in Mawkingbird Chat, allow direct-message access while creating it.
3. On the connection page, open **Use an app password instead**, enter your handle and the app password, and choose **Link Bluesky**.

## Moderation

Open **Settings → Bluesky moderation**. These settings are saved to your Bluesky account, so bsky.app uses the same ones.

- **Muted words and tags:** posts containing them are collapsed behind a notice you can open. Choose whether to look in text and tags or tags only, for how long, and whether to skip people you follow.
- **Moderation lists:** paste the bsky.app address of a list someone keeps, then mute or block everyone on it.
- **Moderation services:** add a service by its handle. Its labels then apply, and labelled media stays covered.

To stop notifications from a busy thread, open a post's ••• menu and choose **Mute notifications from this thread**.

## Unlink

Return to the connection page and choose **Unlink**. Mawkingbird forgets the Bluesky link in this browser and, for an approved link, asks Bluesky to revoke its access. If you used an app password, also delete it in Bluesky's settings.

Related: [Choose where a post is published](../posting/destinations.md) and [Add or switch accounts](accounts.md).
